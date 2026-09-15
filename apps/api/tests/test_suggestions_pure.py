"""Pure-function tests for app/services/suggestions.py — no DB required."""

from app.db.models import Player, Position
from app.services.suggestions import _availability, _player_score


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
