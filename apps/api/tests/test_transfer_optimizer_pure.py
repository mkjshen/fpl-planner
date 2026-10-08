"""Pure tests for app/services/transfer_optimizer.py — the solver runs
in-process, so no DB is needed. Each test pins down a case the greedy
one-swap-at-a-time list in suggestions.py can't get right on its own."""

from app.services.transfer_optimizer import OwnedOption, PoolOption, best_transfer_set

# The same margins and cap suggestions.py passes in.
MARGIN = 2.0
HIT = 4
MAX_HITS = 2


def _owned(player_id, position, club_id, selling_price, points, weight=1.0):
    return OwnedOption(player_id, position, club_id, selling_price, points, weight)


def _pool(player_id, position, club_id, price, points):
    return PoolOption(player_id, position, club_id, price, points)


def _solve(owned, pool, bank=0, free_transfers=1, max_hits=MAX_HITS):
    return best_transfer_set(
        owned, pool, bank, free_transfers, transfer_margin=MARGIN, hit_cost=HIT, max_hits=max_hits
    )


def test_no_worthwhile_transfer_returns_an_empty_set():
    owned = [_owned(1, "MID", 1, 50, 10.0)]
    pool = [_pool(2, "MID", 2, 50, 11.0)]  # gain 1.0, below the margin
    result = _solve(owned, pool)
    assert result is not None
    assert result.pairs == []
    assert result.hits == 0


def test_a_downgrade_can_fund_an_upgrade_elsewhere():
    """The headline case: neither upgrade is affordable on its own budget,
    but selling a pricey underperformer for a cheap one frees enough cash.
    Greedy evaluates each swap against bank + that one player's sale only,
    so it can never find this."""
    owned = [
        _owned(1, "MID", 1, 100, 10.0),  # pricey, underperforming
        _owned(2, "FWD", 2, 60, 5.0),
    ]
    pool = [
        _pool(3, "MID", 3, 50, 10.0),  # cheap like-for-like
        _pool(4, "FWD", 4, 110, 25.0),  # star: 110 > bank 0 + 60
    ]
    result = _solve(owned, pool, bank=0, free_transfers=2)
    assert sorted(result.pairs) == [(1, 3), (2, 4)]
    assert result.hits == 0


def test_the_club_limit_applies_to_the_whole_set():
    """Already owning 2 from club 9, two separately great club-9 buys would
    each pass a one-at-a-time check — together they'd make 4."""
    owned = [
        _owned(1, "DEF", 9, 50, 5.0),
        _owned(2, "DEF", 9, 50, 5.0),
        _owned(3, "MID", 1, 50, 1.0),
        _owned(4, "FWD", 2, 50, 1.0),
    ]
    pool = [
        _pool(5, "MID", 9, 50, 20.0),
        _pool(6, "FWD", 9, 50, 19.0),
        _pool(7, "FWD", 3, 50, 10.0),  # the next best non-club-9 forward
    ]
    result = _solve(owned, pool, free_transfers=2)
    assert sorted(result.pairs) == [(3, 5), (4, 7)]


def test_the_budget_applies_to_the_whole_set():
    owned = [_owned(1, "DEF", 1, 50, 1.0), _owned(2, "MID", 2, 50, 1.0)]
    # Each upgrade costs 10 more than its sale; bank 10 covers only one.
    pool = [_pool(3, "DEF", 3, 60, 12.0), _pool(4, "MID", 4, 60, 10.0)]
    result = _solve(owned, pool, bank=10, free_transfers=2)
    assert result.pairs == [(1, 3)]


def test_a_hit_is_only_taken_when_it_pays_for_itself_and_the_margin():
    owned = [_owned(1, "DEF", 1, 50, 0.0), _owned(2, "MID", 2, 50, 0.0), _owned(3, "FWD", 3, 50, 0.0)]
    pool = [
        _pool(4, "DEF", 4, 50, 9.0),  # free
        _pool(5, "MID", 5, 50, 7.0),  # hit: 7.0 >= 4 + 2.0 margin -> worth it
        _pool(6, "FWD", 6, 50, 5.0),  # hit: 5.0 < 6.0 -> not worth it
    ]
    result = _solve(owned, pool, free_transfers=1)
    assert sorted(result.pairs) == [(1, 4), (2, 5)]
    assert result.hits == 1


def test_rolled_over_free_transfers_are_used_before_any_hit():
    owned = [_owned(1, "DEF", 1, 50, 0.0), _owned(2, "MID", 2, 50, 0.0)]
    pool = [_pool(3, "DEF", 3, 50, 3.0), _pool(4, "MID", 4, 50, 3.0)]
    result = _solve(owned, pool, free_transfers=2)
    assert len(result.pairs) == 2
    assert result.hits == 0


def test_every_pair_keeps_the_same_position():
    owned = [_owned(1, "GK", 1, 50, 0.0), _owned(2, "DEF", 2, 50, 0.0)]
    # The best two pool players are both defenders, but selling the
    # goalkeeper for a defender would break the 2/5/5/3 shape.
    pool = [_pool(3, "DEF", 3, 50, 10.0), _pool(4, "DEF", 4, 50, 9.0), _pool(5, "GK", 5, 50, 3.0)]
    result = _solve(owned, pool, free_transfers=2)
    assert sorted(result.pairs) == [(1, 5), (2, 3)]


def test_the_stronger_buy_takes_the_starting_slot_not_the_bench_one():
    """Pairs are chosen with the slot in mind: the better incoming player
    replaces the starter, whose points count in full, rather than the bench
    player, whose points mostly don't."""
    owned = [
        _owned(1, "MID", 1, 50, 2.0, weight=1.0),  # starter
        _owned(2, "MID", 2, 50, 1.0, weight=0.15),  # bench
    ]
    pool = [_pool(3, "MID", 3, 50, 12.0), _pool(4, "MID", 4, 50, 6.0)]
    result = _solve(owned, pool, free_transfers=2)
    assert (1, 3) in result.pairs


def test_a_bench_upgrade_alone_is_not_worth_a_transfer():
    """+10 projected points for a bench player is worth 10 x 0.15 = 1.5
    once scaled by the slot, under the 2.0 margin every transfer must earn."""
    owned = [_owned(1, "GK", 1, 50, 0.0, weight=0.15)]
    pool = [_pool(2, "GK", 2, 50, 10.0)]
    result = _solve(owned, pool, free_transfers=1)
    assert result.pairs == []


def test_pair_gain_scales_the_difference_by_the_slot():
    from app.services.transfer_optimizer import pair_gain

    assert pair_gain(_owned(1, "MID", 1, 50, 2.0, weight=0.15), _pool(2, "MID", 2, 50, 12.0)) == 1.5
    assert pair_gain(_owned(1, "MID", 1, 50, 2.0), _pool(2, "MID", 2, 50, 12.0)) == 10.0


def test_hits_are_capped_even_when_each_would_pay_for_itself():
    """Every one of these four swaps clears the hit bar on its own, but with
    1 free transfer and at most 2 hits only the best three are taken."""
    owned = [_owned(i, "MID", i, 50, 0.0) for i in range(1, 5)]
    pool = [_pool(10 + i, "MID", 10 + i, 50, 20.0 - i) for i in range(1, 5)]
    result = _solve(owned, pool, free_transfers=1, max_hits=2)
    assert len(result.pairs) == 3
    assert result.hits == 2
    assert {in_id for _, in_id in result.pairs} == {11, 12, 13}
