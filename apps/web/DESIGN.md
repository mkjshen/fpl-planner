---
name: FPL Team Planner
description: A classic Fantasy Premier League squad, transfer and chip planner dressed in FPL's own matchday colours.
colors:
  fpl-plum: "#37003c"
  fpl-plum-hover: "#4d0054"
  neon-green: "#00ff87"
  neon-green-ink: "#003820"
  background-light: "#ffffff"
  foreground-light: "#171717"
  background-dark: "#0a0a0a"
  foreground-dark: "#ededed"
  border-light: "rgb(0 0 0 / 0.08)"
  border-dark: "rgb(255 255 255 / 0.145)"
  ground-lilac: "oklch(94.6% 0.033 307.174)"
  ground-mist: "oklch(98.5% 0 0)"
  ground-night-plum: "#2a002e"
  panel-dark: "oklch(14.1% 0.005 285.823)"
  pill-ground-light: "oklch(96.7% 0.001 286.375)"
  pill-ground-dark: "oklch(21% 0.006 285.885)"
  hover-dark: "#1a1a1a"
  text-muted: "oklch(44.2% 0.017 285.786)"
  text-muted-dark: "oklch(70.5% 0.015 286.067)"
  pitch-stripe-dark: "#3d8c40"
  pitch-stripe-light: "#439648"
  fdr-1: "#375523"
  fdr-2: "#01fc7a"
  fdr-3: "#e7e7e7"
  fdr-4: "#ff1751"
  fdr-5: "#80072d"
  tone-success-bg: "oklch(97.9% 0.021 166.113)"
  tone-success-text: "oklch(50.8% 0.118 165.612)"
  tone-error-bg: "oklch(97.1% 0.013 17.38)"
  tone-error-text: "oklch(50.5% 0.213 27.518)"
  tone-info-bg: "oklch(98.7% 0.022 95.277)"
  tone-info-text: "oklch(47.3% 0.137 46.201)"
typography:
  display:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  body-lead:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.025em"
  numeric:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    fontFeature: "tnum"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.85em"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  3xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.fpl-plum}"
    textColor: "{colors.background-light}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "8px 20px"
  button-primary-hover:
    backgroundColor: "{colors.fpl-plum-hover}"
  button-primary-dark:
    backgroundColor: "{colors.neon-green}"
    textColor: "{colors.neon-green-ink}"
    rounded: "{rounded.full}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.fpl-plum}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.foreground-light}"
    rounded: "{rounded.full}"
    padding: "6px 16px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.full}"
    size: "36px"
  input-text:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.foreground-light}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  panel:
    backgroundColor: "{colors.background-light}"
    rounded: "{rounded.xl}"
    padding: "32px"
  panel-dark:
    backgroundColor: "{colors.panel-dark}"
    rounded: "{rounded.xl}"
  stat-chip:
    textColor: "{colors.foreground-light}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  name-plate:
    backgroundColor: "{colors.background-light}"
    textColor: "{colors.foreground-light}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
  name-plate-selected:
    backgroundColor: "{colors.fpl-plum}"
    textColor: "{colors.background-light}"
  fixture-pill:
    backgroundColor: "{colors.pill-ground-light}"
    textColor: "{colors.text-muted}"
    padding: "2px 8px"
  captain-badge:
    backgroundColor: "{colors.neon-green}"
    textColor: "{colors.neon-green-ink}"
    rounded: "{rounded.full}"
    size: "24px"
  fdr-chip:
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "20px"
  tab-active:
    textColor: "{colors.fpl-plum}"
    typography: "{typography.body}"
    padding: "8px 12px"
---

# Design System: FPL Team Planner

## Overview

**Creative North Star: "The Matchday Programme"**

The app wears Fantasy Premier League's own matchday livery: FPL plum and neon green, the striped green pitch with real kit shirts standing on it, and FPL's own fixture-difficulty colours, so a manager reads it without a legend. Around that one vivid object, everything is quiet: white bordered panels on a soft lilac-to-mist page ground, Geist at small, dense sizes, hairline borders, and tabular money. The pitch is the only lit, three-dimensional thing on the page; the rest is printed paper.

