# Brief: the restyle and the landing structure

Written by the lead on 2026-10-07, before any code, for the groups that carry out 05 v1.26. Requirement text wins over this brief; the copy comes from `docs/BRIEF_LANDING.md` (version 2) and, for strings that brief does not change, from `docs/BRIEF_PLEDGE_AND_VIEWS.md`. Implementers do not invent user-facing copy: if a string is missing, stop and ask the lead.

The approved look is `docs/design/mockup-landing-and-referee.html` (open it in a browser). It is a reference, not code to copy: it loads fonts from Google, which the app may not (LLR-FE-073), and its rotating card uses the four seeded promises with placeholder outcomes.

## 1. Design tokens (the whole palette)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#171717` | page ground, with a fixed film-grain layer at 9% opacity (inline SVG noise, `mix-blend-mode: overlay`) |
| `--card` | `rgba(255,255,255,0.022)` | the one card surface |
| `--line` | `#2b2b2b` | every hairline and card border |
| `--control-border` | `#6a6763` | borders that mark controls (measure against AA, LLR-FE-072) |
| `--fg` | `#f0eee8` | text |
| `--dim` | `#b4b1aa` | secondary text |
| `--label` | `#8f8c86` | small uppercase labels |
| `--accent` | `#ec7432` | the only colour: "Stake" in the logo, the last word of a display heading, countdowns, the primary button, step dots, the active state |
| `--accent-ink` | `#1b1005` | text on the accent |
| `--ok` | `#4fd38a` | the live dot only |
| `--error-bg`, `--error-fg`, `--notice-bg`, `--notice-fg` | measure and choose for AA on `--bg` | banners; record the measured ratios in the TDD log |

One dark theme, `color-scheme: dark` (LLR-FE-072). Every ratio is measured by `styles.test.ts`, which is updated with the new tokens.

## 2. Type

Three self-hosted faces under `app/public/fonts/` (LLR-FE-073), each with its OFL licence file, Latin subset, `font-display: swap`, recorded in `docs/TOOLING.md` with source and version:

- **Inter Tight** 800 and 900: display headings, lowercase by CSS (`text-transform: lowercase`), tracking about -0.055em, line height about 0.86. The DOM text keeps the brief's capitalisation, so tests and screen readers read it unchanged.
- **Inter** 400, 500, 600, 700: body text and labels. Labels are 13 px, 600, uppercase, tracking 0.14em, `--label`.
- **IBM Plex Mono** 400, 500: everything read from the chain: addresses, amounts, the countdown, the proof strip, the wallet control.

## 3. Components

- **Logo:** "Sat" in `--fg`, "Stake" in `--accent`, a full stop in `--fg`. The text stays "SatStake" to assistive technology.
- **Primary button:** accent pill, `--accent-ink` text, 16 by 30 px padding, a trailing arrow marked `aria-hidden`, `scale(0.97)` on press (140 ms, `cubic-bezier(0.23, 1, 0.32, 1)`). Secondary actions are outlined pills in `--control-border`.
- **Card:** 1 px `--line` border, 28 px radius, `--card` fill. Used for the promise card, the timeline and parties block, and the verdict block; nothing else gets a card.
- **Countdown:** IBM Plex Mono 400 in `--accent`, `clamp(40px, 7.4vw, 104px)`, tabular figures, as `26d 04h 12m 09s` (two digits per unit). Its accessible name keeps the words of `BRIEF_PLEDGE_AND_VIEWS.md` section 2.3 ("26 days 4 hours") and it is never inside a live region.
- **Rows:** three or four columns divided by hairlines; a step is a dot in `--accent` followed by a hairline, then the label, then the text. At 860 px and below every row stacks to one column.
- **Motion:** only the rotating card, press feedback, and colour changes on hover (gated by `@media (hover: hover) and (pointer: fine)`). Everything honours `prefers-reduced-motion`.

## 4. The rotating card (LLR-FE-070)

Reads `pledgeCount`, then `getPledge` and `stateOf` for the newest ids, at most 8, newest first. Shows nothing while the count is 0. Each slide: "Promise #id" label and state, the promise in quotes (two lines at most), the countdown with "Deadline <local time>" under it while Active or Expired, otherwise the outcome word in the countdown's place ("Kept", "Broken", "No answer") with where the stake goes under it, then the amount and the three parties. Every slot has a fixed height, so the page never moves.

Timing as in the mockup: an 8 s linear progress line along the card's bottom edge is the timer; out 180 ms (fade, 6 px up, 4 px blur), in 420 ms with a 50 ms stagger across label, quote, countdown, and facts, both `cubic-bezier(0.23, 1, 0.32, 1)`. A pause button with `aria-pressed` and a counter "01 / 04". Pause also while hovered, while focus is inside, while the document is hidden, and while the card is under 25% visible. With reduced motion: a 200 ms opacity fade only. The card region is not a live region.

## 5. Order of work

1. **FE dark theme and fonts** (one implementer): tokens, fonts, global styles, the header split and footer of LLR-FE-013 and LLR-FE-070's footer sentence, every existing view restyled without changing its behaviour, style tests updated. LLR-FE-072, 073.
2. Then in parallel, each in its own worktree: **FE landing** (LLR-FE-070, the "promise" word of LLR-FE-071 across `app/src`, section 2.2 and LLR-FE-062 messages); **FE pledge page** (LLR-FE-040 banners and timeline, LLR-FE-045 amounts, LLR-FE-034 and 037); **FE my promises** (LLR-FE-050).
3. The lead merges; one review round (requirements and frontend, Opus, the frontend one with screenshots at 360 and 1440 px); fixes; confirmation; commit.
