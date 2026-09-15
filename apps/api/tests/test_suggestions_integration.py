"""Integration tests for app/services/suggestions.py against a real Postgres
database (see conftest.py's db_session fixture) — each exercises one
constraint of the full owned-squad -> pool -> ranking -> hit-labeling path
that a pure-function test can't reach (the query itself, not just the
scoring formula)."""

from datetime import datetime

from app.db.models import Club, FplTeam, Gameweek, Player, Position, Season, SquadPlayer, SquadSnapshot, User, cuid
from app.services.suggestions import suggest_transfers


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


async def _seed_squad(
    db_session, fpl_team: FplTeam, gameweek: Gameweek, bank: int, owned: list[tuple[Player, int, int]]
) -> None:
    """`owned`: (player, purchasePrice, sellingPrice) per squad slot."""
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
    out1 = _player(1, clubs[0].id, Position.MID, 50, form=0.0, pointsPerGame=0.0)
    in1 = _player(2, clubs[1].id, Position.MID, 50, form=5.0, pointsPerGame=5.0)  # gain 5.0 -> free
    out2 = _player(3, clubs[2].id, Position.DEF, 50, form=0.0, pointsPerGame=0.0)
    in2 = _player(4, clubs[3].id, Position.DEF, 50, form=2.0, pointsPerGame=2.0)  # gain 2.0 -> hit, kept (>=1.5)
    out3 = _player(5, clubs[4].id, Position.FWD, 50, form=0.0, pointsPerGame=0.0)
    in3 = _player(6, clubs[5].id, Position.FWD, 50, form=1.0, pointsPerGame=1.0)  # gain 1.0 -> hit, dropped (<1.5)
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
    barely_better = _player(2, clubs[1].id, Position.GK, 50, form=5.4, pointsPerGame=5.4)  # score 5.4, gain 0.4
    db_session.add_all([out, barely_better])
    await db_session.flush()
    await _seed_squad(db_session, fpl_team, gameweek, bank=100, owned=[(out, 50, 50)])

    result = await suggest_transfers(db_session, fpl_team, gameweek_number=1)

    assert result.suggestions == []
