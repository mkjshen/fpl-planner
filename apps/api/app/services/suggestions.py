"""Heuristic transfer suggestions — a transparent, hand-tunable formula over
stats already imported from the FPL API, not a trained model (see CLAUDE.md's
non-goals: this app isn't chasing state-of-the-art prediction). Single-swap
only: for each owned player, the best-value same-position replacement
affordable within bank + that player's real sell price, ranked by projected
points over the next HORIZON_GAMEWEEKS gameweeks' fixtures (see
_horizon_projection), counted only as much as the outgoing player's squad
slot counts (see _slot_weight: a benched player's points mostly don't)."""

import asyncio
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Club, FplTeam, Gameweek, Player
from app.schemas.players import PlayerListItemOut
from app.schemas.suggestions import (
    GameweekProjectionOut,
    SuggestedTransferOut,
    SuggestionsOut,
    TransferCombinationOut,
)
from app.services.lineup import (
    GameweekNotFoundError,
    Slot,
    _find_effective_plan,
    _latest_snapshot_slots,
    _plan_slots,
    available_free_transfers,
)
from app.services.fixtures import upcoming_difficulty
from app.services.price_trends import price_direction
from app.services.squad import _opponent_strings
from app.services.transfer_optimizer import OwnedOption, PoolOption, TransferSet, best_transfer_set

FORM_WEIGHT = 0.6
POINTS_PER_GAME_WEIGHT = 0.4
# Below this season-cumulative minutes, form/pointsPerGame are too small a
# sample to trust as an *incoming* signal — excluded outright, not
# discounted (no principled partial credit for a tiny sample). Doesn't gate
# outgoing players: an owned player's low minutes (e.g. from injury) is
# exactly the kind of thing worth suggesting a swap away from.
MIN_RELIABLE_MINUTES = 270
# How many gameweeks (starting with the one being planned) a suggestion's
# projected gain is summed over.
HORIZON_GAMEWEEKS = 5
# Each gameweek further out counts for this fraction of the one before —
# form is a recent-past signal, so it says less about gameweek 5 than
# gameweek 1 (weights 1, 0.85, 0.72, 0.61, 0.52).
HORIZON_DECAY = 0.85
# FPL's own 1 (easiest) - 5 (hardest) fixture rating -> a multiplier on a
# player's per-gameweek projection. Symmetric around an average (3) fixture;
# hand-picked, not fitted to past results.
DIFFICULTY_MULTIPLIER = {1: 1.3, 2: 1.15, 3: 1.0, 4: 0.85, 5: 0.7}
# A suggestion below this projected-points gain (summed over the horizon)
# isn't worth surfacing even when free — avoids noisy near-zero swaps.
MIN_GAIN_TO_SUGGEST = 2.0
# Now that projectedGain is points over the whole horizon rather than per
# gameweek, a -4 hit is directly comparable to it: a suggestion beyond this
# gameweek's free transfers must beat the hit itself, plus the same margin
# a free one needs.
HIT_COST = 4
MIN_GAIN_TO_JUSTIFY_HIT = HIT_COST + MIN_GAIN_TO_SUGGEST
# The most hits the best-combination solve may take. Each hit only has to
# beat a 5-gameweek projection built from noisy form stats, and with 15
# players to choose from the solver can always find enough apparent gains to
# justify one more — uncapped, it recommended 9 transfers for -24 on a real
# squad. A squad that needs more than -8 of changes is what a Wildcard is for.
MAX_HITS_IN_COMBINATION = 2
MAX_SUGGESTIONS = 10
# How much a squad slot's points count toward a transfer's gain. A starter's
# points all count; a bench player's only count when an auto-sub brings them
# on, which happens a minority of the time for outfield subs and almost never
# for the bench goalkeeper (only when the starting keeper doesn't play). Hand
# picked, like the rest of this formula. Without this, swapping a benched
# keeper scored the same as upgrading a starter (+25 "points" for a player
# who would almost never play).
STARTER_WEIGHT = 1.0
BENCH_OUTFIELD_WEIGHT = 0.15
BENCH_GOALKEEPER_WEIGHT = 0.05
UNAVAILABLE_STATUSES = ("i", "s", "u")
DOUBTFUL_STATUS = "d"