Density is that of a planning tool, not a marketing site. Body copy sits at 14px, labels at 12px, and the type ramp only opens up on the landing page's headline. Light and dark are both first-class: light mode speaks in plum, dark mode speaks in neon green, and every emphasis state swaps between them rather than tinting.

**Key Characteristics:**
- FPL plum (light) and neon green (dark) as the single emphasis voice, swapped per theme.
- A soft vertical page ground (lilac to mist, or night plum to black) under flat white panels.
- One lit object: the trapezoid, floodlit, striped pitch with shirts and stacked name/fixture pills.
- FPL's five fixture-difficulty colours used verbatim.
- Geist throughout; prices and counts in tabular numerals, formatted £x.xm.
- Pills and rounded-full controls; hairline adaptive borders everywhere.

## Colors

A two-voice brand pair (plum and neon green) over near-neutral zinc surfaces, plus FPL's borrowed sport palette (pitch stripes, difficulty ratings) that is data, not decoration.

### Primary
- **FPL Plum** (fpl-plum): the light-mode voice. Primary buttons, active tabs, the selected player's name plate, the focus ring, text selection, outlined secondary buttons and the vice-captain badge outline. Hover deepens to **Lifted Plum** (fpl-plum-hover).

### Secondary
- **Neon Green** (neon-green): the dark-mode voice, and the captain's armband in both themes. In dark mode it takes over every role plum holds in light mode (primary fill, focus ring, selection, active tab, selected plate). Always paired with **Pitch-Shadow Ink** (neon-green-ink) for text on it, never white. At 10% or 7% opacity it tints the team sheet's plan block.

### Neutral
- **Paper White / Ink** (background-light, foreground-light) and **Night / Moon** (background-dark, foreground-dark): the root background and text tokens (`--background`, `--foreground`).
- **Hairline** (border-light, border-dark): the adaptive `--border` token; every panel, chip, input and divider edge.
- **Lilac Ground to Mist** (ground-lilac to ground-mist): the top-to-bottom page gradient behind the app, sign-in and landing surfaces; **Night Plum** (ground-night-plum) fades to black in dark mode.
- **Panel Dark** (panel-dark): the dark-mode panel fill; **Pill Ground** (pill-ground-light, pill-ground-dark): fixture/points pills under the name plate.
- **Muted Text** (text-muted, text-muted-dark): secondary copy, stat labels, position headings.
- **Hover Dark** (hover-dark): the dark-mode hover fill on neutral bordered controls.

### Sport palette (data)
- **Pitch Stripes** (pitch-stripe-dark, pitch-stripe-light): alternating 12.5% bands of the pitch only.
- **Fixture Difficulty 1-5** (fdr-1 to fdr-5): FPL's official FDR colours, each with a paired digit colour (white on 1 and 5, `#0a0a0a` on 2 and 4, zinc-800 on 3) holding 4.5:1.

### Feedback tones
- **Success / Error / Info** (tone-success-*, tone-error-*, tone-info-*): emerald, red and amber banner tones, defined once as `tone-*` utilities in globals.css with dark variants.

### Named Rules
**The Theme Flip Rule.** Emphasis is plum in light mode and neon green in dark mode, never both at once and never a third accent. Any new selected, active, focused or primary state ships both halves.

**The FPL's Own Colours Rule.** Fixture difficulty uses the five FDR values exactly as FPL does, each with its contrast-paired digit. The digit carries the meaning; do not re-tint, blend or reuse these colours for anything else.

**The Green Armband Rule.** The captain is a filled neon-green badge with ink text; the vice-captain is an outlined plum (dark: green) badge on white. Nothing else wears filled neon green as a badge.

## Typography

**Display Font:** Geist (with Arial, Helvetica, sans-serif)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono, used only for inline code (the team-ID hint)

**Character:** One neutral grotesk doing everything at small sizes; hierarchy comes from weight (500/600/700) and size steps, not from a second face.

