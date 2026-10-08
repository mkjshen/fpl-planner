---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Landing page (/)

Scope: the public landing page. Visitor mode: Persuade.
Audience: classic FPL managers (sign up, import a team) and technical reviewers (see the product working without signing up). Both paths visible in the first viewport.
Proof: a fixed, clearly labelled sample squad rendered on the app's real Pitch component. No live API calls on this page.
Constraints: nothing technical on the landing page (no stack or engineering section). No invented claims, testimonials or usage numbers. Not affiliated with FPL/Premier League, and the page says so.
Unresolved: none.

## Direction contract

THESIS: The landing page is a sample squad's matchday team sheet: the real pitch beside the printed list a manager plans from. It refuses the centred headline-and-two-buttons hero with nothing from FPL on it.

OWN-WORLD: The app's established world, unchanged: FPL plum #37003c and neon green #00ff87 on the soft purple-to-zinc page ground, white rounded panels, Geist, the angled striped pitch with kit shirts and name/fixture pills, FPL's own fixture-difficulty colours. The team sheet is a plain printed list: position headings, tabular prices, captain and bench marks.

STORY: A visitor sees a real-looking squad on a real pitch, reads how planning works from the sheet's own plan block (one free transfer, bank before and after), and either imports their team or keeps reading the sample.

FIRST VIEWPORT: Top bar: wordmark left, Sign in right. Headline and one-sentence explanation, primary "Import your team" and secondary "See the sample squad" across the top. Below, sample pitch (about 7/12) left, team sheet (about 5/12) right; stacked under the actions on phones.

FORM: Matchday team sheet, candidate 5 of 7 on the ordered structural list, dealt as THE ROLL; seed key 2fff9dcf.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
