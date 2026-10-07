"""Pure-function tests for app/services/price_trends.py — no DB required."""

from app.services.price_trends import price_direction


class TestPriceDirection:
    def test_positive_change_is_risen(self):
        assert price_direction(1) == "risen"

    def test_negative_change_is_fallen(self):
        assert price_direction(-1) == "fallen"

    def test_zero_change_is_unchanged(self):
        assert price_direction(0) == "unchanged"

    def test_none_is_treated_as_unchanged(self):
        assert price_direction(None) == "unchanged"

    def test_large_rise_is_still_just_risen(self):
        assert price_direction(3) == "risen"
