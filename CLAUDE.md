# FPL Team Planner — Project Context

## What this is
A classic Fantasy Premier League team-planning web app, built as a portfolio project to demonstrate a specific set of technologies for job applications. Prioritize doing things the way a production app would rather than the fastest way to a working demo — the point is to have real, defensible work to talk about in interviews, not just a functioning tool.

## Audience and scope
Built for any classic FPL manager to use, not just for my own team. A user provides their FPL team ID, and the app pulls their current squad, bank balance, and transfer history from the public FPL API. No FPL login is required for reads. The app has its own user accounts (separate from FPL) so people can save settings and get planning suggestions across sessions.

## Tech stack

**Frontend**
- Next.js (TypeScript)
- Tailwind CSS
- NextAuth.js (Auth.js) for authentication
- Zod for runtime input validation

**Backend**
- FastAPI (Python)
- Pydantic for request/response validation

**Data**
- PostgreSQL
- Prisma — schema/migrations source of truth, and the ORM used directly by the Next.js frontend
- SQLAlchemy (async) + asyncpg — FastAPI's own data access against that same database, since Prisma has no working Python client (see "Status and deviations from this plan" below)

**Testing**
- Playwright for end-to-end tests
- Pytest for backend/Python unit tests
- Jest for frontend unit tests

**Infrastructure**
- Docker
- Kubernetes
- Terraform for provisioning
- GitHub Actions for CI/CD
- Prometheus + Grafana for monitoring

**Optional**
- Redis for caching frequently-requested player/fixture data

## Classic FPL rules to encode

- Squad: 15 players total — 2 GK, 5 DEF, 5 MID, 3 FWD — within a £100m budget
- Starting XI: 11 players — 1 GK, 3–5 DEF, 2–5 MID, 1–3 FWD
- Captaincy: captain's points double; vice-captain scores instead if the captain doesn't play
- Transfers: one free transfer banks per gameweek (verify the current cap and rollover rule against the live FPL rules rather than assuming — this has changed between seasons); each additional transfer costs -4 points
- Player prices move up and down through the season based on transfer volume. Track purchase price separately from current price — selling a player who's risen in value only returns part of the gain, not the full current price
- Chips: Wildcard, Free Hit, Bench Boost, Triple Captain — each usable a limited number of times per season (verify the current season's exact chip set and any new chips against the live rules)

## Data sources

- Official FPL API (`fantasy.premierleague.com/api`) — player data, fixtures, and any manager's squad/history via their numeric team ID. No auth needed for reads.
- A separate source (e.g. Understat, FBref) for advanced per-90 stats like xG and xA, since the official API only exposes raw totals. These will need to be merged with official player IDs.

## Build order

1. Data model and auth (users, squads, transfer history)
2. Squad import from a team ID and read-only squad view
3. Transfer planner (with the -4 hit tradeoff)
4. Chip strategy features
5. Playwright + Pytest coverage, Docker/Kubernetes setup, CI pipeline, monitoring

## Status and deviations from this plan

Progress so far covers build steps 1-4. Notable departures from what's written above:

- **Step 3 (transfer planner) is scoped to same-position swaps outside a chip.** For any future gameweek, you can transfer a squad player out for any other real player of the same position from the full FPL player pool, tracked against bank/budget, with free-transfer rollover and the -4-per-extra-transfer hit. There's no separate "must replace with the same position" check in the backend, though — it's algebraically implied by the requirement that the proposed 15 stay exactly 2 GK/5 DEF/5 MID/3 FWD (the prior squad already satisfies that invariant, so outgoing and incoming players necessarily match position-for-position in aggregate, for any number of simultaneous swaps). What actually limits a normal save to one-for-one same-position transfers is the frontend's transfer flow (one blank slot, filtered to the outgoing player's position), not a backend restriction — a multi-transfer basket was never really blocked server-side. A few further simplifications, each disclosed rather than hidden:
  - **Purchase price is approximated as "bought at today's price" on import**, since the FPL API's picks endpoint doesn't expose true historical purchase price — confirmed by directly checking the live API, not assumed. This understates real profit/loss for players held since before they were tracked here.
  - **Free-transfer availability is replayed from the manager's real FPL history** (`GET entry/{id}/history/`, imported per team): actual transfers made each past gameweek plus any Wildcard/Free Hit gameweeks (which don't consume or roll the saved free transfer) are walked forward through FPL's real rollover rule from gameweek 2 to today, then continued through this planner's own saved plans for future gameweeks — including any planned this way through the chip strategy feature below.
  - **Editing an earlier gameweek's plan doesn't retroactively re-validate later ones.** Since transfers change squad membership (unlike pure lineup reshuffling, which is always mutually compatible across gameweeks), an earlier edit can leave a later, already-saved plan referencing stale prices/bank. Rather than cascading recomputation, saving surfaces a `laterPlansAffected` flag and the planner shows a dismissible banner pointing at "Reset all plans" as the fix — visibility instead of silent drift.
  - The sell-price formula (`purchasePrice + floor((currentPrice - purchasePrice) / 2)` on a rise, full price on a drop) is reproduced from public community knowledge of how FPL works, not an official published spec.
