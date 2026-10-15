# SatStake brand brief

The brief the SatStake identity was designed from, and the decisions that came out of it.

## Product

- **Name:** SatStake. The app already sets it as "Sat" in off-white and "Stake" in orange.
- **One sentence:** Lock USDC or Bitcoin-backed cirBTC against a promise; a friend you choose judges it, and the rules send the money back if you kept it or to the person you named if you did not.
- **Tagline:** Lock Bitcoin against a promise. Keep it and you get your sats back. Miss it and they go to someone else.
- **Where it lives:** Arc mainnet (Circle). Static site on GitHub Pages, https://vasqq.github.io/satstake/.

## Who it is for

- Stakers: people who want a promise to cost something real (habits, friendly bets, work deadlines, a donation if they miss).
- Referees and beneficiaries: often non-crypto people who arrive cold from a shared link.
- Grant reviewers (Arc Microgrants): must grasp the product in under 10 seconds.

## The core moment

A promise with a **deadline**. The product's signature is the giant orange monospace countdown. Time running out is the drama; three endings follow (kept, broken, silence counts as broken). Money is held by rules, not by a person.

## Personality

**Calm. Exact. Accountable.**

## Must not feel like

- A crypto casino or exchange (coins, charts, neon, hexagons).
- A habit-app toy (streak flames, mascots, confetti).
- A bank (shields, vaults, padlocks).
- Hype. Words like "trustless" or "guaranteed" are out, and the mark should not promise more than the product does.

## Correction, 2026-10-13: the adopted design is "Signed"

The table below describes the earlier dark design. The site uses the "Signed" design, and its wordmark is the one he wants kept: Newsreader italic 500, "Sat" in ink and "Stake" in orange.

| Item | Light | Dark |
|---|---|---|
| Ground | paper `#f7f8fa` | `#0c0f15` |
| Ink | `#14213d` | `#e3e9f5` |
| Orange | `#e86a12` | `#ff9549` |
| Type | Newsreader (serif, italic for the wordmark), Hanken Grotesk, JetBrains Mono, all OFL | |
| Motifs | the signature rule, the seal drawn from the promise's hash, strikes through what cannot be undone | |

Chosen mark: round 3, mark 1, an italic S standing on an orange rule.

## Earlier design language (locked 2026-10-06, superseded)

| Item | Value |
|---|---|
| Ground | warm near-black `#171717`, hairline `#2b2b2b`, fine film grain, no gradients |
| Text | warm off-white `#f0eee8`, labels `#8f8c86` / `#b4b1aa` |
| Accent | one orange `#ec7432`, with ink `#1b1005` on it |
| Display type | Inter Tight 800/900, lowercase, tracking about -0.05em |
| Body type | Inter 400 to 700 |
| Data type | IBM Plex Mono 400/500 (addresses, amounts, countdown) |
| Motifs | 1px hairline cards, rounded pill CTA, giant mono countdown, three-column rows split by hairlines |

All three typefaces are OFL and already self-hosted in `app/public/fonts/`, so a logo wordmark may use any of them.

## Current mark (to be replaced)

`app/public/favicon.svg` is a placeholder: a blue rounded square (`#0b4fb3`) with a white plus-and-bars glyph. It matches nothing in the locked palette and says nothing about the product. The header has no mark, only the text wordmark.

## Competitor and adjacent marks

| Mark | What it is | Why it reads generic |
|---|---|---|
| stickK | Commitment-contract service; lowercase wordmark with a capital K, blue | A friendly typographic logo with no idea behind it beyond the name. Says "app", not "consequence". |
| Beeminder | Habit tracker with money pledges; a bee | Mascot-led. Charming, but trades on cuteness, the opposite of the weight a real stake carries. |
| Habitica | Habit tracker as a role-playing game; shield and creature imagery | Gamified fantasy language, wrong register for real money. |
| Bitcoin / generic crypto | Orange circle with a ₿ glyph, coins, hexagons, chains | The category default. Using orange plus a coin would make SatStake indistinguishable from every Bitcoin product. |
| Circle | Two interlocking rings | Strong, simple, but a pairing mark; we must not echo interlocking circles. |

Takeaway: the field is split between cute mascots and coin clichés. The open space is a **quiet geometric mark that carries time and a held amount**, in one orange on near-black.

## Where the logo must work

Website header, favicon (16/32/48), social avatar (circular crop), hackathon listing, slides, video end card, iOS-style rounded icon, PWA maskable icon.

## Hard requirements

- DoraHacks-style listing: PNG or JPG at least 500px, at most 2 MB (a 1024px export will satisfy this).
- Works in one flat color first; at most two colors in the mark.
- No third-party fonts at runtime, so the wordmark is outlined SVG.
- Copy: no em dashes, no hype words, no emoji.
- No lookalike of Circle's rings, the Bitcoin glyph, or the stickK wordmark.

## Assumptions confirmed at the start

1. Keep the **orange `#ec7432` on warm near-black** as the brand pair (it is the locked aesthetic).
2. The wordmark keeps the "Sat" / "Stake" split, lowercase or Title case? Current text logo is "SatStake." with a trailing period.
3. The mark may reference **time (the deadline)** and **a held amount**, but not coins, Bitcoin glyphs, or padlocks.
4. Output lands in `brand/`, and wiring touches `app/index.html` and `app/public/`.

## Ten concepts

Each is one idea from this product's story.

1. **Stake and shadow.** A stake in the ground casts the shadow that is the deadline.
2. **Resting on the line.** The amount, held up by the deadline.
3. **Pressed between.** The amount, held between today and the deadline.
4. **Bracketed sat.** The smallest unit, held inside the rules.
5. **Two turns.** One path with two directions: back to you, or on to someone else.
6. **Solid to open.** The stake changes hands.
7. **Two endings.** One promise cut in two: kept or broken.
8. **Colon.** The colon of the countdown, the only thing the product shows.
9. **Second falling.** The countdown colon with its second beat running out.
10. **Taken from the frame.** A card with one corner removed: the stake lifted out of the promise.

### The four taken forward

- **A. Gnomon (1).** Only concept that holds both words of the name: a stake, and time.
- **B. Held amount (2, 3, 4).** Says what the product does in one glance: money held at a line.
- **C. Outcomes (5, 6, 7).** Carries the three endings, the product's real surprise.
- **D. Countdown colon (8, 9).** The most ownable: it is the interface's own signature.

Dropped: 10 (a notch in a square is a generic UI glyph and does not survive 16px).

## Decisions

- **Mark:** an italic S standing on the signature rule, drawn from the wordmark's own Newsreader italic (weight 700 for the mark, 500 for the wordmark). Palette A: ink `#14213d` and orange `#e86a12`, reversed `#e3e9f5` and `#ff9549`.
- **Where the mark is used:** favicon, app icons, avatar and link preview. The site header keeps the wordmark alone, because the mark beside it repeats the S.
- **Rebuild:** `cd brand/src && python3 build.py` writes every file in `brand/`; `brandsheet.py`, `stress.py` and `refine_page.py` write the three review pages. Glyph outlines come from `src/fonts` (Newsreader, OFL).
- **Known limit:** the orange rule on paper is 3.04:1, enough for a graphic and not for small text.
