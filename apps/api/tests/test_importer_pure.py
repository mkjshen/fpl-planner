"""Pure-function tests for app/services/importer.py — no DB required."""

from datetime import datetime, timedelta, timezone

from app.services.importer import _as_naive_utc, _photo_code


class TestAsNaiveUtc:
    def test_naive_input_is_returned_rounded_but_otherwise_unchanged(self):
        value = datetime(2026, 9, 15, 12, 0, 0, 123_000)
        assert _as_naive_utc(value) == datetime(2026, 9, 15, 12, 0, 0, 123_000)

    def test_aware_utc_input_becomes_naive(self):
        value = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)
        result = _as_naive_utc(value)
        assert result.tzinfo is None
        assert result == datetime(2026, 9, 15, 12, 0, 0)

    def test_aware_non_utc_input_converts_to_utc_before_dropping_tzinfo(self):
        # A source in UTC+2: 14:00+02:00 is 12:00 UTC.
        tz_plus_2 = timezone(timedelta(hours=2))
        value = datetime(2026, 9, 15, 14, 0, 0, tzinfo=tz_plus_2)
        result = _as_naive_utc(value)
        assert result.tzinfo is None
        assert result == datetime(2026, 9, 15, 12, 0, 0)

    def test_microseconds_round_to_the_nearest_millisecond(self):
        # Matches Prisma's TIMESTAMP(3) storage precision (see importer.py's
        # own comment on this function) so a value read back from the DB
        # compares equal to one freshly parsed from the FPL API.
        value = datetime(2026, 9, 15, 12, 0, 0, 123_499)
        assert _as_naive_utc(value).microsecond == 123_000

        value = datetime(2026, 9, 15, 12, 0, 0, 123_500)
        assert _as_naive_utc(value).microsecond == 124_000

    def test_rounding_up_past_999500_microseconds_carries_into_the_next_second(self):
        value = datetime(2026, 9, 15, 12, 0, 0, 999_600)
        result = _as_naive_utc(value)
        assert result == datetime(2026, 9, 15, 12, 0, 1, 0)


class TestPhotoCode:
    def test_normal_filename_extracts_the_numeric_prefix(self):
        assert _photo_code("154561.jpg") == 154561

    def test_filename_without_a_number_returns_none(self):
        assert _photo_code("placeholder.jpg") is None

    def test_empty_string_returns_none(self):
        assert _photo_code("") is None
