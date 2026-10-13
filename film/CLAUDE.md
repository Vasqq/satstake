# SatStake film: render contract

The demo film is a program. `index.html` loads `src/film.js`, which draws any frame from its time alone; `tools/render.mjs` turns frames into video with Playwright and ffmpeg.

## Contract

- Every frame is a pure function of t. No CSS transitions, `setTimeout`, `requestAnimationFrame`, `Math.random`, or state carried between frames. Noise is seeded (`mulberry32`). Rendering the same frame twice gives the same hash: `node tools/render.mjs --hash <t>` checks it.
- Motion blur only on camera moves (the `MOVES` spans in `src/film.js`): the frame is the exact mean of 4 subframes over one frame time, the same result as `ffmpeg tmix=frames=4` with equal weights, done in the page so no other frame is touched. Never on type cards.
- One display face (Newsreader), one UI face (Hanken Grotesk), one accent (`#e86a12`), all from the Signed design (`app/src/styles.css`). Monospace appears only inside real UI captures.
- Something new every 2 to 4 seconds; every line fully legible for at least 1.5 s. Each step's header stays on screen for its whole step, at least 6 s.
- No `will-change` on anything the camera scales.
- Motion uses closed-form springs (`spring()` in `src/film.js`), at or above critical damping for type, so type never bounces.
- All timing lives in `src/timeline.js`, read by both the picture and `tools/audio.mjs`, so every key click and pen sound follows its frame. Cuts and structural hits land on the half second.
- Sound: one felt piano, no drums. Hits follow picture events, never a fixed spacing. The pen sound starts one frame after its ink.

## Honesty rules

- UI shots are real page pixels, captured at 2x. Nothing in a capture is redrawn or retouched; shots crop and clip only.
- The create, sign, and verdict shots were recorded on Arc testnet. They carry no network label, and their crops stay clear of the nav, footer, and wallet line where the app names its network. A testnet shot is never labelled mainnet. Only shots of the live mainnet site carry a source tag, and every one of those says mainnet truthfully.
- The app no longer draws a signature (commit `a34c4a1` removed it). The ink signature therefore appears only on type cards, as the brand mark, drawn by the app's own `Ink` code (`src/ink.gen.js`, generated from `app/src/design/ink.ts` by `tools/build-ink.mjs`). It is never laid over a UI capture.

## Sources

- `assets/home.png`, `p1.png`, `p3.png`: the live mainnet site, `tools/capture.mjs`.
- `assets/testnet/`: promise #43 (200 sats of cirBTC) made through the UI on testnet, `app/scripts/film-capture.mjs`.
- `assets/testnet-referee/`: promise #44 (0.10 USDC), its referee marking it Kept and sending the payout, `FILM_MODE=referee`.
- Two earlier capture attempts left 1,000 and 200 testnet sats in promises #42 and #43, whose throwaway referee keys are gone; at their deadlines anyone can send those stakes to their throwaway beneficiaries. Testnet only, no value.

## Commands

```
npm ci
node tools/build-ink.mjs
node tools/render.mjs --stills 6.2,45.5          # stills to out/stills/
node tools/audio.mjs                             # out/audio.wav at -14 LUFS
node tools/render.mjs                            # out/video-16x9.mp4 (silent)
node tools/review.mjs out/video-16x9.mp4         # contact sheets and strips for the critique loop
node tools/render.mjs --format 9x16              # the vertical cut
node tools/render.mjs --from 40 --to 46          # one range only
```
