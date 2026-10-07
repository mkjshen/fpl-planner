"""Joint multi-transfer selection as a small 0/1 integer program — the
counterpart to suggestions.py's per-player greedy list. Greedy picks each
owned player's best replacement independently, so it can't see combinations
that only work together (e.g. downgrading one player to fund an upgrade
elsewhere), and it checks the budget and club limit one swap at a time. This
chooses the whole set of sells and buys at once, subject to every squad rule
jointly.

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
# holding up the suggestions response — this problem size (15 owned, a few
# hundred pool players) normally solves in well under a second.
SOLVER_TIME_LIMIT_SECONDS = 5


@dataclass(frozen=True)
class OwnedOption:
    player_id: int
    position: str
    club_id: int
    selling_price: int
    projected_points: float


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


def best_transfer_set(
    owned: list[OwnedOption],
    pool: list[PoolOption],
    bank: int,
    free_transfers: int,
    transfer_margin: float,
    hit_cost: float,
    max_hits: int,
) -> TransferSet | None:
    """The set of transfers maximizing total projected gain, where every
    transfer must earn `transfer_margin` and every transfer beyond
    `free_transfers` must also pay `hit_cost`. Constraints, all applied to
    the final squad rather than swap by swap:
    - each position sells exactly as many players as it buys, so the
      2/5/5/3 shape the squad already has is preserved;
    - incoming prices are covered by bank plus outgoing selling prices;
    - no club ends up with more than MAX_PER_CLUB players;
    - at most `max_hits` hits, i.e. at most free_transfers + max_hits moves.
    Returns an empty TransferSet when no transfer is worth making, and None
    if the solver doesn't reach a proven optimum."""
    problem = pulp.LpProblem("transfers", pulp.LpMaximize)
    sell = {o.player_id: problem.add_variable(f"sell_{o.player_id}", cat="Binary") for o in owned}
    buy = {p.player_id: problem.add_variable(f"buy_{p.player_id}", cat="Binary") for p in pool}
    hits = problem.add_variable("hits", lowBound=0, cat="Integer")

    transfer_count = pulp.lpSum(sell.values())
    problem += (
        pulp.lpSum(p.projected_points * buy[p.player_id] for p in pool)
        - pulp.lpSum(o.projected_points * sell[o.player_id] for o in owned)
        - transfer_margin * transfer_count
        - hit_cost * hits
    )

    problem += hits >= transfer_count - free_transfers
    problem += hits <= max_hits

    for position in {o.position for o in owned} | {p.position for p in pool}:
        problem += pulp.lpSum(sell[o.player_id] for o in owned if o.position == position) == pulp.lpSum(
            buy[p.player_id] for p in pool if p.position == position
        )

    problem += pulp.lpSum(p.price * buy[p.player_id] for p in pool) <= bank + pulp.lpSum(
        o.selling_price * sell[o.player_id] for o in owned
    )

    for club_id in {o.club_id for o in owned} | {p.club_id for p in pool}:
        owned_from_club = [o for o in owned if o.club_id == club_id]
        problem += (
            len(owned_from_club)
            - pulp.lpSum(sell[o.player_id] for o in owned_from_club)
            + pulp.lpSum(buy[p.player_id] for p in pool if p.club_id == club_id)
            <= MAX_PER_CLUB
        )

    problem.solve(pulp.HiGHS(msg=False, timeLimit=SOLVER_TIME_LIMIT_SECONDS))
    if pulp.LpStatus[problem.status] != "Optimal":
        return None

    sold = [o for o in owned if sell[o.player_id].value() > 0.5]
    bought = [p for p in pool if buy[p.player_id].value() > 0.5]
    return TransferSet(pairs=_pair_by_position(sold, bought), hits=round(hits.value()))


def _pair_by_position(sold: list[OwnedOption], bought: list[PoolOption]) -> list[tuple[int, int]]:
    """Budget and club limits apply to the set as a whole, so any
    same-position pairing of the sells and buys is equally valid — this one
    matches the weakest outgoing player with the strongest incoming one, so
    the per-pair gains read naturally."""
    pairs = []
    for position in sorted({o.position for o in sold}):
        outs = sorted((o for o in sold if o.position == position), key=lambda o: o.projected_points)
        ins = sorted(
            (p for p in bought if p.position == position), key=lambda p: p.projected_points, reverse=True
        )
        pairs.extend((o.player_id, p.player_id) for o, p in zip(outs, ins))
    return pairs
