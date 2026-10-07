"""Integration tests for app/services/suggestions.py against a real Postgres
database (see conftest.py's db_session fixture) — each exercises one
constraint of the full owned-squad -> pool -> ranking -> hit-labeling path
that a pure-function test can't reach (the query itself, not just the
scoring formula)."""

from datetime import datetime

from sqlalchemy import select

from app.db.models import (
    Club,
    Fixture,
    FplTeam,
    Gameweek,
    Player,
    Position,
    Season,
    SquadPlayer,
    SquadSnapshot,
    User,
    cuid,
)
from app.services.suggestions import HORIZON_DECAY, suggest_transfers

# Offset for the throwaway opponent clubs _seed_average_fixtures creates, so
# they never collide with a test's own club ids.
OPPONENT_CLUB_ID_OFFSET = 1000


async def _seed_team(db_session, *, free_transfer_cap: int = 1) -> tuple[FplTeam, Gameweek]:
    """A season + current gameweek 1 + a fresh user/team — every test builds
    its own clubs/players/squad on top of this. Gameweek 1 keeps
    available_free_transfers trivial (no history replay needed, see
    lineup.py: the replay loop only runs from current.number >= 2)."""
    season = Season(
        id=cuid(),
        label=f"Test-{cuid()}",
        isCurrent=True,
        freeTransferCap=free_transfer_cap,
        freeTransferRolloverLimit=5,
        chipsAvailable=[],
    )
    db_session.add(season)
    await db_session.flush()

    gameweek = Gameweek(
        id=cuid(), seasonId=season.id, number=1, deadlineTime=datetime(2026, 8, 15, 11, 0), isCurrent=True
    )
    db_session.add(gameweek)

    user = User(id=cuid(), name="Test Manager", email=f"{cuid()}@example.com")
    db_session.add(user)
    await db_session.flush()

    fpl_team = FplTeam(id=cuid(), userId=user.id, fplTeamId=1, teamName="Test FC")
    db_session.add(fpl_team)
    await db_session.flush()

    return fpl_team, gameweek


def _club(club_id: int) -> Club:
    return Club(id=club_id, code=club_id, name=f"Club {club_id}", shortName=f"C{club_id}")


def _player(player_id: int, club_id: int, position: Position, price: int, **overrides) -> Player:
    defaults = dict(
        webName=f"Player{player_id}",
        fullName=f"Player {player_id}",
        currentPrice=price,
        status="a",
        form=0.0,
        pointsPerGame=0.0,
        minutes=1000,
    )
    defaults.update(overrides)
    return Player(id=player_id, clubId=club_id, position=position, **defaults)


async def _seed_average_fixtures(db_session, gameweek: Gameweek) -> None:
    """One average-difficulty (3, multiplier 1.0) fixture in `gameweek` for
    every club seeded so far, each against its own throwaway opponent. Only
    gameweek 1 exists in _seed_team, so the rest of the horizon is fixture-
    free for everyone — a player's horizon total is then exactly their
    single-gameweek _player_score, keeping these tests' arithmetic readable."""
    clubs = (await db_session.scalars(select(Club).where(Club.id < OPPONENT_CLUB_ID_OFFSET))).all()
    for club in clubs:
        opponent = _club(OPPONENT_CLUB_ID_OFFSET + club.id)
        db_session.add(opponent)
        await db_session.flush()
        db_session.add(
            Fixture(
                id=club.id,
                gameweekId=gameweek.id,
                homeTeamId=club.id,
                awayTeamId=opponent.id,
                homeDifficulty=3,
                awayDifficulty=3,
            )
        )
    await db_session.flush()