- **Step 4 (chip strategy) covers planning one chip per future gameweek — Wildcard, Free Hit, Bench Boost, or Triple Captain.** Wildcard and Free Hit waive the -4-per-transfer hit entirely for that gameweek (any number of transfers, any position mix, as long as the resulting 15 is still legal and affordable) and relax the frontend's transfer-in picker to any position instead of just the outgoing player's. Free Hit's squad also doesn't carry forward: the *next* gameweek's baseline reverts to the last non-Free-Hit plan, matching how a real Free Hit auto-reverts. Bench Boost and Triple Captain are purely a recorded choice with no transfer or scoring effect — this app doesn't simulate live points, so there's nothing for them to actually change here.
  - **Each chip's usable gameweek windows come straight from the FPL bootstrap API's `chips` list**, not an assumed split — it returns one entry per window (real FPL: two, first half and second half) with its own `start_event`/`stop_event` (`ChipWindow` table). A window is single-use and doesn't roll into the next one: planning a chip checks the specific window covering *that* gameweek, and an unused window whose `stopEvent` has already passed shows as expired/lost rather than still spendable — confirmed against the live API rather than hardcoding where the season's halves split (currently gameweeks 1/2-19 and 20-38, but that's read fresh on every import, not assumed to hold next season).
  - **No protection against a race between two concurrent saves** for different gameweeks both spending the same chip window — the "already used" check happens at save time with no row lock or DB constraint behind it. Deprioritized: this is a single-user planner used from one browser tab at a time, not a concern at that scale.
- **Prisma is not the sole data layer** (see the Data stack above). `prisma-client-py` (the community package for using Prisma from Python) turned out hard-incompatible with Prisma 7's schema/config format, hence SQLAlchemy for FastAPI. Its models live in `apps/api/app/db/models.py`, hand-mirroring `schema.prisma` — a change to a table FastAPI touches needs updating both, since nothing enforces they stay in sync.
- **Local Postgres is a real Homebrew `postgresql@16` install, not Docker.** Docker isn't available in this dev environment. Prisma's own bundled local dev-database (`prisma dev`) was tried first and abandoned: raw Python drivers (asyncpg, psycopg) couldn't connect to it at all, and its per-database isolation turned out to be an illusion (dropping a schema on one named database wiped another sharing the same underlying store). Local dev now points at a standard local Postgres server; Docker remains the plan for later packaging/deployment (build step 5).
- **Auth session strategy is JWT for every provider, not database sessions.** Discovered empirically that Auth.js never writes a `Session` row for a Credentials-authenticated sign-in even when an OAuth provider is also configured — only real OAuth sign-ins would get one, which would silently lock out credentials users under database sessions. The `Session`/`VerificationToken` tables (from the NextAuth Prisma adapter schema) exist but are currently unused.
- **Google and Apple OAuth are wired in code but not functional yet.** Google works once real client credentials are added to `.env.local` (verified once they were). Apple cannot be tested at all in local dev — Sign in with Apple requires a live HTTPS domain, not `http://localhost`.
- **`freeTransferCap`/`freeTransferRolloverLimit` are unverified assumptions** (currently 1 and 5), not confirmed against the live current-season FPL rules — exactly the risk flagged in the "Classic FPL rules to encode" section above. The chip set, by contrast, is derived live from the FPL API on every import, not hardcoded.
- **No automated tests yet** (no Playwright, Pytest, or Jest), and none of build step 5 (Docker/Kubernetes/Terraform/CI/monitoring) has been started. Every feature so far has been verified manually per change — direct API calls plus in-browser checks — not codified as a repeatable suite.
- **The player search panel's info icon opens a profile card** (season totals, form, ICT Index, expected goals/assists, ownership, and a portrait) pulled from the same FPL bootstrap API response already used for prices/status, refreshed on the same "next import" cadence — not live-polled, so it can lag a few hours behind FPL's own site right after a game. The portrait and stat definitions (ICT Index, xG, xA) are FPL's own, not independently recomputed here.
- **Advanced per-90 stats (Understat/FBref) are not integrated** — the profile card's xG/xA are the FPL API's own season totals, not a third-party per-90 source; no `PlayerExternalIdMap` or advanced-stats table exists yet.

## Non-goals

- Not trying to beat existing tools like FPL Review or LiveFPL on raw modeling sophistication. The goal is a working, well-architected app across the full stack above, not a state-of-the-art prediction engine.
