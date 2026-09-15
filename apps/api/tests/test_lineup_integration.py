"""Integration tests for app/services/lineup.py against a real Postgres
database (see conftest.py's db_session fixture).

Regression coverage for the off-by-one bug fixed this session:
available_free_transfers used to replay real transfer history only through
`range(2, current.number)`, stopping *before* the current, live gameweek —
so a real transfer a manager already made this week (imported from the FPL
API) was silently ignored when computing free transfers for the *next*
gameweek, overstating what the planner would let them do for free."""

from datetime import datetime

from app.db.models import Club, FplTeam, Gameweek, Player, Position, Season, TransferHistory, User, cuid
from app.services.lineup import available_free_transfers


async def _seed_team_at_gameweek_3_with_two_real_transfers(db_session):
    """A team whose manager has already spent both of gameweek 3's 2 saved
    free transfers via the real FPL app (imported into TransferHistory) —
    gameweek 3 is the current, live gameweek. Entering gameweek 4, only 1
    free transfer should be available: the 2 saved were both just used, so
    the rollover resets to the base cap of 1."""
    season = Season(
        id=cuid(),
        label="Test 2026/27",
        isCurrent=True,
        freeTransferCap=1,
        freeTransferRolloverLimit=5,
        chipsAvailable=[],
    )
    db_session.add(season)
    await db_session.flush()

    gameweeks = {
        number: Gameweek(
            id=cuid(),
            seasonId=season.id,
            number=number,
            deadlineTime=datetime(2026, 9, number, 11, 0),
            isCurrent=(number == 3),
        )
        for number in (2, 3)
    }
    db_session.add_all(gameweeks.values())

    user = User(id=cuid(), name="Test Manager", email="test@example.com")
    db_session.add(user)
    await db_session.flush()

    fpl_team = FplTeam(id=cuid(), userId=user.id, fplTeamId=1, teamName="Test FC")
    db_session.add(fpl_team)

    club = Club(id=1, code=1, name="Test Town", shortName="TST")
    db_session.add(club)
    await db_session.flush()

    players = [
        Player(id=i, clubId=club.id, webName=f"Player{i}", fullName=f"Player {i}", position=Position.MID, currentPrice=50)
        for i in range(1, 5)
    ]
    db_session.add_all(players)
    await db_session.flush()

    # 0 real transfers in gameweek 2 -> available entering gw3 = min(1-0+1, 5) = 2.
    # 2 real transfers in gameweek 3 (the current, live gameweek) -> spends
    # both saved free transfers -> available entering gw4 = min(2-2+1, 5) = 1.
    db_session.add_all(
        [
            TransferHistory(
                id=cuid(),
                fplTeamId=fpl_team.id,
                gameweekId=gameweeks[3].id,
                playerOutId=1,
                playerInId=2,
                transferCost=0,
                executedAt=datetime(2026, 9, 20, 12, 0),
            ),
            TransferHistory(
                id=cuid(),
                fplTeamId=fpl_team.id,
                gameweekId=gameweeks[3].id,
                playerOutId=3,
                playerInId=4,
                transferCost=0,
                executedAt=datetime(2026, 9, 20, 12, 1),
            ),
        ]
    )
    await db_session.commit()
    return fpl_team


async def test_free_transfers_account_for_real_transfers_made_this_live_gameweek(db_session):
    fpl_team = await _seed_team_at_gameweek_3_with_two_real_transfers(db_session)

    available = await available_free_transfers(db_session, fpl_team, target_gameweek_number=4)

    assert available == 1