async def _seed_squad(
    db_session,
    fpl_team: FplTeam,
    gameweek: Gameweek,
    bank: int,
    owned: list[tuple[Player, int, int]],
    average_fixtures: bool = True,
) -> None:
    """`owned`: (player, purchasePrice, sellingPrice) per squad slot. Also
    seeds average fixtures for every club (see _seed_average_fixtures)
    unless a test sets up its own fixtures instead."""
    if average_fixtures:
        await _seed_average_fixtures(db_session, gameweek)
    snapshot = SquadSnapshot(id=cuid(), fplTeamId=fpl_team.id, gameweekId=gameweek.id, bank=bank, teamValue=0)
    db_session.add(snapshot)
    await db_session.flush()
    for i, (player, purchase_price, selling_price) in enumerate(owned, start=1):
        db_session.add(
            SquadPlayer(
                id=cuid(),
                snapshotId=snapshot.id,
                playerId=player.id,
                purchasePrice=purchase_price,
                sellingPrice=selling_price,
                isStarting=True,
                squadPosition=i,
            )
        )
    await db_session.commit()


async def test_injured_owned_player_gets_a_free_suggested_replacement(db_session):
    fpl_team, gameweek = await _seed_team(db_session)
    club = _club(1)
    db_session.add(club)
    await db_session.flush()

    injured = _player(1, club.id, Position.MID, 50, status="i", form=8.0, pointsPerGame=8.0)
    replacement = _player(2, club.id, Position.MID, 45, form=5.0, pointsPerGame=5.0)
    db_session.add_all([injured, replacement])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek, bank=100, owned=[(injured, 50, 50)])

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.freeTransfersAvailable == 1
    assert len(result.suggestions) == 1
    suggestion = result.suggestions[0]
    assert suggestion.outPlayer.playerId == injured.id
    assert suggestion.inPlayer.playerId == replacement.id
    assert suggestion.requiresHit is False
    assert suggestion.projectedGain > 0


async def test_a_standout_pool_player_is_only_suggested_once(db_session):
    """Regression test for a real bug found by hand this session: each owned
    player independently picks its own best replacement, so the same
    standout pool player could end up suggested for several different
    owned players — wrong as a list, since only one purchase is real. The
    higher-gain pairing should win; the loser should drop entirely rather
    than being offered a worse fallback."""
    fpl_team, gameweek = await _seed_team(db_session)
    club_a, club_b, club_c = _club(1), _club(2), _club(3)
    db_session.add_all([club_a, club_b, club_c])
    await db_session.flush()

    weaker_out = _player(1, club_a.id, Position.MID, 50, form=3.0, pointsPerGame=3.0)  # score 3.0
    stronger_out = _player(2, club_b.id, Position.MID, 50, form=5.0, pointsPerGame=5.0)  # score 5.0
    standout_in = _player(3, club_c.id, Position.MID, 50, form=10.0, pointsPerGame=10.0)  # score 10.0
    db_session.add_all([weaker_out, stronger_out, standout_in])
    await db_session.flush()
    await _seed_squad(
        db_session, fpl_team, gameweek, bank=100, owned=[(weaker_out, 50, 50), (stronger_out, 50, 50)]
    )

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    # weaker_out -> standout_in gains 7.0; stronger_out -> standout_in only
    # gains 5.0 — the higher-gain pairing must be the one kept.
    assert len(result.suggestions) == 1
    assert result.suggestions[0].outPlayer.playerId == weaker_out.id
    assert result.suggestions[0].inPlayer.playerId == standout_in.id


