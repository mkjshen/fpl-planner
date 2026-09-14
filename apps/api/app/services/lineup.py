from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    FplTeam,
    Gameweek,
    LineupPlan,
    LineupPlanPlayer,
    Player,
    Season,
    SquadPlayer,
    SquadSnapshot,
)
from app.schemas.lineup import LineupOut, LineupPlayerInput
from app.services.squad import build_player_rows

Slot = tuple[int, bool, int, bool, bool, int, int]
# (playerId, isStarting, squadPosition, isCaptain, isViceCaptain, purchasePrice, sellingPrice)


class LineupValidationError(Exception):
    pass


class GameweekNotFoundError(Exception):
    pass


class NotEditableError(Exception):
    """Raised when trying to save a lineup for the current gameweek or an
    earlier one — those reflect what actually happened, not a plan."""


async def get_current_gameweek(db: AsyncSession) -> Gameweek | None:
    return await db.scalar(select(Gameweek).where(Gameweek.isCurrent == True))  # noqa: E712


async def list_plannable_gameweeks(db: AsyncSession) -> tuple[int | None, list[Gameweek]]:
    current = await get_current_gameweek(db)
    if current is None:
        return None, []
    result = await db.execute(
        select(Gameweek).where(Gameweek.number > current.number).order_by(Gameweek.number)
    )
    return current.number, list(result.scalars().all())


async def _latest_snapshot_slots(
    db: AsyncSession, fpl_team_row_id: str
) -> tuple[SquadSnapshot, list[Slot]]:
    snapshot = await db.scalar(
        select(SquadSnapshot)
        .where(SquadSnapshot.fplTeamId == fpl_team_row_id)
        .order_by(SquadSnapshot.capturedAt.desc())
    )
    if snapshot is None:
        raise LineupValidationError("No squad snapshot yet — import a team first")

    result = await db.execute(select(SquadPlayer).where(SquadPlayer.snapshotId == snapshot.id))
    slots: list[Slot] = [
        (
            sp.playerId,
            sp.isStarting,
            sp.squadPosition,
            sp.isCaptain,
            sp.isViceCaptain,
            sp.purchasePrice,
            sp.sellingPrice,
        )
        for sp in result.scalars().all()
    ]
    return snapshot, slots


async def _find_effective_plan(
    db: AsyncSession, fpl_team: FplTeam, gameweek: Gameweek
) -> LineupPlan | None:
    """The nearest explicit plan at or before this gameweek — an explicit
    edit to an earlier gameweek cascades forward until a later gameweek's
    own explicit edit takes over."""
    return await db.scalar(
        select(LineupPlan)
        .join(Gameweek, LineupPlan.gameweekId == Gameweek.id)
        .where(LineupPlan.fplTeamId == fpl_team.id, Gameweek.number <= gameweek.number)
        .order_by(Gameweek.number.desc())
        .limit(1)
    )


async def _find_prior_plan(
    db: AsyncSession, fpl_team: FplTeam, gameweek: Gameweek
) -> LineupPlan | None:
    """The nearest explicit plan strictly before this gameweek — what a new
    save for this gameweek diffs against (never the plan being overwritten
    at this same gameweek, if one already exists)."""
    return await db.scalar(
        select(LineupPlan)
        .join(Gameweek, LineupPlan.gameweekId == Gameweek.id)
        .where(LineupPlan.fplTeamId == fpl_team.id, Gameweek.number < gameweek.number)
        .order_by(Gameweek.number.desc())
        .limit(1)
    )


async def _plan_slots(db: AsyncSession, plan: LineupPlan) -> list[Slot]:
    result = await db.execute(select(LineupPlanPlayer).where(LineupPlanPlayer.planId == plan.id))
    return [
        (
            lp.playerId,
            lp.isStarting,
            lp.squadPosition,
            lp.isCaptain,
            lp.isViceCaptain,
            lp.purchasePrice,
            lp.sellingPrice,
        )
        for lp in result.scalars().all()
    ]


