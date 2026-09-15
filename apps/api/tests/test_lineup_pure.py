"""Pure-function tests for app/services/lineup.py — no DB required."""

import pytest

from app.schemas.lineup import LineupPlayerInput
from app.services.lineup import LineupValidationError, _resell_price, _validate_lineup, _window_for_gameweek


class TestResellPrice:
    def test_price_unchanged_returns_same_price(self):
        assert _resell_price(purchase_price=50, current_price=50) == 50

    def test_price_risen_returns_half_the_gain_rounded_down(self):
        # +11 tenths of a million rise -> only 5 (floor(11/2)) of it is realized
        assert _resell_price(purchase_price=50, current_price=61) == 55

    def test_price_risen_by_even_amount_splits_exactly(self):
        assert _resell_price(purchase_price=50, current_price=60) == 55

    def test_price_dropped_passes_the_full_loss_through(self):
        assert _resell_price(purchase_price=50, current_price=45) == 45


class TestWindowForGameweek:
    def test_gameweek_inside_a_window_matches(self):
        windows = [(1, 19), (20, 38)]
        assert _window_for_gameweek(windows, 10) == (1, 19)
        assert _window_for_gameweek(windows, 25) == (20, 38)

    def test_gameweek_on_a_window_boundary_matches(self):
        windows = [(1, 19), (20, 38)]
        assert _window_for_gameweek(windows, 19) == (1, 19)
        assert _window_for_gameweek(windows, 20) == (20, 38)

    def test_gameweek_outside_every_window_returns_none(self):
        assert _window_for_gameweek([(20, 38)], 5) is None

    def test_no_windows_at_all_returns_none(self):
        assert _window_for_gameweek([], 10) is None


def _make_squad() -> tuple[list[LineupPlayerInput], dict[int, str]]:
    """A legal 15-player squad: 2 GK/5 DEF/5 MID/3 FWD total, 11 starting
    (1 GK/4 DEF/5 MID/1 FWD — inside the 3-5/2-5/1-3 formation ranges),
    1 captain (player 3), 1 vice-captain (player 8). Tests mutate a copy of
    the returned players/positions to break exactly one invariant."""
    positions: dict[int, str] = {}
    players: list[LineupPlayerInput] = []

    def add(player_id: int, position: str, is_starting: bool, is_captain: bool = False, is_vice_captain: bool = False):
        positions[player_id] = position
        players.append(
            LineupPlayerInput(
                playerId=player_id,
                isStarting=is_starting,
                squadPosition=len(players) + 1,
                isCaptain=is_captain,
                isViceCaptain=is_vice_captain,
            )
        )

    add(1, "GK", True)
    add(2, "GK", False)
    add(3, "DEF", True, is_captain=True)
    add(4, "DEF", True)
    add(5, "DEF", True)
    add(6, "DEF", True)
    add(7, "DEF", False)
    add(8, "MID", True, is_vice_captain=True)
    add(9, "MID", True)
    add(10, "MID", True)
    add(11, "MID", True)
    add(12, "MID", True)
    add(13, "FWD", True)
    add(14, "FWD", False)
    add(15, "FWD", False)

    return players, positions


def _by_id(players: list[LineupPlayerInput], player_id: int) -> LineupPlayerInput:
    return next(p for p in players if p.playerId == player_id)


class TestValidateLineup:
    def test_legal_squad_passes(self):
        players, positions = _make_squad()
        _validate_lineup(players, positions)  # no raise

    def test_wrong_squad_size_rejected(self):
        players, positions = _make_squad()
        with pytest.raises(LineupValidationError, match="exactly 15 players"):
            _validate_lineup(players[:14], positions)

    def test_duplicate_player_rejected(self):
        players, positions = _make_squad()
        _by_id(players, 2).playerId = 1
        with pytest.raises(LineupValidationError, match="Duplicate player"):
            _validate_lineup(players, positions)

    def test_wrong_position_counts_rejected(self):
        players, positions = _make_squad()
        positions[15] = "DEF"  # squad is now 2 GK/6 DEF/5 MID/2 FWD
        with pytest.raises(LineupValidationError, match="2 goalkeepers"):
            _validate_lineup(players, positions)

    def test_wrong_starting_count_rejected(self):
        players, positions = _make_squad()
        _by_id(players, 7).isStarting = True  # 12 players now marked starting
        with pytest.raises(LineupValidationError, match="Exactly 11 players"):
            _validate_lineup(players, positions)

    def test_two_goalkeepers_starting_rejected(self):
        players, positions = _make_squad()
        _by_id(players, 2).isStarting = True  # bench GK now also starting
        _by_id(players, 13).isStarting = False  # drop a FWD to keep 11 starting
        with pytest.raises(LineupValidationError, match="exactly 1 goalkeeper"):
            _validate_lineup(players, positions)

    def test_too_few_defenders_rejected(self):
        players, positions = _make_squad()
        _by_id(players, 5).isStarting = False  # DEF starting: 4 -> 2
        _by_id(players, 6).isStarting = False
        _by_id(players, 14).isStarting = True  # keep starting count at 11
        _by_id(players, 15).isStarting = True
        with pytest.raises(LineupValidationError, match="3-5 defenders"):
            _validate_lineup(players, positions)

    def test_captain_and_vice_captain_must_differ(self):
        players, positions = _make_squad()
        _by_id(players, 8).isViceCaptain = False
        _by_id(players, 3).isViceCaptain = True  # player 3 is already captain
        with pytest.raises(LineupValidationError, match="must be different players"):
            _validate_lineup(players, positions)

    def test_captain_must_be_starting(self):
        players, positions = _make_squad()
        _by_id(players, 3).isCaptain = False
        _by_id(players, 7).isCaptain = True  # player 7 is on the bench
        with pytest.raises(LineupValidationError, match="Captain must be in the starting lineup"):
            _validate_lineup(players, positions)

    def test_no_captain_rejected(self):
        players, positions = _make_squad()
        _by_id(players, 3).isCaptain = False
        with pytest.raises(LineupValidationError, match="Exactly one player must be captain"):
            _validate_lineup(players, positions)