async def test_suggestions_beyond_free_transfers_need_a_bigger_gain_to_surface(db_session):
    fpl_team, gameweek = await _seed_team(db_session, free_transfer_cap=1)
    clubs = [_club(i) for i in range(1, 7)]
    db_session.add_all(clubs)
    await db_session.flush()

    # Different positions per pair — each owned player's pool search is
    # scoped to its own position, so these can't compete with each other
    # for the same "best single candidate" the way three same-position
    # pairs would (that cross-talk, via the dedup logic, is exactly what
    # test_a_standout_pool_player_is_only_suggested_once covers instead).
    # Hits must beat MIN_GAIN_TO_JUSTIFY_HIT (the -4 itself + MIN_GAIN_TO_SUGGEST = 6.0).
    out1 = _player(1, clubs[0].id, Position.MID, 50, form=0.0, pointsPerGame=0.0)
    in1 = _player(2, clubs[1].id, Position.MID, 50, form=8.0, pointsPerGame=8.0)  # gain 8.0 -> free
    out2 = _player(3, clubs[2].id, Position.DEF, 50, form=0.0, pointsPerGame=0.0)
    in2 = _player(4, clubs[3].id, Position.DEF, 50, form=7.0, pointsPerGame=7.0)  # gain 7.0 -> hit, kept (>=6.0)
    out3 = _player(5, clubs[4].id, Position.FWD, 50, form=0.0, pointsPerGame=0.0)
    in3 = _player(6, clubs[5].id, Position.FWD, 50, form=3.0, pointsPerGame=3.0)  # gain 3.0 -> hit, dropped (<6.0)
    db_session.add_all([out1, in1, out2, in2, out3, in3])
    await db_session.flush()
    await _seed_squad(
        db_session,
        fpl_team,
        gameweek,
        bank=100,
        owned=[(out1, 50, 50), (out2, 50, 50), (out3, 50, 50)],
    )

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.freeTransfersAvailable == 1
    by_out = {s.outPlayer.playerId: s for s in result.suggestions}
    assert set(by_out) == {out1.id, out2.id}  # out3's only option was dropped
    assert by_out[out1.id].requiresHit is False
    assert by_out[out2.id].requiresHit is True


async def test_candidate_priced_beyond_budget_is_not_suggested(db_session):
    fpl_team, gameweek = await _seed_team(db_session)
    clubs = [_club(i) for i in range(1, 4)]
    db_session.add_all(clubs)
    await db_session.flush()

    out = _player(1, clubs[0].id, Position.MID, 50, form=1.0, pointsPerGame=1.0)
    # Selling price 50 + bank 0 = budget 50. Both score better than `out`,
    # but only the affordable one should ever be suggested.
    too_expensive = _player(2, clubs[1].id, Position.MID, 51, form=10.0, pointsPerGame=10.0)
    affordable = _player(3, clubs[2].id, Position.MID, 50, form=5.0, pointsPerGame=5.0)
    db_session.add_all([out, too_expensive, affordable])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek, bank=0, owned=[(out, 50, 50)])

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert len(result.suggestions) == 1
    assert result.suggestions[0].inPlayer.playerId == affordable.id


async def test_a_swap_that_would_exceed_three_from_one_club_is_excluded(db_session):
    fpl_team, gameweek = await _seed_team(db_session)
    club_a = _club(1)  # already has 3 owned players
    club_b = _club(2)  # the player being considered for transfer out
    club_c = _club(3)  # a valid, if weaker, replacement
    db_session.add_all([club_a, club_b, club_c])
    await db_session.flush()

    a1 = _player(1, club_a.id, Position.DEF, 50, form=5.0, pointsPerGame=5.0)
    a2 = _player(2, club_a.id, Position.DEF, 50, form=5.0, pointsPerGame=5.0)
    a3 = _player(3, club_a.id, Position.DEF, 50, form=5.0, pointsPerGame=5.0)
    out = _player(4, club_b.id, Position.MID, 50, form=1.0, pointsPerGame=1.0)
    # Higher score than the club_c option, but buying it would make a 4th
    # club_a player — must be excluded despite scoring better.
    blocked_by_club_limit = _player(5, club_a.id, Position.MID, 50, form=10.0, pointsPerGame=10.0)
    valid_replacement = _player(6, club_c.id, Position.MID, 50, form=4.0, pointsPerGame=4.0)
    db_session.add_all([a1, a2, a3, out, blocked_by_club_limit, valid_replacement])
    await db_session.flush()
    await _seed_squad(
        db_session,
        fpl_team,
        gameweek,
        bank=100,
        owned=[(a1, 50, 50), (a2, 50, 50), (a3, 50, 50), (out, 50, 50)],
    )

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert len(result.suggestions) == 1
    assert result.suggestions[0].inPlayer.playerId == valid_replacement.id


