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
from app.db.models import Club, FplTeam, Gameweek, Player, SquadPlayer, SquadSnapshot
from app.schemas.squad import ImportTeamRequest, SquadOut, SquadPlayerOut
from app.services.fpl_client import FplTeamNotFoundError
from app.services.importer import import_team

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
    fpl_team = await db.scalar(
        select(FplTeam).where(FplTeam.userId == user_id).order_by(FplTeam.linkedAt.desc())
    )
    if fpl_team is None:
        raise HTTPException(status_code=404, detail="No linked FPL team found")

    return await _load_squad(db, fpl_team.id)


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

    result = await db.execute(
        select(SquadPlayer, Player, Club)
        .join(Player, SquadPlayer.playerId == Player.id)
        .join(Club, Player.clubId == Club.id)
        .where(SquadPlayer.snapshotId == snapshot.id)
        .order_by(SquadPlayer.squadPosition)
    )

    players = [
        SquadPlayerOut(
            playerId=player.id,
            webName=player.webName,
            position=player.position.value,
            club=club.shortName,
            currentPrice=player.currentPrice,
            isStarting=sp.isStarting,
            squadPosition=sp.squadPosition,
            isCaptain=sp.isCaptain,
            isViceCaptain=sp.isViceCaptain,
        )
        for sp, player, club in result.all()
    ]

    return SquadOut(
        fplTeamId=fpl_team.fplTeamId,
        teamName=fpl_team.teamName,
        managerName=fpl_team.managerName,
        gameweek=gameweek.number,
        bank=snapshot.bank,
        teamValue=snapshot.teamValue,
        players=players,
    )