def _availability(player: Player) -> float:
    if player.status in UNAVAILABLE_STATUSES:
        return 0.0
    if player.chanceOfPlayingNextRound is not None:
        return player.chanceOfPlayingNextRound / 100
    if player.status == DOUBTFUL_STATUS:
        return 0.75
    return 1.0


def _player_score(player: Player) -> float:
    """Projected points for one average-difficulty fixture, discounted for
    availability — the base that _horizon_projection scales per fixture.
    Deliberately not `valueSeason`
    (FPL's own points-per-£m): that's a backward-looking season average,
    exactly what blending in recent `form` is meant to improve on.
    `valueSeason` stays untouched as its own sort option in search_players."""
    projected_points = FORM_WEIGHT * player.form + POINTS_PER_GAME_WEIGHT * player.pointsPerGame
    return _availability(player) * projected_points


def _horizon_projection(
    base_score: float, difficulties_by_gameweek: dict[int, list[int]], gameweek_numbers: list[int]
) -> list[float]:
    """Projected points for each gameweek in `gameweek_numbers`: the base
    score scaled by each fixture's difficulty multiplier and summed (so a
    double gameweek counts both fixtures, a blank counts 0), then
    down-weighted by HORIZON_DECAY per gameweek out. Availability is
    already baked into `base_score` and applied to every gameweek alike —
    FPL only reports chance of playing for the next round, so there's no
    principled way to guess when an injured player returns."""
    projection = []
    for offset, gameweek_number in enumerate(gameweek_numbers):
        multipliers = sum(DIFFICULTY_MULTIPLIER[d] for d in difficulties_by_gameweek.get(gameweek_number, []))
        projection.append(base_score * multipliers * HORIZON_DECAY**offset)
    return projection


def _to_gameweek_projections(
    gameweek_numbers: list[int],
    out_difficulties: dict[int, list[int]],
    in_difficulties: dict[int, list[int]],
    out_projection: list[float],
    in_projection: list[float],
) -> list[GameweekProjectionOut]:
    return [
        GameweekProjectionOut(
            gameweekNumber=gameweek_number,
            outDifficulties=out_difficulties.get(gameweek_number, []),
            inDifficulties=in_difficulties.get(gameweek_number, []),
            outProjectedPoints=round(out_points, 2),
            inProjectedPoints=round(in_points, 2),
        )
        for gameweek_number, out_points, in_points in zip(gameweek_numbers, out_projection, in_projection)
    ]


def _slot_weight(is_starting: bool, position: str) -> float:
    if is_starting:
        return STARTER_WEIGHT
    return BENCH_GOALKEEPER_WEIGHT if position == "GK" else BENCH_OUTFIELD_WEIGHT


async def _owned_slots_and_bank(
    db: AsyncSession, fpl_team: FplTeam, gameweek: Gameweek
) -> tuple[list[Slot], int]:
    plan = await _find_effective_plan(db, fpl_team, gameweek)
    if plan is not None:
        return await _plan_slots(db, plan), plan.bank
    snapshot, slots = await _latest_snapshot_slots(db, fpl_team.id)
    return slots, snapshot.bank


def _to_list_item(player: Player, club: Club, opponent: str | None = None) -> PlayerListItemOut:
    return PlayerListItemOut(
        playerId=player.id,
        webName=player.webName,
        position=player.position.value,
        club=club.shortName,
        clubCode=club.code,
        currentPrice=player.currentPrice,
        status=player.status,
        form=player.form,
        totalPoints=player.totalPoints,
        pointsPerGame=player.pointsPerGame,
        ictIndex=player.ictIndex,
        valueSeason=player.valueSeason,
        selectedByPercent=player.selectedByPercent,
        opponent=opponent,
    )