async def test_a_same_club_swap_is_allowed_even_at_the_three_player_limit(db_session):
    """The max-3 check only applies cross-club — replacing one club_a
    player with a different club_a player never changes that club's
    count, so it should never be blocked by the limit."""
    fpl_team, gameweek = await _seed_team(db_session)
    club_a = _club(1)
    db_session.add(club_a)
    await db_session.flush()

    a1 = _player(1, club_a.id, Position.DEF, 50, form=5.0, pointsPerGame=5.0)
    a2 = _player(2, club_a.id, Position.DEF, 50, form=5.0, pointsPerGame=5.0)
    weak_out = _player(3, club_a.id, Position.DEF, 50, form=1.0, pointsPerGame=1.0)
    same_club_upgrade = _player(4, club_a.id, Position.DEF, 50, form=8.0, pointsPerGame=8.0)
    db_session.add_all([a1, a2, weak_out, same_club_upgrade])
    await db_session.flush()
    await _seed_squad(
        db_session, fpl_team, gameweek, bank=100, owned=[(a1, 50, 50), (a2, 50, 50), (weak_out, 50, 50)]
    )

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert len(result.suggestions) == 1
    assert result.suggestions[0].inPlayer.playerId == same_club_upgrade.id


async def test_a_low_minutes_pool_player_is_never_suggested_regardless_of_score(db_session):
    fpl_team, gameweek = await _seed_team(db_session)
    clubs = [_club(i) for i in range(1, 3)]
    db_session.add_all(clubs)
    await db_session.flush()

    out = _player(1, clubs[0].id, Position.FWD, 50, form=1.0, pointsPerGame=1.0)
    # Excellent stats, but far too small a sample (see MIN_RELIABLE_MINUTES)
    # to trust as an incoming signal.
    small_sample_star = _player(2, clubs[1].id, Position.FWD, 50, form=15.0, pointsPerGame=15.0, minutes=89)
    db_session.add_all([out, small_sample_star])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek, bank=100, owned=[(out, 50, 50)])

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.suggestions == []


async def test_a_marginal_gain_is_not_worth_suggesting(db_session):
    fpl_team, gameweek = await _seed_team(db_session)
    clubs = [_club(i) for i in range(1, 3)]
    db_session.add_all(clubs)
    await db_session.flush()

    out = _player(1, clubs[0].id, Position.GK, 50, form=5.0, pointsPerGame=5.0)  # score 5.0
    # gain 1.5 — below MIN_GAIN_TO_SUGGEST (2.0)
    barely_better = _player(2, clubs[1].id, Position.GK, 50, form=6.5, pointsPerGame=6.5)
    db_session.add_all([out, barely_better])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek, bank=100, owned=[(out, 50, 50)])

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.suggestions == []


async def test_each_side_of_a_suggestion_carries_its_own_price_direction(db_session):
    """costChangeEvent is read per player, not shared across the pair — a
    falling owned player swapped for a rising one should be labeled as
    exactly that, and a player imported before the field existed (None)
    reads as unchanged rather than erroring."""
    fpl_team, gameweek = await _seed_team(db_session, free_transfer_cap=2)
    club_a, club_b = _club(1), _club(2)
    db_session.add_all([club_a, club_b])
    await db_session.flush()

    falling_out = _player(1, club_a.id, Position.MID, 50, form=1.0, pointsPerGame=1.0, costChangeEvent=-1)
    rising_in = _player(2, club_b.id, Position.MID, 50, form=6.0, pointsPerGame=6.0, costChangeEvent=1)
    unknown_out = _player(3, club_a.id, Position.FWD, 50, form=1.0, pointsPerGame=1.0, costChangeEvent=None)
    steady_in = _player(4, club_b.id, Position.FWD, 50, form=6.0, pointsPerGame=6.0, costChangeEvent=0)
    db_session.add_all([falling_out, rising_in, unknown_out, steady_in])
    await db_session.flush()
    await _seed_squad(
        db_session, fpl_team, gameweek, bank=0, owned=[(falling_out, 50, 50), (unknown_out, 50, 50)]
    )

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    by_out_id = {s.outPlayer.playerId: s for s in result.suggestions}
    assert by_out_id[falling_out.id].outPlayerPriceDirection == "fallen"
    assert by_out_id[falling_out.id].inPlayerPriceDirection == "risen"
    assert by_out_id[unknown_out.id].outPlayerPriceDirection == "unchanged"
    assert by_out_id[unknown_out.id].inPlayerPriceDirection == "unchanged"


