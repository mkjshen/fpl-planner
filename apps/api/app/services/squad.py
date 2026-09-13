from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Club, Player
from app.schemas.squad import SquadPlayerOut


async def build_player_rows(
    db: AsyncSession,
    slots: list[tuple[int, bool, int, bool, bool]],
) -> list[SquadPlayerOut]:
    """Join a list of (playerId, isStarting, squadPosition, isCaptain,
    isViceCaptain) slots — sourced from either SquadPlayer or
    LineupPlanPlayer rows, which share this shape — against Player/Club."""
    player_ids = [slot[0] for slot in slots]
    result = await db.execute(
        select(Player, Club).join(Club, Player.clubId == Club.id).where(Player.id.in_(player_ids))
    )
    by_id = {player.id: (player, club) for player, club in result.all()}

    rows = [
        SquadPlayerOut(
            playerId=player.id,
            webName=player.webName,
            position=player.position.value,
            club=club.shortName,
            currentPrice=player.currentPrice,
            isStarting=is_starting,
            squadPosition=squad_position,
            isCaptain=is_captain,
            isViceCaptain=is_vice_captain,
        )
        for player_id, is_starting, squad_position, is_captain, is_vice_captain in slots
        for player, club in [by_id[player_id]]
    ]
    rows.sort(key=lambda row: row.squadPosition)
    return rows
