# Reference: the motion studio method

Source: Movez, "How to build motion design studio with Opus 5.5 (Full-course)", X, 2026-09-27.
https://x.com/0xMovez/status/2104216919033192746

A summary in my own words of the parts this film uses. Read the original for the code.

## What the film already follows

- Render contract: every frame is `seek(t)`, deterministic, Playwright plus ffmpeg (`CLAUDE.md`).
- Closed-form springs, one accent, one display face and one UI face.
- Sound synthesized in code on a beat grid.
- Real product pixels, never redrawn UI.

## What the film does not follow yet

- **Critique loop with scores.** Contact sheet, a strip around each fast action, and a 360 px phone sheet. Score 1 to 10 on hook, phone readability, motion, variety, composition, brand, sound sync. Fix the three worst, repeat until every score is 8 or more. Log it in `REVIEW_LOG.md`.
- **Phone readability.** Every line must read at 360 px wide. Most UI captures here fail it.
- **One shape, never cut.** A single UI container morphs from state to state, a cursor drives each change, text swaps inside the morph. Replaces hard cuts between sub-shots.
- **Animatic before polish.** A 960x540 pass with the final score to fix pacing first.
- **Hits on measured events.** SFX land on the frame where the picture event happens, not on a fixed spacing.
- **Loudness.** Master to -14 LUFS.
- **Banned looks.** Everything fading in, corner labels, generic zoom blurs.