async def _seed_horizon_gameweeks(db_session, season_id: str, numbers: list[int]) -> dict[int, Gameweek]:
    gameweeks = {
        number: Gameweek(id=cuid(), seasonId=season_id, number=number, deadlineTime=datetime(2026, 8, 15 + number))
        for number in numbers
    }
    db_session.add_all(gameweeks.values())
    await db_session.flush()
    return gameweeks


async def test_an_easy_run_of_fixtures_beats_better_form_against_a_hard_run(db_session):
    """Two equally priced replacements: one in slightly better form but
    facing the hardest fixtures, one slightly worse but facing the easiest.
    Over a multi-gameweek horizon the easy run should win — the whole point
    of projecting beyond a single gameweek's form."""
    fpl_team, gameweek_1 = await _seed_team(db_session)
    owned_club, hard_club, easy_club, opponent = _club(1), _club(2), _club(3), _club(4)
    db_session.add_all([owned_club, hard_club, easy_club, opponent])
    await db_session.flush()
    gameweeks = {1: gameweek_1} | await _seed_horizon_gameweeks(db_session, gameweek_1.seasonId, [2, 3])

    fixture_id = 1
    for gameweek in gameweeks.values():
        for club, difficulty in [(hard_club, 5), (easy_club, 1), (owned_club, 3)]:
            db_session.add(
                Fixture(
                    id=fixture_id,
                    gameweekId=gameweek.id,
                    homeTeamId=club.id,
                    awayTeamId=opponent.id,
                    homeDifficulty=difficulty,
                    awayDifficulty=3,
                )
            )
            fixture_id += 1
    await db_session.flush()

    out = _player(1, owned_club.id, Position.MID, 50, form=1.0, pointsPerGame=1.0)
    in_form_hard_run = _player(2, hard_club.id, Position.MID, 50, form=6.0, pointsPerGame=6.0)
    slightly_worse_easy_run = _player(3, easy_club.id, Position.MID, 50, form=5.0, pointsPerGame=5.0)
    db_session.add_all([out, in_form_hard_run, slightly_worse_easy_run])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek_1, bank=0, owned=[(out, 50, 50)], average_fixtures=False)

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.horizonGameweeks == 5
    assert len(result.suggestions) == 1
    suggestion = result.suggestions[0]
    assert suggestion.inPlayer.playerId == slightly_worse_easy_run.id
    # Gameweeks 4-5 don't exist here, so they show up in the breakdown as
    # blanks for both sides rather than being dropped from it.
    assert [p.gameweekNumber for p in suggestion.gameweekProjections] == [1, 2, 3, 4, 5]
    assert [p.inDifficulties for p in suggestion.gameweekProjections] == [[1], [1], [1], [], []]
    assert [p.outDifficulties for p in suggestion.gameweekProjections] == [[3], [3], [3], [], []]
    assert suggestion.gameweekProjections[3].inProjectedPoints == 0.0
    # The breakdown sums to the headline gain (within per-gameweek rounding).
    breakdown_gain = sum(p.inProjectedPoints - p.outProjectedPoints for p in suggestion.gameweekProjections)
    assert abs(breakdown_gain - suggestion.projectedGain) < 0.05


