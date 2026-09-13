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
- Prisma as the ORM

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

## Non-goals

- Not trying to beat existing tools like FPL Review or LiveFPL on raw modeling sophistication. The goal is a working, well-architected app across the full stack above, not a state-of-the-art prediction engine.
