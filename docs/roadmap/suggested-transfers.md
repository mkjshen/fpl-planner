# Suggested Transfers roadmap

## Context

The first version of suggested transfers (`apps/api/app/services/suggestions.py`) is a simple heuristic. For each owned player it finds the single best same-position replacement, scored by `0.6*form + 0.4*pointsPerGame` and discounted by availability. It doesn't know about fixtures, doesn't look beyond the next gameweek, ignores price changes, and picks each swap without considering the others.

This roadmap improves it in four phases. In line with the project's non-goals, every score stays a transparent, tunable formula rather than a trained model.

| Phase | Status |
| --- | --- |
| 1. Fixture-difficulty groundwork | Done (`cf07335`) |
| 2. Price-change risk groundwork | Done (`577e482`) |
| 2b. Show the price signal | Done |
| 3. Multi-gameweek horizon | Done |
| 4. Multi-transfer optimization | Done |

## Done

### 1. Fixture-difficulty groundwork

- `Fixture.homeDifficulty` / `awayDifficulty` hold FPL's own 1-5 rating, taken from the fixtures endpoint the importer already calls.
- `apps/api/app/services/fixtures.py:upcoming_difficulty` returns each club's difficulty per gameweek for the coming gameweeks. It handles double gameweeks (several entries) and blanks (none). It also contains the per-club fixture grouping that `squad.py` uses, so that logic isn't duplicated.

### 2. Price-change risk groundwork

- `Player.costChangeEvent` / `transfersInEvent` / `transfersOutEvent` are imported from the FPL bootstrap snapshot.
- `PlayerPriceHistory` gets a new row only when a player's price changes, so it builds up a real price history without a duplicate row on every import.
- `apps/api/app/services/price_trends.py:price_direction` only reports a price move that has already happened (risen / fallen / unchanged). It doesn't predict future moves.

Neither phase changed how suggestions are scored.

### 2b. Show the price signal

- Each suggestion carries `outPlayerPriceDirection` / `inPlayerPriceDirection`, computed with `price_direction()` for each side separately.
- The suggestion card shows ▲ (rose today) or ▼ (fell today) next to each name, with a tooltip and screen-reader label. An unchanged price shows nothing.
- It's display only and doesn't affect the score or ranking.
- Still to do, optionally: a "large net transfers in, no rise yet" warning using `transfersInEvent - transfersOutEvent`. Label it as a heuristic, because FPL doesn't publish its price-change thresholds.

### 3. Multi-gameweek horizon

- `projectedGain` is now total projected points over the planned gameweek plus the next 4, not one gameweek's form. `_horizon_projection` in `suggestions.py` computes it:
  - each fixture scales the player's `_player_score` by a difficulty multiplier (FDR 1 → 1.3×, 2 → 1.15×, 3 → 1.0×, 4 → 0.85×, 5 → 0.7×)
  - a double gameweek adds both fixtures; a blank counts as 0
  - each gameweek further out counts 0.85× the one before
  - availability applies to the whole horizon, because FPL only reports chance of playing for the next round
- Thresholds were re-set for the new scale. A free suggestion needs a gain of at least 2.0. A hit needs to beat the -4 itself plus that same margin (6.0), so the hit is compared directly instead of through a payback rule of thumb.
- Each suggestion has a `gameweekProjections` breakdown (fixture ratings and projected points for each side per gameweek), and the response includes `horizonGameweeks`.
- The card shows a 5-cell fixture strip for the incoming player, coloured by difficulty. A double is split into two segments and a blank is an empty outline. Hovering a cell shows both players' numbers for that gameweek.
- Every constant (`HORIZON_GAMEWEEKS`, `HORIZON_DECAY`, `DIFFICULTY_MULTIPLIER`, thresholds) is hand-picked, not fitted to past results.

### 4. Multi-transfer optimization

- `apps/api/app/services/transfer_optimizer.py:best_transfer_set` picks the whole set of sells and buys at once, as a 0/1 integer program in PuLP, solved by HiGHS (`highspy`):
  - **objective:** maximize projected gain, charging every transfer the 2.0 margin and every hit an extra 4, so it uses the same bars as the single-transfer cards
  - **constraints, on the final squad:** each position sells as many as it buys (2/5/5/3 is kept), purchases are covered by bank plus sell prices, and no club has more than 3 players
  - **at most 2 hits (−8).** Uncapped, it recommended 9 transfers for −24 on a real squad: each hit only has to beat a 5-gameweek projection built from noisy form stats, so the solver can always find enough apparent gains to justify one more. A bigger overhaul is what a Wildcard is for.
- It finds moves the single-transfer cards can't, such as downgrading one player to fund an upgrade elsewhere.
- The module has no database access: plain data in, plain data out. It runs in a worker thread (`asyncio.to_thread`) so it doesn't block the event loop. It solves in about 25–60 ms on real squads, with a 5-second limit after which no combination is returned.
- The response has a `bestCombination` field (pairs, total gain, hits, net gain). The planner shows it above the cards with an **Apply all** button, which applies each pair through the same handler as a single card. It only appears when:
  - it has 2 or more transfers
  - no transfers have been made or started yet
  - no Wildcard or Free Hit is active
- **Why HiGHS rather than CBC:** PuLP 3.3 deprecates its bundled CBC, and the recommended replacement package (`cbcbox`) had no single version published for both macOS arm64 and Linux x86_64 (CI).

## Possible next steps

- Solve Wildcard and Free Hit gameweeks: no hit cost and any mix of positions. This needs the active chip passed to the endpoint, since today the chip is only planner state until Save.
- A "large net transfers in, no rise yet" price warning (see 2b).
- Re-tune the hand-picked constants once there's a way to compare suggestions with real points afterwards.

## Applies to every phase

- Any database change means updating `packages/db/prisma/schema.prisma`, adding a migration, and hand-updating `apps/api/app/db/models.py` to match. Nothing checks that these stay in sync.
- Update the "suggested transfers" status note in `CLAUDE.md` as each phase lands.
- Tests follow the existing split: `test_<feature>_pure.py` for logic with no database, `test_<feature>_integration.py` for anything that runs against Postgres.

## Verification (each phase)

- Run `pytest -v` in `apps/api`. New tests should pass, and existing `test_suggestions_*` tests should still pass or be deliberately updated.
- Run Jest for any changed suggestion card, and extend `apps/web/e2e/suggestions.spec.ts`.
- Import a real team, call `GET /teams/by-user/{id}/suggestions/{gw}`, and sanity-check that tough or easy fixture runs and double/blank gameweeks change the rankings in sensible ways.
