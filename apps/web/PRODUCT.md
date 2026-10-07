# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, both confirmed as primary:

- **Classic FPL managers** — the in-app user. They provide their numeric FPL team ID (no FPL login needed for reads) and use the app to view their real squad, plan transfers against the -4-point hit tradeoff, and plan chip usage (Wildcard, Free Hit, Bench Boost, Triple Captain) across future gameweeks. They also create an account on this app (separate from FPL, via NextAuth) so their plans and settings persist across sessions.
- **Technical reviewers/interviewers** — evaluating this as portfolio work. They care about whether the app is built the way a production app would be: real data modeling, real auth, honest handling of edge cases and API limitations, and a codebase whose tradeoffs the author can explain and defend.

Design and product decisions should hold up for a real FPL manager's workflow first, but the underlying engineering choices need to stay visible and defensible — one audience should never be served by quietly cutting corners the other would notice.

## Product Purpose

A classic Fantasy Premier League team-planning app: import a manager's real squad, bank, and transfer history from the public FPL API, then help them plan transfers and chip strategy for future gameweeks within FPL's real rules (squad composition, budget, transfer costs, chip windows). Built primarily as a portfolio project to produce real, defensible full-stack work for job applications — success means both a tool a real FPL manager could use, and a codebase whose architecture and documented tradeoffs hold up under technical scrutiny.

## Positioning

Not competing with prediction-sophistication tools like FPL Review or LiveFPL on modeling quality — that is an explicit non-goal. The differentiator is being a well-architected, production-styled full-stack application: real authentication, a real (if hybrid) data-access layer, FPL rules verified against the live API rather than assumed, and every simplification or deviation from "ideal" explicitly disclosed rather than hidden. The pitch to a reviewer is "here's a correctly-reasoned system with known, stated limitations," not "here's a polished demo."

## Operating Context

- No FPL account or login is required to import a squad — only a public numeric FPL team ID.
- The app's own accounts (email/password via NextAuth Credentials, plus Google/Apple OAuth) are separate from FPL and exist so a manager's plans and settings persist across sessions.
- Real classic FPL rules govern every planning action: 15-player squad (2 GK/5 DEF/5 MID/3 FWD) under a budget, an 11-player starting lineup within formation limits, captain/vice-captain doubling, one free transfer per gameweek with capped rollover, a -4 cost per extra transfer, and four chips (Wildcard, Free Hit, Bench Boost, Triple Captain) each usable within FPL-defined windows.
- The FPL season's specific numbers (free transfer cap/rollover, chip windows) are read from the live FPL API rather than hardcoded where FPL exposes them, since these have changed between seasons.

## Capabilities and Constraints

Current build covers squad import/view, a transfer planner (future-gameweek transfers tracked against bank/budget with free-transfer rollover and the -4 hit), and chip strategy planning (one chip per future gameweek, with Wildcard/Free Hit waiving transfer costs for that gameweek). The app does not simulate live scoring — Bench Boost and Triple Captain are recorded choices only.

Known, deliberate constraints (see `CLAUDE.md` "Status and deviations" for the full, current list — that document is the source of truth for implementation-level detail and evolves as build steps progress):

- Purchase price is approximated as "bought at today's price" on import, since the FPL API doesn't expose true historical purchase price.
- Editing an earlier gameweek's plan does not cascade-revalidate later saved plans; the app surfaces a flag and a manual "reset all plans" path instead of silent drift.
- Advanced per-90 stats (xG/xA from Understat/FBref) are not yet integrated; player stats shown are the FPL API's own season totals.
- Google/Apple OAuth are wired in code; Apple cannot be exercised in local dev (requires a live HTTPS domain).

Any capability documented in `CLAUDE.md` as an open assumption or unverified simplification should be treated as undecided product fact, not settled behavior, until that document says otherwise.

## Brand Commitments

"FPL Team Planner" is a placeholder name, not a final one — nothing about it is binding. No logo, wordmark, or other brand assets currently exist.

## Evidence on Hand

No real customer testimonials, usage data, case studies, or press exist, and none should be fabricated — this is a personal portfolio project, not a live product with users beyond its own author testing it. The only "evidence" the app can lean on is real: live data pulled from the public FPL API (`fantasy.premierleague.com/api`) for an actual manager's actual squad, which is itself the demonstration.

## Product Principles

1. **Production-shaped over demo-shaped.** Favor real auth, real validation, and a real (if hybrid, disclosed) data layer over the fastest path to a working screen.
2. **Classic FPL rules are the contract.** Squad composition, budget, transfer costs, and chip rules must reflect real, currently-verified FPL behavior, not a simplification that merely looks plausible.
3. **Disclose approximations; never hide them.** Where the FPL API can't give ground truth (e.g. historical purchase price), the app states the simplification rather than presenting a guess as fact.
4. **Serve both audiences without trading one off for the other.** A real FPL manager's workflow drives the UI; a technical reviewer's scrutiny drives what's underneath it. Neither should be sacrificed to flatter the other.
5. **Credibility comes from correctness and follow-through, not surface polish alone.** The portfolio value is being able to explain and defend every deviation from the ideal — not shipping the fastest-looking demo.

## Accessibility & Inclusion

WCAG 2.1 AA baseline.
