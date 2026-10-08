"""Joint multi-transfer selection as a small 0/1 integer program — the
counterpart to suggestions.py's per-player greedy list. Greedy picks each
owned player's best replacement independently, so it can't see combinations
that only work together (e.g. downgrading one player to fund an upgrade
elsewhere), and it checks the budget and club limit one swap at a time. This
chooses the whole set of transfers at once, subject to every squad rule
jointly.

The decision variables are *pairs* (this owned player out, that pool player
in, same position), not separate sells and buys: an incoming player takes the
outgoing player's slot, and a slot's worth depends on whether it starts (see
OwnedOption.weight). Choosing sells and buys independently and pairing them
afterwards can't value that, and made the pairing a cosmetic afterthought.

Pure: plain data in, plain data out, no DB — so it can be tested directly
and run off the event loop (the solve is synchronous and CPU-bound).

Solved with HiGHS (via the `highspy` package) rather than PuLP's bundled
CBC: PuLP 3.3 deprecates the bundled binary, and its replacement package
(`cbcbox`) had no single version published for both macOS arm64 and Linux
x86_64. highspy ships wheels for both and runs in-process, with no
external solver binary to locate."""

from dataclasses import dataclass

import pulp

MAX_PER_CLUB = 3
# A solve that hasn't finished by then returns no combination rather than
# holding up the suggestions response.
SOLVER_TIME_LIMIT_SECONDS = 5
# Per position, only the strongest and the cheapest pool players become
# candidates: a top-projected player is the only kind worth buying for
# points, and a cheap one is the only kind worth buying to free up money.
# Keeps the model to a few hundred pairs instead of a few thousand.
TOP_CANDIDATES_PER_POSITION = 40
CHEAPEST_CANDIDATES_PER_POSITION = 10


@dataclass(frozen=True)
class OwnedOption:
    player_id: int
    position: str
    club_id: int
    selling_price: int
    projected_points: float
    # How much this squad slot's points actually count: 1.0 for a starter,
    # far less on the bench (only an auto-sub brings them in). A transfer's
    # gain is scaled by the weight of the slot the incoming player takes.
    weight: float = 1.0


@dataclass(frozen=True)
class PoolOption:
    player_id: int
    position: str
    club_id: int
    price: int
    projected_points: float


@dataclass(frozen=True)
class TransferSet:
    # (outPlayerId, inPlayerId) pairs, same position within each pair.
    pairs: list[tuple[int, int]]
    hits: int


def pair_gain(out: OwnedOption, incoming: PoolOption) -> float:
    """What swapping `out` for `incoming` is worth: the difference in
    projected points, counted only as much as `out`'s slot counts."""
    return (incoming.projected_points - out.projected_points) * out.weight


def _candidates(pool: list[PoolOption]) -> list[PoolOption]:
    kept: dict[int, PoolOption] = {}
    for position in {p.position for p in pool}:
        players = [p for p in pool if p.position == position]
        for p in sorted(players, key=lambda p: p.projected_points, reverse=True)[:TOP_CANDIDATES_PER_POSITION]:
            kept[p.player_id] = p
        for p in sorted(players, key=lambda p: p.price)[:CHEAPEST_CANDIDATES_PER_POSITION]:
            kept[p.player_id] = p
    return list(kept.values())


def best_transfer_set(
    owned: list[OwnedOption],
    pool: list[PoolOption],
    bank: int,
    free_transfers: int,
    transfer_margin: float,
    hit_cost: float,
    max_hits: int,
) -> TransferSet | None:
    """The set of same-position transfers maximizing total gain (see
    pair_gain), where every transfer must earn `transfer_margin` and every
    transfer beyond `free_transfers` must also pay `hit_cost`. Constraints,
    all applied to the final squad rather than swap by swap:
    - each owned player leaves at most once, each pool player arrives at most
      once, and every pair is same-position, so the 2/5/5/3 shape holds;
    - incoming prices are covered by bank plus outgoing selling prices;
    - no club ends up with more than MAX_PER_CLUB players;
    - at most `max_hits` hits, i.e. at most free_transfers + max_hits moves.
    Returns an empty TransferSet when no transfer is worth making, and None
    if the solver doesn't reach a proven optimum."""
    candidates = _candidates(pool)
    problem = pulp.LpProblem("transfers", pulp.LpMaximize)
    pairs = {
        (o.player_id, p.player_id): (o, p, problem.add_variable(f"swap_{o.player_id}_{p.player_id}", cat="Binary"))
        for o in owned
        for p in candidates
        if p.position == o.position
    }
    hits = problem.add_variable("hits", lowBound=0, cat="Integer")

    transfer_count = pulp.lpSum(x for _, _, x in pairs.values())
    problem += (
        pulp.lpSum((pair_gain(o, p) - transfer_margin) * x for o, p, x in pairs.values()) - hit_cost * hits
    )

    problem += hits >= transfer_count - free_transfers
    problem += hits <= max_hits

    for o in owned:
        problem += pulp.lpSum(x for (out_id, _), (_, _, x) in pairs.items() if out_id == o.player_id) <= 1
    for p in candidates:
        problem += pulp.lpSum(x for (_, in_id), (_, _, x) in pairs.items() if in_id == p.player_id) <= 1

    problem += pulp.lpSum((p.price - o.selling_price) * x for o, p, x in pairs.values()) <= bank

    for club_id in {o.club_id for o in owned} | {p.club_id for p in candidates}:
        owned_from_club = sum(1 for o in owned if o.club_id == club_id)
        problem += (
            owned_from_club
            - pulp.lpSum(x for o, _, x in pairs.values() if o.club_id == club_id)
            + pulp.lpSum(x for _, p, x in pairs.values() if p.club_id == club_id)
            <= MAX_PER_CLUB
        )

    problem.solve(pulp.HiGHS(msg=False, timeLimit=SOLVER_TIME_LIMIT_SECONDS))
    if pulp.LpStatus[problem.status] != "Optimal":
        return None

    chosen = [key for key, (_, _, x) in pairs.items() if x.value() > 0.5]
    return TransferSet(pairs=chosen, hits=round(hits.value()))