async def test_a_double_gameweek_counts_both_fixtures_and_a_blank_counts_zero(db_session):
    fpl_team, gameweek_1 = await _seed_team(db_session)
    owned_club, double_club, opponent_a, opponent_b = _club(1), _club(2), _club(3), _club(4)
    db_session.add_all([owned_club, double_club, opponent_a, opponent_b])
    await db_session.flush()
    gameweek_2 = (await _seed_horizon_gameweeks(db_session, gameweek_1.seasonId, [2]))[2]

    db_session.add_all(
        [
            # Gameweek 1: owned_club plays once; double_club blanks.
            Fixture(
                id=1, gameweekId=gameweek_1.id, homeTeamId=owned_club.id, awayTeamId=opponent_a.id,
                homeDifficulty=3, awayDifficulty=3,
            ),
            # Gameweek 2: owned_club blanks; double_club plays twice.
            Fixture(
                id=2, gameweekId=gameweek_2.id, homeTeamId=double_club.id, awayTeamId=opponent_a.id,
                homeDifficulty=3, awayDifficulty=3,
            ),
            Fixture(
                id=3, gameweekId=gameweek_2.id, homeTeamId=opponent_b.id, awayTeamId=double_club.id,
                homeDifficulty=3, awayDifficulty=3,
            ),
        ]
    )
    await db_session.flush()

    out = _player(1, owned_club.id, Position.DEF, 50, form=2.0, pointsPerGame=2.0)
    double_gameweek_pick = _player(2, double_club.id, Position.DEF, 50, form=5.0, pointsPerGame=5.0)
    db_session.add_all([out, double_gameweek_pick])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek_1, bank=0, owned=[(out, 50, 50)], average_fixtures=False)

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert len(result.suggestions) == 1
    gw1, gw2 = result.suggestions[0].gameweekProjections[:2]
    assert (gw1.outProjectedPoints, gw1.inProjectedPoints) == (2.0, 0.0)
    assert gw2.inDifficulties == [3, 3]
    assert gw2.outProjectedPoints == 0.0
    assert gw2.inProjectedPoints == round(2 * 5.0 * HORIZON_DECAY, 2)


async def test_the_best_combination_finds_a_downgrade_that_funds_an_upgrade(db_session):
    """The greedy list checks each swap against bank + that one player's
    sale, so it can't see that selling an expensive midfielder for an
    equally good cheap one frees the cash for a forward upgrade. The joint
    combination should find exactly that pair of moves."""
    fpl_team, gameweek = await _seed_team(db_session, free_transfer_cap=2)
    clubs = [_club(i) for i in range(1, 5)]
    db_session.add_all(clubs)
    await db_session.flush()

    pricey_mid = _player(1, clubs[0].id, Position.MID, 100, form=5.0, pointsPerGame=5.0)
    weak_fwd = _player(2, clubs[1].id, Position.FWD, 60, form=1.0, pointsPerGame=1.0)
    cheap_mid = _player(3, clubs[2].id, Position.MID, 50, form=5.0, pointsPerGame=5.0)  # same score, 50 cheaper
    star_fwd = _player(4, clubs[3].id, Position.FWD, 110, form=10.0, pointsPerGame=10.0)  # 110 > 0 + 60
    db_session.add_all([pricey_mid, weak_fwd, cheap_mid, star_fwd])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek, bank=0, owned=[(pricey_mid, 100, 100), (weak_fwd, 60, 60)])

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.suggestions == []  # greedy: nothing affordable worth suggesting
    combination = result.bestCombination
    assert combination is not None
    pairs = [(t.outPlayer.playerId, t.inPlayer.playerId) for t in combination.transfers]
    assert pairs == [(weak_fwd.id, star_fwd.id), (pricey_mid.id, cheap_mid.id)]  # best pair first
    assert combination.totalProjectedGain == 9.0
    assert combination.hits == 0
    assert combination.netProjectedGain == 9.0
    assert all(not t.requiresHit for t in combination.transfers)


async def test_no_combination_is_returned_when_nothing_is_worth_doing(db_session):
    fpl_team, gameweek = await _seed_team(db_session)
    clubs = [_club(i) for i in range(1, 3)]
    db_session.add_all(clubs)
    await db_session.flush()

    out = _player(1, clubs[0].id, Position.GK, 50, form=5.0, pointsPerGame=5.0)
    barely_better = _player(2, clubs[1].id, Position.GK, 50, form=6.0, pointsPerGame=6.0)
    db_session.add_all([out, barely_better])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek, bank=100, owned=[(out, 50, 50)])

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.bestCombination is None