def _resell_price(purchase_price: int, current_price: int) -> int:
    """FPL's public (community-documented, not officially published)
    sell-price rule: only half of any price rise is realized on sale
    (rounded down to the nearest tenth-of-a-million), while a price drop is
    passed on in full."""
    if current_price > purchase_price:
        return purchase_price + (current_price - purchase_price) // 2
    return current_price


async def available_free_transfers(
    db: AsyncSession, fpl_team: FplTeam, target_gameweek_number: int
) -> int:
    """Free transfers available entering `target_gameweek_number`, walking
    forward from the current gameweek and applying each intervening
    gameweek's planned transfer count (0 for a gameweek with no explicit
    plan) through FPL's real rollover rule.

    Simplification, disclosed in the UI: assumes exactly
    `Season.freeTransferCap` free transfers as of the current gameweek —
    this app doesn't replay the manager's real pre-import transfer
    history, so a manager who legitimately banked transfers before using
    this planner will see a lower count here than the real FPL app."""
    current = await get_current_gameweek(db)
    if current is None:
        return 0
    season = await db.get(Season, current.seasonId)
    if season is None:
        return 0

    result = await db.execute(
        select(Gameweek.number, LineupPlan.transfersMade)
        .join(LineupPlan, LineupPlan.gameweekId == Gameweek.id)
        .where(
            LineupPlan.fplTeamId == fpl_team.id,
            Gameweek.number > current.number,
            Gameweek.number < target_gameweek_number,
        )
    )
    transfers_by_gameweek = dict(result.all())

    available = season.freeTransferCap
    for gw_number in range(current.number + 1, target_gameweek_number):
        made = transfers_by_gameweek.get(gw_number, 0)
        available = min(max(available - made, 0) + 1, season.freeTransferRolloverLimit)
    return available


async def get_lineup(db: AsyncSession, fpl_team: FplTeam, gameweek_number: int) -> LineupOut:
    current = await get_current_gameweek(db)
    gameweek = await db.scalar(select(Gameweek).where(Gameweek.number == gameweek_number))
    if gameweek is None:
        raise GameweekNotFoundError(f"Gameweek {gameweek_number} not found")

    snapshot, actual_slots = await _latest_snapshot_slots(db, fpl_team.id)
    is_editable = current is not None and gameweek.number > current.number

    plan = await _find_effective_plan(db, fpl_team, gameweek) if is_editable else None
    if plan is None:
        slots = actual_slots
        bank = snapshot.bank
        team_value = snapshot.teamValue
        transfer_cost = 0
    else:
        slots = await _plan_slots(db, plan)
        bank = plan.bank
        team_value = plan.teamValue
        transfer_cost = plan.transferCost

    players = await build_player_rows(db, slots)
    free_transfers = (
        await available_free_transfers(db, fpl_team, gameweek_number) if is_editable else 0
    )

    return LineupOut(
        fplTeamId=fpl_team.fplTeamId,
        teamName=fpl_team.teamName,
        managerName=fpl_team.managerName,
        gameweek=gameweek.number,
        isEditable=is_editable,
        bank=bank,
        teamValue=team_value,
        freeTransfers=free_transfers,
        transferCost=transfer_cost,
        players=players,
    )


