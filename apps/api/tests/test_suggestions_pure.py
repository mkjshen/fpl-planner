"""Pure-function tests for app/services/suggestions.py — no DB required."""

from app.db.models import Player, Position
from app.services.suggestions import HORIZON_DECAY, _availability, _horizon_projection, _player_score


def _player(**overrides) -> Player:
    defaults = dict(
        id=1,
        clubId=1,
        webName="Test",
        fullName="Test Player",
        position=Position.MID,
        currentPrice=50,
        status="a",
        form=5.0,
        pointsPerGame=5.0,
        chanceOfPlayingNextRound=None,
        minutes=900,
    )
    defaults.update(overrides)
    return Player(**defaults)


class TestAvailability:
    def test_fully_fit_player_is_full_availability(self):
        assert _availability(_player(status="a", chanceOfPlayingNextRound=None)) == 1.0

    def test_injured_player_is_excluded_outright(self):
        assert _availability(_player(status="i")) == 0.0

    def test_suspended_player_is_excluded_outright(self):
        assert _availability(_player(status="s")) == 0.0

    def test_unavailable_player_is_excluded_outright(self):
        assert _availability(_player(status="u")) == 0.0

    def test_chance_of_playing_scales_availability_when_present(self):
        assert _availability(_player(status="d", chanceOfPlayingNextRound=75)) == 0.75
        assert _availability(_player(status="a", chanceOfPlayingNextRound=50)) == 0.5

    def test_doubtful_with_no_percentage_yet_gets_conservative_default(self):
        assert _availability(_player(status="d", chanceOfPlayingNextRound=None)) == 0.75


class TestPlayerScore:
    def test_blends_form_and_points_per_game_60_40(self):
        player = _player(form=10.0, pointsPerGame=0.0, status="a", chanceOfPlayingNextRound=None)
        assert _player_score(player) == 6.0  # 0.6 * 10 + 0.4 * 0

        player = _player(form=0.0, pointsPerGame=10.0, status="a", chanceOfPlayingNextRound=None)
        assert _player_score(player) == 4.0  # 0.6 * 0 + 0.4 * 10

    def test_injured_player_scores_zero_regardless_of_form(self):
        player = _player(form=10.0, pointsPerGame=10.0, status="i")
        assert _player_score(player) == 0.0

    def test_doubtful_player_score_is_discounted_not_excluded(self):
        player = _player(form=10.0, pointsPerGame=10.0, status="d", chanceOfPlayingNextRound=50)
        assert _player_score(player) == 5.0  # (0.6*10 + 0.4*10) * 0.5


class TestHorizonProjection:
    def test_an_average_fixture_keeps_the_base_score_in_the_first_gameweek(self):
        assert _horizon_projection(5.0, {1: [3]}, [1]) == [5.0]

    def test_easier_fixtures_score_higher_than_harder_ones(self):
        easy, average, hard = (_horizon_projection(5.0, {1: [d]}, [1])[0] for d in (1, 3, 5))
        assert easy > average > hard

    def test_a_double_gameweek_sums_both_fixtures(self):
        assert _horizon_projection(5.0, {1: [3, 3]}, [1]) == [10.0]

    def test_a_blank_gameweek_projects_zero(self):
        assert _horizon_projection(5.0, {}, [1]) == [0.0]

    def test_later_gameweeks_are_down_weighted(self):
        projection = _horizon_projection(5.0, {1: [3], 2: [3], 3: [3]}, [1, 2, 3])
        assert projection == [5.0, 5.0 * HORIZON_DECAY, 5.0 * HORIZON_DECAY**2]

    def test_an_unavailable_player_projects_zero_everywhere(self):
        assert _horizon_projection(0.0, {1: [1], 2: [1, 1]}, [1, 2]) == [0.0, 0.0]
