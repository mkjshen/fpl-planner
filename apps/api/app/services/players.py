from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Club, FplTeam, Gameweek, Player, Position
from app.schemas.players import PlayerListItemOut, PlayerListOut
from app.services.lineup import GameweekNotFoundError, _find_effective_plan, _latest_snapshot_slots, _plan_slots


async def _owned_player_ids(db: AsyncSession, fpl_team: FplTeam, gameweek: Gameweek) -> set[int]:
    plan = await _find_effective_plan(db, fpl_team, gameweek)
    if plan is not None:
        slots = await _plan_slots(db, plan)
    else:
        _, slots = await _latest_snapshot_slots(db, fpl_team.id)
    return {slot[0] for slot in slots}


async def search_players(
    db: AsyncSession,
    fpl_team: FplTeam,
    gameweek_number: int,
    position: str | None,
    search: str | None,
    limit: int,
    offset: int,
) -> PlayerListOut:
    gameweek = await db.scalar(select(Gameweek).where(Gameweek.number == gameweek_number))
    if gameweek is None:
        raise GameweekNotFoundError(f"Gameweek {gameweek_number} not found")
    owned_ids = await _owned_player_ids(db, fpl_team, gameweek)

    # Unavailable (status "u", e.g. left the league) players are useless as
    # a transfer target — excluded even from an explicit name search.
    # Injured/suspended ("i"/"s") can still come back before a future
    # gameweek, so they're only hidden from the default browse list, not
    # from a search that's specifically looking for them by name.
    filters = [Player.status != "u"]
    if position:
        filters.append(Player.position == Position(position))
    if search:
        filters.append(Player.webName.ilike(f"%{search}%"))
    else:
        filters.append(Player.status.notin_(["i", "s"]))
    if owned_ids:
        filters.append(Player.id.notin_(owned_ids))

    count_query = select(func.count()).select_from(Player).where(*filters)
    total = await db.scalar(count_query) or 0

    query = (
        select(Player, Club)
        .join(Club, Player.clubId == Club.id)
        .where(*filters)
        .order_by(Player.currentPrice.desc(), Player.webName)
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)

    players = [
        PlayerListItemOut(
            playerId=player.id,
            webName=player.webName,
            position=player.position.value,
            club=club.shortName,
            clubCode=club.code,
            currentPrice=player.currentPrice,
            status=player.status,
        )
        for player, club in result.all()
    ]
    return PlayerListOut(total=total, players=players)
