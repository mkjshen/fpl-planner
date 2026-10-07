"""Integration tests for app/services/fixtures.py's upcoming_difficulty
against a real Postgres database (see conftest.py's db_session fixture) —
exercises the actual Gameweek join and multi-gameweek range query that a
pure-function test can't reach."""

from datetime import datetime

from app.db.models import Club, Fixture, Gameweek, Season, cuid
from app.services.fixtures import upcoming_difficulty


async def _seed_season_with_gameweeks(db_session, numbers: list[int]) -> dict[int, Gameweek]:
    season = Season(id=cuid(), label=f"Test-{cuid()}", isCurrent=True, freeTransferCap=1, freeTransferRolloverLimit=5, chipsAvailable=[])
    db_session.add(season)
    await db_session.flush()

    gameweeks = {
        number: Gameweek(id=cuid(), seasonId=season.id, number=number, deadlineTime=datetime(2026, 8, 15, 11, 0))
        for number in numbers
    }
    db_session.add_all(gameweeks.values())
    await db_session.flush()
    return gameweeks


def _club(club_id: int) -> Club:
    return Club(id=club_id, code=club_id, name=f"Club {club_id}", shortName=f"C{club_id}")


async def test_a_single_fixture_per_gameweek_is_reported_for_both_sides(db_session):
    gameweeks = await _seed_season_with_gameweeks(db_session, [1, 2])
    home, away = _club(1), _club(2)
    db_session.add_all([home, away])
    await db_session.flush()
    db_session.add(
        Fixture(
            id=1, gameweekId=gameweeks[1].id, homeTeamId=home.id, awayTeamId=away.id, homeDifficulty=2, awayDifficulty=4
        )
    )
    await db_session.commit()

    result = await upcoming_difficulty(db_session, {home.id, away.id}, from_gameweek_number=1, num_gameweeks=2)

    assert result[home.id] == {1: [2]}
    assert result[away.id] == {1: [4]}


async def test_a_blank_gameweek_leaves_that_gameweek_number_absent(db_session):
    gameweeks = await _seed_season_with_gameweeks(db_session, [1, 2])
    club, opponent = _club(1), _club(2)
    db_session.add_all([club, opponent])
    await db_session.flush()
    db_session.add(
        Fixture(
            id=1, gameweekId=gameweeks[1].id, homeTeamId=club.id, awayTeamId=opponent.id, homeDifficulty=3, awayDifficulty=3
        )
    )
    await db_session.commit()

    result = await upcoming_difficulty(db_session, {club.id}, from_gameweek_number=1, num_gameweeks=2)

    assert 1 in result[club.id]
    assert 2 not in result[club.id]


async def test_a_double_gameweek_collects_both_difficulties_for_that_club(db_session):
    gameweeks = await _seed_season_with_gameweeks(db_session, [1])
    club, first_opponent, second_opponent = _club(1), _club(2), _club(3)
    db_session.add_all([club, first_opponent, second_opponent])
    await db_session.flush()
    db_session.add_all(
        [
            Fixture(
                id=1,
                gameweekId=gameweeks[1].id,
                homeTeamId=club.id,
                awayTeamId=first_opponent.id,
                homeDifficulty=2,
                awayDifficulty=3,
            ),
            Fixture(
                id=2,
                gameweekId=gameweeks[1].id,
                homeTeamId=second_opponent.id,
                awayTeamId=club.id,
                homeDifficulty=5,
                awayDifficulty=1,
            ),
        ]
    )
    await db_session.commit()

    result = await upcoming_difficulty(db_session, {club.id}, from_gameweek_number=1, num_gameweeks=1)

    assert result[club.id] == {1: [2, 1]}


async def test_a_fixture_imported_before_the_difficulty_columns_existed_is_skipped(db_session):
    gameweeks = await _seed_season_with_gameweeks(db_session, [1])
    club, opponent = _club(1), _club(2)
    db_session.add_all([club, opponent])
    await db_session.flush()
    db_session.add(
        Fixture(
            id=1,
            gameweekId=gameweeks[1].id,
            homeTeamId=club.id,
            awayTeamId=opponent.id,
            homeDifficulty=None,
            awayDifficulty=None,
        )
    )
    await db_session.commit()

    result = await upcoming_difficulty(db_session, {club.id}, from_gameweek_number=1, num_gameweeks=1)

    assert result[club.id] == {}


async def test_gameweeks_outside_the_requested_range_are_excluded(db_session):
    gameweeks = await _seed_season_with_gameweeks(db_session, [1, 2, 3])
    club, opponent = _club(1), _club(2)
    db_session.add_all([club, opponent])
    await db_session.flush()
    db_session.add(
        Fixture(
            id=1, gameweekId=gameweeks[3].id, homeTeamId=club.id, awayTeamId=opponent.id, homeDifficulty=4, awayDifficulty=2
        )
    )
    await db_session.commit()

    result = await upcoming_difficulty(db_session, {club.id}, from_gameweek_number=1, num_gameweeks=2)

    assert result[club.id] == {}