### Hierarchy
- **Display** (600, 1.875rem rising to 3rem at sm, tight tracking, balanced): the landing headline only.
- **Headline** (600, 1.25rem): page and card titles (Sign in, section headings).
- **Title** (600, 1rem to 1.125rem): panel headings such as the team sheet header and sample-squad heading.
- **Body** (400-500, 0.875rem): the working size of the app; nearly all copy and controls. The landing lead runs at 1rem/1.125rem with a 60ch measure.
- **Label** (500-600, 0.75rem, 0.025em tracking, uppercase): data labels only, stat-chip captions and position-group headings.
- **Numeric** (600, tabular-nums): prices, bank, formation, counts. Prices are always `£x.xm`.
- **Pill text** (700, 0.75rem to 0.875rem at xl): player name plates on the pitch.

### Named Rules
**The Tabular Money Rule.** Every price, bank figure and count renders in tabular numerals through `formatPrice`, so columns of money line up.

## Layout

A centred single column. App surfaces place one white panel (max 1024px squad, 1280px planner, 384px auth) on the gradient ground with 16-32px padding (p-4 to sm:p-8) and 64px vertical breathing room from sm. The landing page runs at 1152px with a 12-column grid at lg: pitch 7 columns, team sheet 5, stacking on phones.

Spacing follows Tailwind's 4px base; controls pad 8-12px, panels 16-32px, sections separate by 24px. The pitch lays out four position rows (GK to FWD) with per-row side insets (11%, 8.5%, 5.5%, 2.5%) so cards clear the sloped touchlines; cards shrink to share a row rather than wrap, capped at 80px wide (128px at xl). The bench sits below in a tinted bordered tray. While a plan has unsaved changes, the save bar sticks to the viewport bottom.

Breakpoints are Tailwind defaults (sm 640, md 768, lg 1024, xl 1280); hover-only reveals are gated on `pointer-fine` so touch tablets still see them.

## Elevation & Depth

Flat by default: panels, chips and inputs separate by hairline border and tonal fill, not shadow. Shadow is reserved for three jobs: the pitch (an inset floodlight dome plus an outer drop lifting it off the page), things that float above the page (dialogs, the floating theme toggle, the sticky save bar), and small objects standing on the pitch (shirt drop shadows, name plates and badges at shadow-sm). Dialogs sit on a 40% black backdrop with a small blur; player-card faces use a translucent white/black glass with backdrop blur so pills read on both grass and page.

### Shadow Vocabulary
- **Floodlit pitch** (`inset 0 1px 0 rgba(255,255,255,0.15), inset 0 40px 50px -20px rgba(0,0,0,0.25), inset 0 -50px 70px -15px rgba(0,0,0,0.45), inset 40px 0 50px -35px rgba(0,0,0,0.2), inset -40px 0 50px -35px rgba(0,0,0,0.2), 0 25px 50px -12px rgba(0,0,0,0.45)`): the pitch only.
- **Shirt stand** (`drop-shadow(0 2px 3px rgba(0,0,0,0.4))`): kit images on cards.
- **Save bar lift** (`0 -12px 16px -14px rgba(0,0,0,0.3)`): the sticky save bar while dirty.
- **Overlay** (Tailwind shadow-xl): dialog panels. **Floating control** (shadow-lg): the corner theme toggle. **Pill** (shadow-sm): name plates, badges, the transfer-out button.

### Named Rules
**The One Lit Object Rule.** The pitch is the only surface with lighting. Panels stay flat and bordered; shadow elsewhere means "this floats above the page."

## Shapes

Soft and sporty. Interactive controls are pills (rounded-full): primary, secondary and quiet buttons, icon buttons, badges. Containers step up by size: 6px inputs and banners, 8px stat chips, 12px app panels and dialogs, 16px bench tray, team sheet and player-card faces (24px at xl). FDR chips use a tight 4px. The pitch is the one non-rectangular form: a clip-path trapezoid 12% narrower each side at the goalkeeper's end, with the box markings drawn on the same slope; it takes no CSS border, since a border cannot follow the clipped edge. Name plate and fixture pill stack as one shape: a top-rounded plate over a bottom-rounded pill.

## Components

