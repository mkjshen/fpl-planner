from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ChipUsage,
    ChipWindow,
    FplTeam,
    Gameweek,
    LineupPlan,
    LineupPlanPlayer,
    Player,
    Season,
    SquadPlayer,
    SquadSnapshot,
    TransferHistory,
)
from app.schemas.lineup import ChipWindowOut, LineupOut, LineupPlayerInput
from app.services.squad import build_player_rows

Slot = tuple[int, bool, int, bool, bool, int, int]
# (playerId, isStarting, squadPosition, isCaptain, isViceCaptain, purchasePrice, sellingPrice)

VALID_CHIPS = {"wildcard", "free_hit", "bench_boost", "triple_captain"}
# Wildcard and Free Hit both waive the -4-per-transfer hit for the gameweek
# they're played on — real FPL treats them identically for transfer
# purposes, differing only in whether the resulting squad carries forward
# (Wildcard does, Free Hit reverts — see _find_prior_plan). A same-position
# swap restriction doesn't need waiving here: no such check exists in
# save_lineup — it's algebraically implied by _validate_lineup's fixed
# 2 GK/5 DEF/5 MID/3 FWD composition check and was removed as dead code (see
# save_lineup's comment at the outgoing/incoming diff). What actually limits
# a normal save to one-for-one same-position transfers is the frontend's
# transfer flow, not anything here. Bench Boost and Triple Captain don't
# touch transfers at all; they only affect scoring, which this app doesn't
# simulate, so they're purely a recorded/displayed choice.
TRANSFER_FREE_CHIPS = {"wildcard", "free_hit"}


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
    own explicit edit takes over. A Free Hit plan is the exception: it's
    only ever real for the gameweek it was played on, so it's skipped when
    cascading into a *later* gameweek with no plan of its own (this
    gameweek's own plan is still returned as-is, Free Hit or not)."""
    result = await db.execute(
        select(LineupPlan)
        .join(Gameweek, LineupPlan.gameweekId == Gameweek.id)
        .where(LineupPlan.fplTeamId == fpl_team.id, Gameweek.number <= gameweek.number)
        .order_by(Gameweek.number.desc())
    )
    plans = result.scalars().all()
    if not plans:
        return None
    if plans[0].gameweekId == gameweek.id:
        return plans[0]
    return next((p for p in plans if p.chipUsed != "free_hit"), None)


async def _find_prior_plan(
    db: AsyncSession, fpl_team: FplTeam, gameweek: Gameweek
) -> LineupPlan | None:
    """The nearest explicit plan strictly before this gameweek — what a new
    save for this gameweek diffs against (never the plan being overwritten
    at this same gameweek, if one already exists). Free Hit plans are
    skipped the same way as in _find_effective_plan — a Free Hit squad
    never becomes the baseline for another gameweek's transfers."""
    result = await db.execute(
        select(LineupPlan)
        .join(Gameweek, LineupPlan.gameweekId == Gameweek.id)
        .where(LineupPlan.fplTeamId == fpl_team.id, Gameweek.number < gameweek.number)
        .order_by(Gameweek.number.desc())
    )
    return next((p for p in result.scalars().all() if p.chipUsed != "free_hit"), None)


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


async def _real_transfers_by_gameweek(db: AsyncSession, fpl_team: FplTeam) -> dict[int, int]:
    """How many real FPL transfers the manager actually made in each past
    gameweek, from the imported transfer history — this is real activity
    from before (or outside of) this planner, unlike LineupPlan.transfersMade
    which only covers plans saved here."""
    result = await db.execute(
        select(Gameweek.number, func.count(TransferHistory.id))
        .join(TransferHistory, TransferHistory.gameweekId == Gameweek.id)
        .where(TransferHistory.fplTeamId == fpl_team.id)
        .group_by(Gameweek.number)
    )
    return dict(result.all())


async def _chip_gameweeks(db: AsyncSession, fpl_team: FplTeam) -> set[int]:
    """Gameweeks where a Wildcard or Free Hit was played. Those gameweeks'
    transfers are free and don't touch the free-transfer rollover at all —
    the saved free transfer just carries over unchanged, unlike a normal
    gameweek where it's spent down and/or incremented."""
    result = await db.execute(
        select(Gameweek.number)
        .join(ChipUsage, ChipUsage.gameweekId == Gameweek.id)
        .where(ChipUsage.fplTeamId == fpl_team.id, ChipUsage.chip.in_(["wildcard", "free_hit"]))
    )
    return {row[0] for row in result.all()}


async def available_free_transfers(
    db: AsyncSession, fpl_team: FplTeam, target_gameweek_number: int
) -> int:
    """Free transfers available entering `target_gameweek_number`.

    Replays FPL's real rollover rule (min(cap, max(0, available - made) + 1)
    per gameweek, each Wildcard/Free Hit gameweek left untouched) twice,
    back to back:
    1. From gameweek 2 (free transfers don't exist in gameweek 1 — there's
       no prior squad yet) through the current gameweek, using the
       manager's actual imported transfer history — this is real activity
       from the live FPL API, not assumed.
    2. From the current gameweek through `target_gameweek_number`, using
       this planner's own saved LineupPlan transfer counts (0 for a
       gameweek with no explicit plan)."""
    current = await get_current_gameweek(db)
    if current is None:
        return 0
    season = await db.get(Season, current.seasonId)
    if season is None:
        return 0

    available = season.freeTransferCap
    if current.number > 2:
        real_transfers = await _real_transfers_by_gameweek(db, fpl_team)
        chip_gameweeks = await _chip_gameweeks(db, fpl_team)
        for gw_number in range(2, current.number):
            if gw_number in chip_gameweeks:
                continue
            made = real_transfers.get(gw_number, 0)
            available = min(max(available - made, 0) + 1, season.freeTransferRolloverLimit)

    result = await db.execute(
        select(Gameweek.number, LineupPlan.transfersMade, LineupPlan.chipUsed)
        .join(LineupPlan, LineupPlan.gameweekId == Gameweek.id)
        .where(
            LineupPlan.fplTeamId == fpl_team.id,
            Gameweek.number > current.number,
            Gameweek.number < target_gameweek_number,
        )
    )
    plans_by_gameweek = {row[0]: (row[1], row[2]) for row in result.all()}

    for gw_number in range(current.number + 1, target_gameweek_number):
        made, chip_used = plans_by_gameweek.get(gw_number, (0, None))
        if chip_used in TRANSFER_FREE_CHIPS:
            continue
        available = min(max(available - made, 0) + 1, season.freeTransferRolloverLimit)
    return available


async def _chip_windows(db: AsyncSession, season_id: str) -> dict[str, list[tuple[int, int]]]:
    """Every usable gameweek window each chip has this season, keyed by
    chip name, sorted earliest-first. Real FPL gives each chip exactly two:
    first half and second half — but nothing here assumes that count or
    where the halves split; it's whatever the FPL bootstrap API's chips
    list said at the last import (see _upsert_chip_windows)."""
    result = await db.execute(
        select(ChipWindow.chip, ChipWindow.startEvent, ChipWindow.stopEvent)
        .where(ChipWindow.seasonId == season_id)
        .order_by(ChipWindow.startEvent)
    )
    windows: dict[str, list[tuple[int, int]]] = {}
    for chip, start, stop in result.all():
        windows.setdefault(chip, []).append((start, stop))
    return windows


def _window_for_gameweek(
    windows: list[tuple[int, int]], gameweek_number: int
) -> tuple[int, int] | None:
    return next((w for w in windows if w[0] <= gameweek_number <= w[1]), None)


async def _chip_usage_events(db: AsyncSession, fpl_team: FplTeam) -> list[tuple[str, int]]:
    """(chip, gameweekNumber) for every time this chip has been spent —
    real history, or another gameweek's currently-planned usage (a chip
    window is single-use across all of a team's saved plans, same as real
    FPL only lets you play each window once)."""
    real = await db.execute(
        select(ChipUsage.chip, Gameweek.number)
        .join(Gameweek, ChipUsage.gameweekId == Gameweek.id)
        .where(ChipUsage.fplTeamId == fpl_team.id)
    )
    planned = await db.execute(
        select(LineupPlan.chipUsed, Gameweek.number)
        .join(Gameweek, LineupPlan.gameweekId == Gameweek.id)
        .where(LineupPlan.fplTeamId == fpl_team.id, LineupPlan.chipUsed.isnot(None))
    )
    return list(real.all()) + list(planned.all())


async def chip_window_statuses(
    db: AsyncSession, fpl_team: FplTeam, season_id: str, current_gameweek_number: int
) -> dict[str, list[ChipWindowOut]]:
    """Every chip window this season offers, each labeled "used" (spent —
    including whichever gameweek is being viewed right now, if it has one
    active; callers comparing against `chipUsed`, as the planner UI does,
    should treat "selected here" as always allowed regardless), "expired"
    (never used and its stopEvent has already passed — lost, same as a real
    unused chip window not rolling into the next one), or "available"."""
    windows = await _chip_windows(db, season_id)
    events = await _chip_usage_events(db, fpl_team)
    statuses: dict[str, list[ChipWindowOut]] = {}
    for chip, ranges in windows.items():
        chip_gameweeks = [gw for used_chip, gw in events if used_chip == chip]
        chip_statuses = []
        for start, stop in ranges:
            if any(start <= gw <= stop for gw in chip_gameweeks):
                status = "used"
            elif stop < current_gameweek_number:
                status = "expired"
            else:
                status = "available"
            chip_statuses.append(ChipWindowOut(startEvent=start, stopEvent=stop, status=status))
        statuses[chip] = chip_statuses
    return statuses


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
        chip_used = None
    else:
        slots = await _plan_slots(db, plan)
        bank = plan.bank
        team_value = plan.teamValue
        transfer_cost = plan.transferCost
        # Only report a chip when this is the gameweek's *own* saved plan —
        # a cascaded earlier plan's chip (Bench Boost, say) never applies to
        # a later gameweek it just happens to still be supplying the squad
        # for.
        chip_used = plan.chipUsed if plan.gameweekId == gameweek.id else None

    players = await build_player_rows(
        db, slots, gameweek.id, is_current_gameweek=current is not None and gameweek.id == current.id
    )
    free_transfers = (
        await available_free_transfers(db, fpl_team, gameweek_number) if is_editable else 0
    )
    chip_windows = (
        await chip_window_statuses(db, fpl_team, current.seasonId, current.number) if current else {}
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
        chipUsed=chip_used,
        chipWindows=chip_windows,
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
    db: AsyncSession,
    fpl_team: FplTeam,
    gameweek_number: int,
    players: list[LineupPlayerInput],
    chip: str | None = None,
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

    # Checked after squad-shape validation, not before: a request that's
    # both structurally invalid and over its chip budget should report the
    # more fundamental error, not an incidental one about chip allowance.
    if chip is not None:
        chip_label = chip.replace("_", " ")
        if chip not in VALID_CHIPS:
            raise LineupValidationError(f"Unknown chip: {chip}")
        season = await db.get(Season, current.seasonId)
        if season is None or chip not in season.chipsAvailable:
            raise LineupValidationError(f"{chip_label} isn't offered this season")
        windows = await _chip_windows(db, season.id)
        window = _window_for_gameweek(windows.get(chip, []), gameweek_number)
        if window is None:
            raise LineupValidationError(
                f"{chip_label} can't be used in gameweek {gameweek_number} — outside its usage "
                "window this season"
            )
        existing_chip = await db.scalar(
            select(LineupPlan.chipUsed).where(
                LineupPlan.fplTeamId == fpl_team.id, LineupPlan.gameweekId == gameweek.id
            )
        )
        if chip != existing_chip:
            events = await _chip_usage_events(db, fpl_team)
            start, stop = window
            if any(used_chip == chip and start <= gw <= stop for used_chip, gw in events):
                raise LineupValidationError(
                    f"No {chip_label} uses left for gameweeks {start}-{stop}"
                )

    # A transfer is about squad *membership*, not which numbered slot a
    # player sits in — comparing prior_slots to `players` slot-by-slot
    # would also flag a pure substitution (starting XI <-> bench, which
    # reassigns squadPosition between two players already on the squad) as
    # if it were a transfer. Only players who actually left or joined the
    # 15 count.
    outgoing_ids = prior_ids - proposed_ids
    incoming_ids = proposed_ids - prior_ids

    # No separate "must replace with the same position" check is needed
    # here: _validate_lineup above already requires the proposed 15 to be
    # exactly 2 GK/5 DEF/5 MID/3 FWD, and the prior squad satisfies the same
    # invariant by construction — so outgoing and incoming players already
    # match position-for-position in aggregate, algebraically, no matter how
    # many players changed in this save. What actually gated a same-position
    # transfer-planner UI down to one-for-one swaps was the frontend's
    # transfer flow, not this. A Wildcard/Free Hit-driven full squad rebuild
    # (arbitrarily many simultaneous swaps) was already legal backend-side.

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
        raise LineupValidationError("You don't have enough funds to make this transfer")

    # Team value = squad current-price value only (bank is cash, tracked
    # separately). A transfer removes each outgoing player's current price
    # and adds each incoming player's — `spend` already is exactly that sum
    # for incoming, since it's also priced at currentPrice.
    outgoing_current_value = sum(player_info[player_id][1] for player_id in outgoing_ids)
    new_team_value = prior_team_value - outgoing_current_value + spend

    transfers_made = len(incoming_ids)
    if chip in TRANSFER_FREE_CHIPS:
        transfer_cost = 0
    else:
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
    plan.chipUsed = chip
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
