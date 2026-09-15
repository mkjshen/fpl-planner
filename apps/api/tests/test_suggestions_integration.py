"""Integration test for app/services/suggestions.py against a real Postgres
database (see conftest.py's db_session fixture) — confirms an injured owned
player produces a free (no-hit) suggestion to replace them, exercising the
full owned-squad -> pool -> ranking -> hit-labeling path together."""

from datetime import datetime

from app.db.models import Club, FplTeam, Gameweek, Player, Position, Season, SquadPlayer, SquadSnapshot, User, cuid
from app.services.suggestions import suggest_transfers


async def test_injured_owned_player_gets_a_free_suggested_replacement(db_session):
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

    gameweek = Gameweek(
        id=cuid(),
        seasonId=season.id,
        number=1,
        deadlineTime=datetime(2026, 8, 15, 11, 0),
        isCurrent=True,
    )
    db_session.add(gameweek)

    user = User(id=cuid(), name="Test Manager", email="suggestions-test@example.com")
    db_session.add(user)
    await db_session.flush()

    fpl_team = FplTeam(id=cuid(), userId=user.id, fplTeamId=1, teamName="Test FC")
    db_session.add(fpl_team)

    club = Club(id=1, code=1, name="Test Town", shortName="TST")
    db_session.add(club)
    await db_session.flush()

    injured_player = Player(
        id=1,
        clubId=club.id,
        webName="Crocked",
        fullName="Crocked Player",
        position=Position.MID,
        currentPrice=50,
        status="i",
        form=8.0,
        pointsPerGame=8.0,
        minutes=1000,
    )
    healthy_replacement = Player(
        id=2,
        clubId=club.id,
        webName="Fit",
        fullName="Fit Player",
        position=Position.MID,
        currentPrice=45,
        status="a",
        form=5.0,
        pointsPerGame=5.0,
        minutes=1000,
    )
    db_session.add_all([injured_player, healthy_replacement])
    await db_session.flush()

    snapshot = SquadSnapshot(id=cuid(), fplTeamId=fpl_team.id, gameweekId=gameweek.id, bank=100, teamValue=50)
    db_session.add(snapshot)
    await db_session.flush()

    db_session.add(
        SquadPlayer(
            id=cuid(),
            snapshotId=snapshot.id,
            playerId=injured_player.id,
            purchasePrice=50,
            sellingPrice=50,
            isStarting=True,
            squadPosition=1,
        )
    )
    await db_session.commit()

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.freeTransfersAvailable == 1
    assert len(result.suggestions) == 1
    suggestion = result.suggestions[0]
    assert suggestion.outPlayer.playerId == injured_player.id
    assert suggestion.inPlayer.playerId == healthy_replacement.id
    assert suggestion.requiresHit is False
    assert suggestion.projectedGain > 0
