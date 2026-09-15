from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Club, Fixture, Player
from app.schemas.squad import SquadPlayerOut


async def _opponent_strings(
    db: AsyncSession, gameweek_id: str, club_ids: set[int]
) -> tuple[dict[int, str], dict[int, bool]]:
    """For each of `club_ids`, who they face in `gameweek_id` and where,
    formatted for display — "MUN (H)", "MUN (H), LIV (A)" on a double
    gameweek, or "No fixture" on a blank one — alongside whether every one
    of that club's fixtures in this gameweek has finished (false on a
    blank gameweek, or if any fixture in a double gameweek is still to
    come)."""
    if not club_ids:
        return {}, {}

    result = await db.execute(select(Fixture).where(Fixture.gameweekId == gameweek_id))
    fixtures = result.scalars().all()

    opponent_ids: set[int] = set()
    matchups: dict[int, list[tuple[int, bool]]] = {}
    finished: dict[int, list[bool]] = {}
    for fixture in fixtures:
        if fixture.homeTeamId in club_ids:
            matchups.setdefault(fixture.homeTeamId, []).append((fixture.awayTeamId, True))
            finished.setdefault(fixture.homeTeamId, []).append(fixture.finished)
            opponent_ids.add(fixture.awayTeamId)
        if fixture.awayTeamId in club_ids:
            matchups.setdefault(fixture.awayTeamId, []).append((fixture.homeTeamId, False))
            finished.setdefault(fixture.awayTeamId, []).append(fixture.finished)
            opponent_ids.add(fixture.homeTeamId)

    club_rows = await db.execute(
        select(Club.id, Club.shortName).where(Club.id.in_(club_ids | opponent_ids))
    )
    short_names = dict(club_rows.all())

    opponent_text = {
        club_id: ", ".join(
            f"{short_names.get(opp_id, '?')} ({'H' if is_home else 'A'})" for opp_id, is_home in matches
        )
        or "No fixture"
        for club_id, matches in matchups.items()
    } | {club_id: "No fixture" for club_id in club_ids if club_id not in matchups}
    all_finished = {club_id: all(flags) for club_id, flags in finished.items()}
    return opponent_text, all_finished


async def build_player_rows(
    db: AsyncSession,
    slots: list[tuple[int, bool, int, bool, bool, int, int]],
    gameweek_id: str,
    is_current_gameweek: bool = False,
) -> list[SquadPlayerOut]:
    """Join a list of (playerId, isStarting, squadPosition, isCaptain,
    isViceCaptain, purchasePrice, sellingPrice) slots — sourced from either
    SquadPlayer or LineupPlanPlayer rows, which share this shape — against
    Player/Club, plus each player's opponent for `gameweek_id`.

    `is_current_gameweek` gates `actualPoints`: only for the real, live
    current gameweek (never a future one being planned) does "their
    fixture already happened" mean anything — a planned gameweek's
    fixtures haven't been played yet regardless of what Fixture.finished
    says for that same club earlier in the season."""
    player_ids = [slot[0] for slot in slots]
    result = await db.execute(
        select(Player, Club).join(Club, Player.clubId == Club.id).where(Player.id.in_(player_ids))
    )
    by_id = {player.id: (player, club) for player, club in result.all()}
    opponents, finished = await _opponent_strings(
        db, gameweek_id, {club.id for _, club in by_id.values()}
    )

    rows = [
        SquadPlayerOut(
            playerId=player.id,
            webName=player.webName,
            position=player.position.value,
            club=club.shortName,
            clubCode=club.code,
            opponent=opponents.get(club.id, "No fixture"),
            actualPoints=(
                player.currentGameweekPoints
                if is_current_gameweek and finished.get(club.id, False)
                else None
            ),
            currentPrice=player.currentPrice,
            purchasePrice=purchase_price,
            sellingPrice=selling_price,
            isStarting=is_starting,
            squadPosition=squad_position,
            isCaptain=is_captain,
            isViceCaptain=is_vice_captain,
        )
        for player_id, is_starting, squad_position, is_captain, is_vice_captain, purchase_price, selling_price in slots
        for player, club in [by_id[player_id]]
    ]
    rows.sort(key=lambda row: row.squadPosition)
    return rows
