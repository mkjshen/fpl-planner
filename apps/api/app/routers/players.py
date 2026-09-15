"""Browse/search the full player pool, for picking a transfer-in target.

Trust note: same as teams.py — userId is taken directly from the caller
because this API isn't exposed to the browser; Next.js validates the
session first.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.db.models import FplTeam
from app.schemas.players import PlayerListOut, PlayerProfileOut
from app.services import players as players_service
from app.services.lineup import GameweekNotFoundError

router = APIRouter(prefix="/players", tags=["players"])


@router.get("", response_model=PlayerListOut)
async def list_players(
    userId: str,
    gameweekNumber: int,
    # Repeatable (?position=DEF&position=FWD) — zero or more positions to
    # include; omitted entirely means every position, not none.
    position: list[str] | None = Query(default=None),
    search: str | None = None,
    limit: int = Query(default=30, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> PlayerListOut:
    fpl_team = await db.scalar(
        select(FplTeam).where(FplTeam.userId == userId).order_by(FplTeam.linkedAt.desc())
    )
    if fpl_team is None:
        raise HTTPException(status_code=404, detail="No linked FPL team found")

    try:
        return await players_service.search_players(
            db, fpl_team, gameweekNumber, position, search, limit, offset
        )
    except GameweekNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error))


@router.get("/{player_id}", response_model=PlayerProfileOut)
async def get_player(player_id: int, db: AsyncSession = Depends(get_db)) -> PlayerProfileOut:
    profile = await players_service.get_player_profile(db, player_id)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")
    return profile
