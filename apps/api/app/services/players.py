from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Club, FplTeam, Gameweek, Player, Position
from app.schemas.players import PlayerListItemOut, PlayerListOut, PlayerProfileOut
from app.services.lineup import GameweekNotFoundError, _find_effective_plan, _latest_snapshot_slots, _plan_slots

# What "sort by" values the search endpoint accepts, mapped to the column
# they order on — all descending (highest first), which is what every one
# of these actually means as "best" (including price: browsing expensive
# players first surfaces the well-known ones). An unrecognized value falls
# back to "price", same as the endpoint's own default.
SORT_COLUMNS = {
    "price": Player.currentPrice,
    "form": Player.form,
    "points": Player.totalPoints,
    "points_per_game": Player.pointsPerGame,
    "ict": Player.ictIndex,
    "value": Player.valueSeason,
    "ownership": Player.selectedByPercent,
}


def _escape_like(value: str) -> str:
    """Player search text is dropped straight into a LIKE pattern below —
    without this, a name typed with a literal '%' or '_' would be treated
    as a SQL wildcard (e.g. searching "_" matches every player with any
    single character in their name, i.e. everyone) instead of matched
    literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


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
    positions: list[str] | None,
    search: str | None,
    sort_by: str,
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
    if positions:
        filters.append(Player.position.in_([Position(p) for p in positions]))
    if search:
        filters.append(Player.webName.ilike(f"%{_escape_like(search)}%", escape="\\"))
    else:
        filters.append(Player.status.notin_(["i", "s"]))
    if owned_ids:
        filters.append(Player.id.notin_(owned_ids))

    count_query = select(func.count()).select_from(Player).where(*filters)
    total = await db.scalar(count_query) or 0

    sort_column = SORT_COLUMNS.get(sort_by, Player.currentPrice)
    query = (
        select(Player, Club)
        .join(Club, Player.clubId == Club.id)
        .where(*filters)
        # webName as the tiebreak keeps paging stable — without it, rows
        # sharing the sorted value (e.g. two players both on 0.0 form)
        # could reorder between the first page and the next offset-based one.
        .order_by(sort_column.desc(), Player.webName)
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
            form=player.form,
            totalPoints=player.totalPoints,
            pointsPerGame=player.pointsPerGame,
            ictIndex=player.ictIndex,
            valueSeason=player.valueSeason,
            selectedByPercent=player.selectedByPercent,
        )
        for player, club in result.all()
    ]
    return PlayerListOut(total=total, players=players)


async def get_player_profile(db: AsyncSession, player_id: int) -> PlayerProfileOut | None:
    row = await db.execute(
        select(Player, Club).join(Club, Player.clubId == Club.id).where(Player.id == player_id)
    )
    match = row.first()
    if match is None:
        return None
    player, club = match
    return PlayerProfileOut(
        playerId=player.id,
        webName=player.webName,
        fullName=player.fullName,
        position=player.position.value,
        club=club.shortName,
        clubCode=club.code,
        photoCode=player.photoCode,
        currentPrice=player.currentPrice,
        status=player.status,
        chanceOfPlayingNextRound=player.chanceOfPlayingNextRound,
        news=player.news,
        form=player.form,
        totalPoints=player.totalPoints,
        pointsPerGame=player.pointsPerGame,
        selectedByPercent=player.selectedByPercent,
        minutes=player.minutes,
        goalsScored=player.goalsScored,
        assists=player.assists,
        cleanSheets=player.cleanSheets,
        bonus=player.bonus,
        ictIndex=player.ictIndex,
        expectedGoals=player.expectedGoals,
        expectedAssists=player.expectedAssists,
        valueSeason=player.valueSeason,
    )