def _validate_lineup(proposed: list[LineupPlayerInput], positions: dict[int, str]) -> None:
    if len(proposed) != 15:
        raise LineupValidationError("A lineup must have exactly 15 players")

    proposed_ids = {p.playerId for p in proposed}
    if len(proposed_ids) != 15:
        raise LineupValidationError("Duplicate player in lineup")

    if sorted(p.squadPosition for p in proposed) != list(range(1, 16)):
        raise LineupValidationError("squadPosition must be a permutation of 1-15")

    total_counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
    for p in proposed:
        total_counts[positions[p.playerId]] += 1
    if total_counts != {"GK": 2, "DEF": 5, "MID": 5, "FWD": 3}:
        raise LineupValidationError(
            "Squad must have 2 goalkeepers, 5 defenders, 5 midfielders, and 3 forwards"
        )

    starting = [p for p in proposed if p.isStarting]
    if len(starting) != 11:
        raise LineupValidationError("Exactly 11 players must be in the starting lineup")

    counts = {"GK": 0, "DEF": 0, "MID": 0, "FWD": 0}
    for p in starting:
        counts[positions[p.playerId]] += 1
    if counts["GK"] != 1:
        raise LineupValidationError("Starting lineup must have exactly 1 goalkeeper")
    if not (3 <= counts["DEF"] <= 5):
        raise LineupValidationError("Starting lineup must have 3-5 defenders")
    if not (2 <= counts["MID"] <= 5):
        raise LineupValidationError("Starting lineup must have 2-5 midfielders")
    if not (1 <= counts["FWD"] <= 3):
        raise LineupValidationError("Starting lineup must have 1-3 forwards")

    captains = [p for p in proposed if p.isCaptain]
    vice_captains = [p for p in proposed if p.isViceCaptain]
    if len(captains) != 1:
        raise LineupValidationError("Exactly one player must be captain")
    if len(vice_captains) != 1:
        raise LineupValidationError("Exactly one player must be vice-captain")
    if captains[0].playerId == vice_captains[0].playerId:
        raise LineupValidationError("Captain and vice-captain must be different players")
    if not captains[0].isStarting:
        raise LineupValidationError("Captain must be in the starting lineup")
    if not vice_captains[0].isStarting:
        raise LineupValidationError("Vice-captain must be in the starting lineup")


