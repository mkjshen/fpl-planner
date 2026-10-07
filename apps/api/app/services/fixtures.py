"""Shared Fixture-grouping logic — one place to turn a set of Fixture rows
into "what does each club face", used by both the squad view's opponent
display (squad.py) and fixture-difficulty lookups, instead of two
independent per-club grouping loops."""

from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Fixture, Gameweek


def group_fixtures_by_club(
    fixtures: Sequence[Fixture], club_ids: set[int]
) -> dict[int, list[tuple[int, bool, Fixture]]]:
    """For each club in `club_ids`, the (opponentClubId, isHome, fixture)
    tuples among `fixtures` that club appears in — more than one entry on a
    double gameweek, no entry at all (key absent) on a blank one. Callers
    decide how to represent "no fixture"."""
    matchups: dict[int, list[tuple[int, bool, Fixture]]] = defaultdict(list)
    for fixture in fixtures:
        if fixture.homeTeamId in club_ids:
            matchups[fixture.homeTeamId].append((fixture.awayTeamId, True, fixture))
        if fixture.awayTeamId in club_ids:
            matchups[fixture.awayTeamId].append((fixture.homeTeamId, False, fixture))
    return matchups


async def upcoming_difficulty(
    db: AsyncSession, club_ids: set[int], from_gameweek_number: int, num_gameweeks: int
) -> dict[int, dict[int, list[int]]]:
    """For each club in `club_ids`, a {gameweekNumber: [difficulty, ...]}
    map covering `num_gameweeks` starting at `from_gameweek_number`
    (inclusive). A gameweek absent from the inner map is a blank for that
    club; more than one value in a gameweek's list is a double, each entry
    FPL's own 1 (easiest) - 5 (hardest) rating from that club's own side of
    the fixture. A fixture imported before the difficulty columns existed
    and not yet refreshed by a later import is skipped rather than
    counted as a 'no fixture' blank (see the fixture_difficulty
    migration)."""
    if not club_ids:
        return {}

    result = await db.execute(
        select(Fixture, Gameweek.number)
        .join(Gameweek, Fixture.gameweekId == Gameweek.id)
        .where(
            Gameweek.number >= from_gameweek_number,
            Gameweek.number < from_gameweek_number + num_gameweeks,
        )
    )
    fixtures_with_gw = result.all()

    by_club: dict[int, dict[int, list[int]]] = {club_id: {} for club_id in club_ids}
    for fixture, gameweek_number in fixtures_with_gw:
        if fixture.homeTeamId in club_ids and fixture.homeDifficulty is not None:
            by_club[fixture.homeTeamId].setdefault(gameweek_number, []).append(fixture.homeDifficulty)
        if fixture.awayTeamId in club_ids and fixture.awayDifficulty is not None:
            by_club[fixture.awayTeamId].setdefault(gameweek_number, []).append(fixture.awayDifficulty)
    return by_club
