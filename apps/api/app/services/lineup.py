from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    FplTeam,
    Gameweek,
    LineupPlan,
    LineupPlanPlayer,
    Player,
    SquadPlayer,
    SquadSnapshot,
)
from app.schemas.lineup import LineupOut, LineupPlayerInput
from app.services.squad import build_player_rows


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
) -> tuple[SquadSnapshot, list[tuple[int, bool, int, bool, bool]]]:
    snapshot = await db.scalar(
        select(SquadSnapshot)
        .where(SquadSnapshot.fplTeamId == fpl_team_row_id)
        .order_by(SquadSnapshot.capturedAt.desc())
    )
    if snapshot is None:
        raise LineupValidationError("No squad snapshot yet — import a team first")

    result = await db.execute(select(SquadPlayer).where(SquadPlayer.snapshotId == snapshot.id))
    slots = [
        (sp.playerId, sp.isStarting, sp.squadPosition, sp.isCaptain, sp.isViceCaptain)
        for sp in result.scalars().all()
    ]
    return snapshot, slots


async def get_lineup(db: AsyncSession, fpl_team: FplTeam, gameweek_number: int) -> LineupOut:
    current = await get_current_gameweek(db)
    gameweek = await db.scalar(select(Gameweek).where(Gameweek.number == gameweek_number))
    if gameweek is None:
        raise GameweekNotFoundError(f"Gameweek {gameweek_number} not found")

    snapshot, actual_slots = await _latest_snapshot_slots(db, fpl_team.id)
    is_editable = current is not None and gameweek.number > current.number

    if not is_editable:
        slots = actual_slots
    else:
        plan = await _find_effective_plan(db, fpl_team, gameweek)
        if plan is None:
            # No explicit edit anywhere at or before this gameweek yet —
            # mirror the actual squad, same as the non-editable branch.
            slots = actual_slots
        else:
            result = await db.execute(
                select(LineupPlanPlayer).where(LineupPlanPlayer.planId == plan.id)
            )
            slots = [
                (lp.playerId, lp.isStarting, lp.squadPosition, lp.isCaptain, lp.isViceCaptain)
                for lp in result.scalars().all()
            ]

    players = await build_player_rows(db, slots)

    return LineupOut(
        fplTeamId=fpl_team.fplTeamId,
        teamName=fpl_team.teamName,
        managerName=fpl_team.managerName,
        gameweek=gameweek.number,
        isEditable=is_editable,
        bank=snapshot.bank,
        teamValue=snapshot.teamValue,
        players=players,
    )


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


def _validate_lineup(
    proposed: list[LineupPlayerInput], actual_player_ids: set[int], positions: dict[int, str]
) -> None:
    if len(proposed) != 15:
        raise LineupValidationError("A lineup must have exactly 15 players")

    proposed_ids = {p.playerId for p in proposed}
    if len(proposed_ids) != 15:
        raise LineupValidationError("Duplicate player in lineup")
    if proposed_ids != actual_player_ids:
        raise LineupValidationError(
            "Lineup must contain exactly the 15 players already in the squad"
        )

    if sorted(p.squadPosition for p in proposed) != list(range(1, 16)):
        raise LineupValidationError("squadPosition must be a permutation of 1-15")

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

    _, actual_slots = await _latest_snapshot_slots(db, fpl_team.id)
    actual_player_ids = {slot[0] for slot in actual_slots}

    player_rows = await db.execute(
        select(Player.id, Player.position).where(Player.id.in_(actual_player_ids))
    )
    positions = {player_id: position.value for player_id, position in player_rows.all()}

    _validate_lineup(players, actual_player_ids, positions)

    plan = await db.scalar(
        select(LineupPlan).where(
            LineupPlan.fplTeamId == fpl_team.id, LineupPlan.gameweekId == gameweek.id
        )
    )
    if plan is None:
        plan = LineupPlan(fplTeamId=fpl_team.id, gameweekId=gameweek.id)
        db.add(plan)
        await db.flush()

    rows = [
        {
            "planId": plan.id,
            "playerId": p.playerId,
            "isStarting": p.isStarting,
            "squadPosition": p.squadPosition,
            "isCaptain": p.isCaptain,
            "isViceCaptain": p.isViceCaptain,
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
        },
    )
    await db.execute(stmt)
    await db.commit()

    return await get_lineup(db, fpl_team, gameweek_number)


async def reset_all_plans(db: AsyncSession, fpl_team: FplTeam) -> None:
    """Discard every explicit lineup edit for this team — LineupPlanPlayer
    rows cascade-delete via the FK, so every future gameweek falls back to
    mirroring the actual squad again."""
    await db.execute(delete(LineupPlan).where(LineupPlan.fplTeamId == fpl_team.id))
    await db.commit()
