"""Pure-function tests for app/services/players.py — no DB required.

Regression coverage for the SQL LIKE-wildcard-escaping bug fixed this
session: an unescaped "_" or "%" in a player search term was being treated
as a SQL wildcard rather than a literal character (e.g. searching "_"
matched every player, since "_" matches any single character)."""

from app.services.players import _escape_like


def test_plain_text_is_unchanged():
    assert _escape_like("Salah") == "Salah"


def test_underscore_is_escaped():
    assert _escape_like("a_b") == "a\\_b"


def test_percent_is_escaped():
    assert _escape_like("100%") == "100\\%"


def test_backslash_is_escaped_first_so_escaped_wildcards_stay_literal():
    # Backslash must be escaped before % and _, or a literal "\_" in the
    # input would be misread as an escaped wildcard rather than a literal
    # backslash followed by a wildcard.
    assert _escape_like("a\\_b") == "a\\\\\\_b"