async def suggest_transfers(
    db: AsyncSession, fpl_team: FplTeam, gameweek_number: int, limit: int = MAX_SUGGESTIONS
) -> SuggestionsOut:
    gameweek = await db.scalar(select(Gameweek).where(Gameweek.number == gameweek_number))
    if gameweek is None:
        raise GameweekNotFoundError(f"Gameweek {gameweek_number} not found")

    owned_slots, bank = await _owned_slots_and_bank(db, fpl_team, gameweek)
    owned_ids = {slot[0] for slot in owned_slots}
    selling_price_by_id = {slot[0]: slot[6] for slot in owned_slots}
    is_starting_by_id = {slot[0]: slot[1] for slot in owned_slots}

    owned_rows = await db.execute(
        select(Player, Club).join(Club, Player.clubId == Club.id).where(Player.id.in_(owned_ids))
    )
    owned_players = {player.id: (player, club) for player, club in owned_rows.all()}
    weight_by_id = {
        player.id: _slot_weight(is_starting_by_id[player.id], player.position.value)
        for player, _ in owned_players.values()
    }

    club_counts: dict[int, int] = {}
    for player, _ in owned_players.values():
        club_counts[player.clubId] = club_counts.get(player.clubId, 0) + 1

    pool_rows = await db.execute(
        select(Player, Club)
        .join(Club, Player.clubId == Club.id)
        .where(
            Player.id.notin_(owned_ids),
            Player.status.notin_(UNAVAILABLE_STATUSES),
            Player.minutes >= MIN_RELIABLE_MINUTES,
        )
    )
    pool_by_position: dict[str, list[tuple[Player, Club]]] = {}
    for player, club in pool_rows.all():
        pool_by_position.setdefault(player.position.value, []).append((player, club))

    # Gameweeks past the end of the season simply have no fixtures, so they
    # project as 0 for every player alike rather than needing a clamp here.
    gameweek_numbers = list(range(gameweek_number, gameweek_number + HORIZON_GAMEWEEKS))
    club_ids = {player.clubId for player, _ in owned_players.values()} | {
        player.clubId for candidates in pool_by_position.values() for player, _ in candidates
    }
    difficulties_by_club = await upcoming_difficulty(db, club_ids, gameweek_number, HORIZON_GAMEWEEKS)
    opponents, _ = await _opponent_strings(db, gameweek.id, club_ids)

    # Computed once per player up front — both the greedy list and the
    # combination solve below read every player's projection repeatedly.
    projections = {
        player.id: _horizon_projection(_player_score(player), difficulties_by_club[player.clubId], gameweek_numbers)
        for player, _ in [
            *owned_players.values(),
            *(row for candidates in pool_by_position.values() for row in candidates),
        ]
    }

    def gain(out_player: Player, in_player: Player) -> float:
        """The incoming player's projected points minus the outgoing
        player's over the horizon, scaled by the outgoing player's slot."""
        difference = sum(projections[in_player.id]) - sum(projections[out_player.id])
        return difference * weight_by_id[out_player.id]

    def to_suggestion(out_player: Player, out_club: Club, in_player: Player, in_club: Club) -> SuggestedTransferOut:
        out_projection, in_projection = projections[out_player.id], projections[in_player.id]
        total = gain(out_player, in_player)
        return SuggestedTransferOut(
            outPlayer=_to_list_item(out_player, out_club, opponents.get(out_player.clubId)),
            inPlayer=_to_list_item(in_player, in_club, opponents.get(in_player.clubId)),
            outPlayerSellingPrice=selling_price_by_id[out_player.id],
            projectedGain=round(total, 2),
            projectedGainPerGameweek=round(total / HORIZON_GAMEWEEKS, 2),
            outPlayerStarting=is_starting_by_id[out_player.id],
            requiresHit=False,  # set by the caller, once ranked
            outPlayerPriceDirection=price_direction(out_player.costChangeEvent),
            inPlayerPriceDirection=price_direction(in_player.costChangeEvent),
            gameweekProjections=_to_gameweek_projections(
                gameweek_numbers,
                difficulties_by_club[out_player.clubId],
                difficulties_by_club[in_player.clubId],
                out_projection,
                in_projection,
            ),
        )

    free_transfers = await available_free_transfers(db, fpl_team, gameweek_number)

    candidates: list[SuggestedTransferOut] = []
    for out_player, out_club in owned_players.values():
        selling_price = selling_price_by_id[out_player.id]
        budget = bank + selling_price

        best: tuple[float, Player, Club] | None = None
        for in_player, in_club in pool_by_position.get(out_player.position.value, []):
            if in_player.currentPrice > budget:
                continue
            # A same-club swap never changes that club's count; only a
            # cross-club swap can push the incoming player's club over the
            # max-3 limit.
            if in_player.clubId != out_player.clubId and club_counts.get(in_player.clubId, 0) >= 3:
                continue
            swap_gain = gain(out_player, in_player)
            if best is None or swap_gain > best[0]:
                best = (swap_gain, in_player, in_club)

        if best is None:
            continue
        best_gain, in_player, in_club = best
        if best_gain < MIN_GAIN_TO_SUGGEST:
            continue
        candidates.append(to_suggestion(out_player, out_club, in_player, in_club))

    candidates.sort(key=lambda c: c.projectedGain, reverse=True)

    # Each owned player's search picks its own independent best replacement,
    # so the same standout pool player can end up as the top candidate for
    # several different owned players (observed directly when this was first
    # tested live — one player suggested as the incoming side three times).
    # That's fine as three independent hypothetical swaps, but wrong as a
    # single list: only one of them could actually be bought. Once a pool
    # player has been used as an incoming suggestion, later, weaker
    # suggestions of the same player are dropped rather than shown as
    # separate options.
    kept: list[SuggestedTransferOut] = []
    suggested_in_player_ids: set[int] = set()
    for candidate in candidates:
        if candidate.inPlayer.playerId in suggested_in_player_ids:
            continue
        requires_hit = len(kept) >= free_transfers
        if requires_hit and candidate.projectedGain < MIN_GAIN_TO_JUSTIFY_HIT:
            continue
        candidate.requiresHit = requires_hit
        kept.append(candidate)
        suggested_in_player_ids.add(candidate.inPlayer.playerId)
        if len(kept) >= limit:
            break

    pool_players = {player.id: (player, club) for rows in pool_by_position.values() for player, club in rows}
    transfer_set = await asyncio.to_thread(
        best_transfer_set,
        owned=[
            OwnedOption(
                player_id=player.id,
                position=player.position.value,
                club_id=player.clubId,
                selling_price=selling_price_by_id[player.id],
                projected_points=sum(projections[player.id]),
                weight=weight_by_id[player.id],
            )
            for player, _ in owned_players.values()
        ],
        pool=[
            PoolOption(
                player_id=player.id,
                position=player.position.value,
                club_id=player.clubId,
                price=player.currentPrice,
                projected_points=sum(projections[player.id]),
            )
            for player, _ in pool_players.values()
        ],
        bank=bank,
        free_transfers=free_transfers,
        # The same bars the greedy list uses: every transfer must earn
        # MIN_GAIN_TO_SUGGEST, and every hit must also earn back its -4.
        transfer_margin=MIN_GAIN_TO_SUGGEST,
        hit_cost=HIT_COST,
        max_hits=MAX_HITS_IN_COMBINATION,
    )

    return SuggestionsOut(
        suggestions=kept,
        freeTransfersAvailable=free_transfers,
        horizonGameweeks=HORIZON_GAMEWEEKS,
        bestCombination=_to_combination(transfer_set, owned_players, pool_players, free_transfers, to_suggestion),
    )


