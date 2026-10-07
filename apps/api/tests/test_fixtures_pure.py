"""Pure-function tests for app/services/fixtures.py — no DB required."""

from app.db.models import Fixture
from app.services.fixtures import group_fixtures_by_club


def _fixture(fixture_id: int, home: int, away: int, **overrides) -> Fixture:
    defaults = dict(gameweekId="gw1", finished=False, homeDifficulty=None, awayDifficulty=None)
    defaults.update(overrides)
    return Fixture(id=fixture_id, homeTeamId=home, awayTeamId=away, **defaults)


class TestGroupFixturesByClub:
    def test_single_fixture_groups_both_sides(self):
        fixture = _fixture(1, home=10, away=20)
        result = group_fixtures_by_club([fixture], {10, 20})
        assert result[10] == [(20, True, fixture)]
        assert result[20] == [(10, False, fixture)]

    def test_club_not_in_any_fixture_is_absent_from_the_result(self):
        fixture = _fixture(1, home=10, away=20)
        result = group_fixtures_by_club([fixture], {10, 20, 30})
        assert 30 not in result

    def test_a_double_gameweek_produces_two_entries_for_the_same_club(self):
        first = _fixture(1, home=10, away=20)
        second = _fixture(2, home=30, away=10)
        result = group_fixtures_by_club([first, second], {10})
        assert result[10] == [(20, True, first), (30, False, second)]

    def test_fixture_between_two_clubs_outside_club_ids_is_ignored(self):
        fixture = _fixture(1, home=40, away=50)
        result = group_fixtures_by_club([fixture], {10, 20})
        assert result == {}

    def test_empty_club_ids_returns_empty(self):
        fixture = _fixture(1, home=10, away=20)
        assert group_fixtures_by_club([fixture], set()) == {}
