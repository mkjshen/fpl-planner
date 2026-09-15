"""Heuristic transfer suggestions — a transparent, hand-tunable formula over
stats already imported from the FPL API, not a trained model (see CLAUDE.md's
non-goals: this app isn't chasing state-of-the-art prediction). Single-swap
only: for each owned player, the best-value same-position replacement
affordable within bank + that player's real sell price."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Club, FplTeam, Gameweek, Player
from app.schemas.players import PlayerListItemOut
from app.schemas.suggestions import SuggestedTransferOut, SuggestionsOut
from app.services.lineup import (
    GameweekNotFoundError,
    Slot,
    _find_effective_plan,
    _latest_snapshot_slots,
    _plan_slots,
    available_free_transfers,
)

FORM_WEIGHT = 0.6
POINTS_PER_GAME_WEIGHT = 0.4
# Below this season-cumulative minutes, form/pointsPerGame are too small a
# sample to trust as an *incoming* signal — excluded outright, not
# discounted (no principled partial credit for a tiny sample). Doesn't gate
# outgoing players: an owned player's low minutes (e.g. from injury) is
# exactly the kind of thing worth suggesting a swap away from.
MIN_RELIABLE_MINUTES = 270
# A suggestion below this projected-points gain isn't worth surfacing even
# when free — avoids noisy near-zero swaps.
MIN_GAIN_TO_SUGGEST = 0.5
# A suggestion beyond this gameweek's free transfers only surfaces if its
# gain clears this bar — a -4 hit pays back in ~3 gameweeks at that rate.
MIN_GAIN_TO_JUSTIFY_HIT = 1.5
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
    """Projected points per gameweek, discounted for availability — the one
    number every candidate is ranked by. Deliberately not `valueSeason`
    (FPL's own points-per-£m): that's a backward-looking season average,
    exactly what blending in recent `form` is meant to improve on.
    `valueSeason` stays untouched as its own sort option in search_players."""
    projected_points = FORM_WEIGHT * player.form + POINTS_PER_GAME_WEIGHT * player.pointsPerGame
    return _availability(player) * projected_points


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

    free_transfers = await available_free_transfers(db, fpl_team, gameweek_number)

    candidates: list[SuggestedTransferOut] = []
    for out_player, out_club in owned_players.values():
        out_score = _player_score(out_player)
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
            gain = _player_score(in_player) - out_score
            if best is None or gain > best[0]:
                best = (gain, in_player, in_club)

        if best is None:
            continue
        gain, in_player, in_club = best
        if gain < MIN_GAIN_TO_SUGGEST:
            continue
        candidates.append(
            SuggestedTransferOut(
                outPlayer=_to_list_item(out_player, out_club),
                inPlayer=_to_list_item(in_player, in_club),
                outPlayerSellingPrice=selling_price,
                projectedGain=round(gain, 2),
                requiresHit=False,  # finalized below, once ranked
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

    return SuggestionsOut(suggestions=kept, freeTransfersAvailable=free_transfers)
