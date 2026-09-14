"""Team import and squad view endpoints.

Trust note: this router takes `userId` directly from the caller instead of
verifying a session itself. That's only safe because FastAPI isn't exposed
to the browser — Next.js validates the NextAuth session server-side and
calls this service internally. This would need real service-to-service auth
before FastAPI is reachable from anywhere but the Next.js server.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.db.models import FplTeam, Gameweek, SquadPlayer, SquadSnapshot
from app.schemas.lineup import (
    GameweekOut,
    LineupOut,
    LineupUpdateRequest,
    PlannableGameweeksOut,
)
from app.schemas.squad import ImportTeamRequest, SquadOut
from app.services import lineup as lineup_service
from app.services.fpl_client import FplTeamNotFoundError
from app.services.importer import import_team
from app.services.squad import build_player_rows

router = APIRouter(prefix="/teams", tags=["teams"])


@router.post("/import", response_model=SquadOut)
async def import_fpl_team(
    payload: ImportTeamRequest, db: AsyncSession = Depends(get_db)
) -> SquadOut:
    try:
        fpl_team = await import_team(db, payload.userId, payload.fplTeamId)
    except FplTeamNotFoundError:
        raise HTTPException(status_code=404, detail=f"FPL team {payload.fplTeamId} not found")

    return await _load_squad(db, fpl_team.id)


@router.get("/by-user/{user_id}/squad", response_model=SquadOut)
async def get_squad_for_user(user_id: str, db: AsyncSession = Depends(get_db)) -> SquadOut:
    """Convenience lookup for callers that don't know the linked FPL team ID
    yet — assumes one linked team per user, which matches the current UI.

    Registered before /{user_id}/{fpl_team_id}/squad: FastAPI/Starlette
    matches routes in registration order by path shape alone, so the
    generic two-segment route below would otherwise shadow this one
    (matching "by-user" as user_id) and fail int-converting the id.
    """
    fpl_team = await _get_fpl_team_or_404(db, user_id)
    return await _load_squad(db, fpl_team.id)


@router.get("/by-user/{user_id}/gameweeks", response_model=PlannableGameweeksOut)
async def get_plannable_gameweeks(
    user_id: str, db: AsyncSession = Depends(get_db)
) -> PlannableGameweeksOut:
    await _get_fpl_team_or_404(db, user_id)
    current_number, gameweeks = await lineup_service.list_plannable_gameweeks(db)
    return PlannableGameweeksOut(
        currentGameweek=current_number,
        plannable=[
            GameweekOut(
                number=gw.number,
                deadlineTime=gw.deadlineTime,
                isCurrent=gw.isCurrent,
                isNext=gw.isNext,
                isFinished=gw.isFinished,
            )
            for gw in gameweeks
        ],
    )


@router.get("/by-user/{user_id}/lineup/{gameweek_number}", response_model=LineupOut)
async def get_lineup(
    user_id: str, gameweek_number: int, db: AsyncSession = Depends(get_db)
) -> LineupOut:
    fpl_team = await _get_fpl_team_or_404(db, user_id)
    try:
        return await lineup_service.get_lineup(db, fpl_team, gameweek_number)
    except lineup_service.GameweekNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except lineup_service.LineupValidationError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.put("/by-user/{user_id}/lineup/{gameweek_number}", response_model=LineupOut)
async def put_lineup(
    user_id: str,
    gameweek_number: int,
    payload: LineupUpdateRequest,
    db: AsyncSession = Depends(get_db),
) -> LineupOut:
    fpl_team = await _get_fpl_team_or_404(db, user_id)
    try:
        return await lineup_service.save_lineup(
            db, fpl_team, gameweek_number, payload.players, payload.chip
        )
    except lineup_service.GameweekNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))
    except lineup_service.NotEditableError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except lineup_service.LineupValidationError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.delete("/by-user/{user_id}/lineup", status_code=204)
async def reset_all_plans(user_id: str, db: AsyncSession = Depends(get_db)) -> None:
    fpl_team = await _get_fpl_team_or_404(db, user_id)
    await lineup_service.reset_all_plans(db, fpl_team)


@router.get("/{user_id}/{fpl_team_id}/squad", response_model=SquadOut)
async def get_squad(
    user_id: str, fpl_team_id: int, db: AsyncSession = Depends(get_db)
) -> SquadOut:
    fpl_team = await db.scalar(
        select(FplTeam).where(FplTeam.userId == user_id, FplTeam.fplTeamId == fpl_team_id)
    )
    if fpl_team is None:
        raise HTTPException(status_code=404, detail="No linked FPL team found")

    return await _load_squad(db, fpl_team.id)


async def _get_fpl_team_or_404(db: AsyncSession, user_id: str) -> FplTeam:
    fpl_team = await db.scalar(
        select(FplTeam).where(FplTeam.userId == user_id).order_by(FplTeam.linkedAt.desc())
    )
    if fpl_team is None:
        raise HTTPException(status_code=404, detail="No linked FPL team found")
    return fpl_team


async def _load_squad(db: AsyncSession, fpl_team_row_id: str) -> SquadOut:
    fpl_team = await db.get(FplTeam, fpl_team_row_id)
    snapshot = await db.scalar(
        select(SquadSnapshot)
        .where(SquadSnapshot.fplTeamId == fpl_team_row_id)
        .order_by(SquadSnapshot.capturedAt.desc())
    )
    if snapshot is None:
        raise HTTPException(status_code=404, detail="No squad snapshot yet — import first")

    gameweek = await db.get(Gameweek, snapshot.gameweekId)

    result = await db.execute(select(SquadPlayer).where(SquadPlayer.snapshotId == snapshot.id))
    slots = [
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
    players = await build_player_rows(db, slots, gameweek.id)

    return SquadOut(
        fplTeamId=fpl_team.fplTeamId,
        teamName=fpl_team.teamName,
        managerName=fpl_team.managerName,
        gameweek=gameweek.number,
        bank=snapshot.bank,
        teamValue=snapshot.teamValue,
        players=players,
    )
