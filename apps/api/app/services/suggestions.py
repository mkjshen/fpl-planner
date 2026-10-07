"""Heuristic transfer suggestions — a transparent, hand-tunable formula over
stats already imported from the FPL API, not a trained model (see CLAUDE.md's
non-goals: this app isn't chasing state-of-the-art prediction). Single-swap
only: for each owned player, the best-value same-position replacement
affordable within bank + that player's real sell price, ranked by projected
points over the next HORIZON_GAMEWEEKS gameweeks' fixtures (see
_horizon_projection)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Club, FplTeam, Gameweek, Player
from app.schemas.players import PlayerListItemOut
from app.schemas.suggestions import GameweekProjectionOut, SuggestedTransferOut, SuggestionsOut
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
MAX_SUGGESTIONS = 10
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


async def _owned_slots_and_bank(
    db: AsyncSession, fpl_team: FplTeam, gameweek: Gameweek
) -> tuple[list[Slot], int]:
    plan = await _find_effective_plan(db, fpl_team, gameweek)
    if plan is not None:
        return await _plan_slots(db, plan), plan.bank
    snapshot, slots = await _latest_snapshot_slots(db, fpl_team.id)
    return slots, snapshot.bank


def _to_list_item(player: Player, club: Club) -> PlayerListItemOut:
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

    owned_rows = await db.execute(
        select(Player, Club).join(Club, Player.clubId == Club.id).where(Player.id.in_(owned_ids))
    )
    owned_players = {player.id: (player, club) for player, club in owned_rows.all()}

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

    def projection(player: Player) -> list[float]:
        return _horizon_projection(_player_score(player), difficulties_by_club[player.clubId], gameweek_numbers)

    free_transfers = await available_free_transfers(db, fpl_team, gameweek_number)

    candidates: list[SuggestedTransferOut] = []
    for out_player, out_club in owned_players.values():
        out_projection = projection(out_player)
        out_total = sum(out_projection)
        selling_price = selling_price_by_id[out_player.id]
        budget = bank + selling_price

        best: tuple[float, Player, Club, list[float]] | None = None
        for in_player, in_club in pool_by_position.get(out_player.position.value, []):
            if in_player.currentPrice > budget:
                continue
            # A same-club swap never changes that club's count; only a
            # cross-club swap can push the incoming player's club over the
            # max-3 limit.
            if in_player.clubId != out_player.clubId and club_counts.get(in_player.clubId, 0) >= 3:
                continue
            in_projection = projection(in_player)
            gain = sum(in_projection) - out_total
            if best is None or gain > best[0]:
                best = (gain, in_player, in_club, in_projection)

        if best is None:
            continue
        gain, in_player, in_club, in_projection = best
        if gain < MIN_GAIN_TO_SUGGEST:
            continue
        candidates.append(
            SuggestedTransferOut(
                outPlayer=_to_list_item(out_player, out_club),
                inPlayer=_to_list_item(in_player, in_club),
                outPlayerSellingPrice=selling_price,
                projectedGain=round(gain, 2),
                requiresHit=False,  # finalized below, once ranked
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
        )

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

    return SuggestionsOut(
        suggestions=kept, freeTransfersAvailable=free_transfers, horizonGameweeks=HORIZON_GAMEWEEKS
    )