async def save_lineup(
    db: AsyncSession, fpl_team: FplTeam, gameweek_number: int, players: list[LineupPlayerInput]
) -> LineupOut:
    current = await get_current_gameweek(db)
    gameweek = await db.scalar(select(Gameweek).where(Gameweek.number == gameweek_number))
    if gameweek is None:
        raise GameweekNotFoundError(f"Gameweek {gameweek_number} not found")
    if current is None or gameweek.number <= current.number:
        raise NotEditableError("Only future gameweeks can be planned")

    snapshot, actual_slots = await _latest_snapshot_slots(db, fpl_team.id)
    prior_plan = await _find_prior_plan(db, fpl_team, gameweek)
    if prior_plan is None:
        prior_slots = actual_slots
        prior_bank = snapshot.bank
        prior_team_value = snapshot.teamValue
    else:
        prior_slots = await _plan_slots(db, prior_plan)
        prior_bank = prior_plan.bank
        prior_team_value = prior_plan.teamValue

    prior_by_slot = {slot[2]: slot for slot in prior_slots}
    proposed_ids = {p.playerId for p in players}
    prior_ids = {slot[0] for slot in prior_slots}

    player_rows = await db.execute(
        select(Player.id, Player.position, Player.currentPrice, Player.clubId).where(
            Player.id.in_(proposed_ids | prior_ids)
        )
    )
    player_info = {
        player_id: (position.value, current_price, club_id)
        for player_id, position, current_price, club_id in player_rows.all()
    }
    positions = {player_id: info[0] for player_id, info in player_info.items()}

    _validate_lineup(players, positions)

    proposed_by_slot = {p.squadPosition: p for p in players}
    incoming_ids: set[int] = set()
    outgoing_ids: set[int] = set()
    for slot_number in range(1, 16):
        prior_player_id = prior_by_slot[slot_number][0]
        proposed_player_id = proposed_by_slot[slot_number].playerId
        if prior_player_id == proposed_player_id:
            continue
        if positions[proposed_player_id] != positions[prior_player_id]:
            raise LineupValidationError(
                "A transfer must replace a player with one in the same position"
            )
        incoming_ids.add(proposed_player_id)
        outgoing_ids.add(prior_player_id)

    club_counts: dict[int, int] = {}
    for player_id in proposed_ids:
        club_id = player_info[player_id][2]
        club_counts[club_id] = club_counts.get(club_id, 0) + 1
    if any(count > 3 for count in club_counts.values()):
        raise LineupValidationError("A squad can have at most 3 players from the same club")

    spend = sum(player_info[player_id][1] for player_id in incoming_ids)
    proceeds = sum(prior_by_slot[slot][6] for slot in prior_by_slot if prior_by_slot[slot][0] in outgoing_ids)
    new_bank = prior_bank + proceeds - spend
    if new_bank < 0:
        raise LineupValidationError("Not enough bank to make this transfer")

    # Team value = squad current-price value + bank. Buying at current price
    # is value-neutral (cash converts to an asset 1:1), so only the
    # sell-price haircut on outgoing players ever reduces it — never the
    # full current price of whoever was sold.
    outgoing_selling_by_id = {slot[0]: slot[6] for slot in prior_slots}
    outgoing_value_loss = sum(
        player_info[player_id][1] - outgoing_selling_by_id[player_id] for player_id in outgoing_ids
    )
    new_team_value = prior_team_value - outgoing_value_loss

    transfers_made = len(incoming_ids)
    free_transfers = await available_free_transfers(db, fpl_team, gameweek_number)
    transfer_cost = max(transfers_made - free_transfers, 0) * 4

    price_by_id: dict[int, tuple[int, int]] = {}
    for player_id in proposed_ids:
        current_price = player_info[player_id][1]
        if player_id in incoming_ids:
            price_by_id[player_id] = (current_price, current_price)
        else:
            prior_slot = next(slot for slot in prior_slots if slot[0] == player_id)
            purchase_price = prior_slot[5]
            price_by_id[player_id] = (purchase_price, _resell_price(purchase_price, current_price))

    plan = await db.scalar(
        select(LineupPlan).where(
            LineupPlan.fplTeamId == fpl_team.id, LineupPlan.gameweekId == gameweek.id
        )
    )
    if plan is None:
        plan = LineupPlan(fplTeamId=fpl_team.id, gameweekId=gameweek.id)
        db.add(plan)
        await db.flush()

    plan.transfersMade = transfers_made
    plan.transferCost = transfer_cost
    plan.bank = new_bank
    plan.teamValue = new_team_value

    rows = [
        {
            "planId": plan.id,
            "playerId": p.playerId,
            "isStarting": p.isStarting,
            "squadPosition": p.squadPosition,
            "isCaptain": p.isCaptain,
            "isViceCaptain": p.isViceCaptain,
            "purchasePrice": price_by_id[p.playerId][0],
            "sellingPrice": price_by_id[p.playerId][1],
        }
        for p in players
    ]
    stmt = pg_insert(LineupPlanPlayer).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=[LineupPlanPlayer.planId, LineupPlanPlayer.playerId],
        set_={
            "isStarting": stmt.excluded.isStarting,
            "squadPosition": stmt.excluded.squadPosition,
            "isCaptain": stmt.excluded.isCaptain,
            "isViceCaptain": stmt.excluded.isViceCaptain,
            "purchasePrice": stmt.excluded.purchasePrice,
            "sellingPrice": stmt.excluded.sellingPrice,
        },
    )
    await db.execute(stmt)

    # A previous save of this same gameweek may have included players no
    # longer in the proposed 15 (transferred out again since) — plan rows
    # must exactly mirror the current 15, not accumulate stale ones.
    await db.execute(
        delete(LineupPlanPlayer).where(
            LineupPlanPlayer.planId == plan.id, LineupPlanPlayer.playerId.notin_(proposed_ids)
        )
    )

    later_plan_exists = await db.scalar(
        select(Gameweek.number)
        .join(LineupPlan, LineupPlan.gameweekId == Gameweek.id)
        .where(LineupPlan.fplTeamId == fpl_team.id, Gameweek.number > gameweek_number)
        .limit(1)
    )

    await db.commit()

    result = await get_lineup(db, fpl_team, gameweek_number)
    result.laterPlansAffected = later_plan_exists is not None
    return result


async def reset_all_plans(db: AsyncSession, fpl_team: FplTeam) -> None:
    """Discard every explicit lineup edit for this team — LineupPlanPlayer
    rows cascade-delete via the FK, so every future gameweek falls back to
    mirroring the actual squad again."""
    await db.execute(delete(LineupPlan).where(LineupPlan.fplTeamId == fpl_team.id))
    await db.commit()