### Buttons
- **Shape:** pill (9999px).
- **Primary:** plum fill, white text, 8px 20px (12px 24px on the landing), weight 600; hover to Lifted Plum. In dark mode, neon green with ink text, hover at 90% opacity.
- **Secondary:** transparent with a 40% plum outline and plum text (dark: 50% green outline, green text); hover tints 6% plum / 10% green.
- **Quiet:** hairline-bordered neutral, hover `black/4%` (dark: Hover Dark). Used for Cancel, Close, Reset.
- **Icon button:** 36px circle, hairline border, muted icon, inline SVG (theme toggle, sign out).
- **Focus:** every control uses the shared `focus-ring` utility: 2px solid plum outline, 2px offset, keyboard-only via :focus-visible; green in dark mode.
- **Disabled:** 40-60% opacity.

### Chips
- **Stat chip:** label-over-value card, hairline border, 2% tint fill, uppercase 12px muted label over a 14px semibold value (red when negative). Shared by the squad and planner headers.
- **Selectable chip (position/chip filters):** selected state is plum border, 10% plum fill, plum text (dark: green equivalents).
- **FDR chip:** 20px tall, 4px radius, rating colour from `difficultyClass`; strung edge to edge as the fixture strip.

### Cards / Containers
- **Corner Style:** 12px for page panels and dialogs; 16px for trays and the team sheet.
- **Background:** white, Panel Dark in dark mode; nested trays use a 2-3% black/white tint.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** hairline `--border`.
- **Internal Padding:** 16px on phones, 32px from sm; team sheet sections 20px by 16px.

### Inputs / Fields
- **Style:** hairline border, 6px radius, 8px 12px padding, 14px text, black fill in dark mode; label above at 14px medium.
- **Focus:** border shifts to plum (dark: green) plus the shared focus ring.

### Navigation
- **Dashboard header:** white bar with bottom hairline; Squad/Planner tabs as text with a 2px underline, active plum (dark: green), inactive zinc-500 hovering darker. Right side: user name, inline theme toggle, sign-out icon button.
- **Landing top bar:** wordmark in 14px semibold, quiet pill link for Sign in / dashboard.

### Feedback banners
- 6px radius, hairline-tone border, 8px 12px padding, 14px; success/error/info from the `tone-*` utilities, with an optional tone-coloured Dismiss.

### Dialog
- Portaled overlay on `black/40` with backdrop blur; panel is a 12px-radius bordered card with shadow-xl. Escape closes, focus is trapped and returned, nested dialogs stack.

### Pitch and Player Card (signature)
- The striped trapezoid pitch with faint white (25%) markings and the floodlit shadow.
- Each player is an FPL kit shirt (hotlinked from FPL) on a translucent glass face, price above, then the name plate (white, bold; selected: plum fill / green fill) over a fixture-or-points pill. Captain/vice badges sit at the shirt's lower right; the transfer-out control at its upper left, revealed on hover only for fine pointers.
- A transferred-out slot shows a dashed circle and an "Empty" plate, plum-outlined when it is the active slot.

### Team Sheet
- The printed list beside the landing pitch: white 16px-radius panel, header with tabular formation and a Bank / Squad value / Free transfers definition row, a green-tinted plan block, then position groups and an ordered bench with FDR chips and right-aligned tabular prices.

## Do's and Don'ts

### Do:
- **Do** ship both theme halves for every emphasis state: plum (#37003c) in light, neon green (#00ff87) with ink (#003820) in dark.
- **Do** use the shared `focus-ring` utility on every interactive element and the `--border` token for every hairline.
- **Do** render fixture difficulty only through `difficultyClass`, with the rating digit visible.
- **Do** keep panels white (dark: Panel Dark), bordered and flat on the lilac-to-mist (dark: night-plum-to-black) ground.
- **Do** format money with `formatPrice` in tabular numerals.
- **Do** reuse the real `Pitch` and `PlayerCard` wherever a squad is shown, including illustrative samples.

### Don't:
- **Don't** introduce a third accent colour or re-tint the FDR palette.
- **Don't** put white text on neon green; use the ink colour.
- **Don't** give the pitch a CSS border or a 3D perspective transform; the clip-path trapezoid keeps cards upright and legible.
- **Don't** add shadows to resting panels; shadow means floating or the lit pitch.
- **Don't** use uppercase tracked labels as eyebrows above headlines; they label data (stat captions, position groups) only.
- **Don't** fall back to the browser's default blue selection or focus outline.
