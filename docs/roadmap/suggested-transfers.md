# Suggested Transfers roadmap

## Context

The first version of suggested transfers (`apps/api/app/services/suggestions.py`) is a simple heuristic. For each owned player it finds the single best same-position replacement, scored by `0.6*form + 0.4*pointsPerGame` and discounted by availability. It doesn't know about fixtures, doesn't look beyond the next gameweek, ignores price changes, and picks each swap without considering the others.

This roadmap improves it in four phases. In line with the project's non-goals, every score stays a transparent, tunable formula rather than a trained model.

| Phase | Status |
| --- | --- |
| 1. Fixture-difficulty groundwork | Done (`cf07335`) |
| 2. Price-change risk groundwork | Done (`577e482`) |
| 2b. Show the price signal | Done |
| 3. Multi-gameweek horizon | Not started |
| 4. Multi-transfer optimization | Not started |

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

## Remaining

### 3. Multi-gameweek horizon (depends on Phase 1)

- Add a new scoring function next to `_player_score` in `suggestions.py`. It projects value over the next N gameweeks using `upcoming_difficulty()`:
  - each gameweek's base value (from form/PPG) is scaled by a difficulty multiplier
  - gameweeks further out count for less
  - a double gameweek adds the value of each fixture; a blank counts as 0
- Numbers to decide before building: N (e.g. 5), how fast later gameweeks lose weight, and how difficulty maps to a multiplier.
- Add a per-gameweek breakdown to `SuggestedTransferOut` and show it on the suggestion card, so users can see why a player is favoured.
- Re-tune the existing minimum-gain and hit-payback thresholds for the new score scale.
- Tests: pure tests for the projection maths (including double and blank gameweeks), plus updates to `test_suggestions_integration.py`.

### 4. Multi-transfer optimization (last)

- Add PuLP to `apps/api/requirements.txt`. It's pure Python, so it installs easily without Docker.
- Replace the one-player-at-a-time greedy loop with a small 0/1 integer program:
  - inputs: free transfers available and the -4 hit cost
  - constraints: bank plus sell prices, max 3 players per club, and a valid 2/5/5/3 squad
  - goal: the biggest total projected gain from Phase 3, minus any hits
- The same approach can cover Wildcard and Free Hit gameweeks (no hit cost, any mix of positions).
- Add integration tests that check every constraint across all the chosen swaps at once, not just each swap on its own.
- Frontend: show the suggested set of transfers, possibly with an "apply all" into the planner.

## Applies to every phase

- Any database change means updating `packages/db/prisma/schema.prisma`, adding a migration, and hand-updating `apps/api/app/db/models.py` to match. Nothing checks that these stay in sync.
- Update the "suggested transfers" status note in `CLAUDE.md` as each phase lands.
- Tests follow the existing split: `test_<feature>_pure.py` for logic with no database, `test_<feature>_integration.py` for anything that runs against Postgres.

## Verification (each phase)

- Run `pytest -v` in `apps/api`. New tests should pass, and existing `test_suggestions_*` tests should still pass or be deliberately updated.
- Run Jest for any changed suggestion card, and extend `apps/web/e2e/suggestions.spec.ts`.
- Import a real team, call `GET /teams/by-user/{id}/suggestions/{gw}`, and sanity-check that tough or easy fixture runs and double/blank gameweeks change the rankings in sensible ways.