def _to_combination(
    transfer_set: TransferSet | None,
    owned_players: dict[int, tuple[Player, Club]],
    pool_players: dict[int, tuple[Player, Club]],
    free_transfers: int,
    to_suggestion: Callable[[Player, Club, Player, Club], SuggestedTransferOut],
) -> TransferCombinationOut | None:
    """The solver's chosen set as API output, best pair first — the ones
    past the free allowance are the hits, matching how `suggestions` labels
    rank order."""
    if transfer_set is None or not transfer_set.pairs:
        return None
    transfers = sorted(
        (to_suggestion(*owned_players[out_id], *pool_players[in_id]) for out_id, in_id in transfer_set.pairs),
        key=lambda t: t.projectedGain,
        reverse=True,
    )
    for index, transfer in enumerate(transfers):
        transfer.requiresHit = index >= free_transfers
    total_gain = sum(t.projectedGain for t in transfers)
    net_gain = total_gain - HIT_COST * transfer_set.hits
    return TransferCombinationOut(
        transfers=transfers,
        totalProjectedGain=round(total_gain, 2),
        hits=transfer_set.hits,
        netProjectedGain=round(net_gain, 2),
        netProjectedGainPerGameweek=round(net_gain / HORIZON_GAMEWEEKS, 2),
    )
