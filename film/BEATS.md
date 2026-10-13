# SatStake demo film: beat sheet v3

## Logline

SatStake lets a person put a little Bitcoin behind their word. They write a promise, lock a small stake of cirBTC, and name a friend to judge it. Kept, the sats come back. Broken or ignored, they go to someone the person chose. It is one contract on Arc with no owner and no fee, and it is live on mainnet with real promises already settled.

**The sentence a judge should keep:** "SatStake makes a promise cost something real, and it already works on Arc mainnet."

**The feeling:** sad but happy, the relief of getting through something by keeping your word. The opening's piano carries it the whole way.

## Changes from v2

- 60 s to 91 s. Each of the five steps holds its header for 6.5 to 8 s instead of about 3 s, with a step number, a title, and five progress marks.
- Within a step the camera glides across one capture, and one capture dissolves into the next where the app changes state. No hard cuts inside a step.
- A "Why Arc" card, in the North Star's words: cirBTC as the stake, USDC as gas, final the moment it lands.
- Testnet shots carry no network label. Mainnet shots keep theirs.
- Typing starts on frame 1 of the capture (frame 0 was the grey placeholder, which read as an erase) and skips frame 23 (mid-wrap overflow).
- One felt piano throughout. No kick, no hi-hats, no arpeggio loop, no whoosh. The opening's three notes (B, D, C sharp) are the motif.
- Every key click lands on its letter's frame with human spacing; every pen sound follows its own ink's speed and starts one frame after it.

## Shots

All times live in `src/timeline.js`.

| # | Time | On screen | Music |
|---|---|---|---|
| 1 | 0:00 to 0:07 | "I'll start running / on Monday." typed; ink strikes "Monday."; "Promises are free to break." | The opening, unchanged: drone, B, D, C sharp, low B on the strike, silence at 6.5 |
| 2 | 0:07 to 0:11 | Ink writes "SatStake"; "Lock Bitcoin against a promise." | D chord as the underline lands at 8 |
| 3 | 0:11 to 0:18.5 | 01 Write the promise. Typing, then a long hold | Bm, G; motif open at 15 |
| 4 | 0:18.5 to 0:25 | 02 Put Bitcoin on it. Token, glide to amount | D, A |
| 5 | 0:25 to 0:31.5 | 03 Pick who judges, and who collects. Referee, glide to beneficiary | Bm, G; motif open |
| 6 | 0:31.5 to 0:39.5 | 04 Sign it. Tap, wallet steps, the signed card | D, A, D; one high D on signed |
| 7 | 0:39.5 to 0:43 | "200 sats, locked on Arc." | Low D, still |
| 8 | 0:43 to 0:47.5 | Why Arc: "Final the moment it lands." The stake is cirBTC, gas is USDC | G, D; the motif rising |
| 9 | 0:47.5 to 0:53.5 | Mainnet: locked total and chain, glide to the verified contract | A, Bm |
| 10 | 0:53.5 to 1:00.5 | 05 Your referee decides. Tap Kept, dissolve to Kept | G, A, D; the motif resolves for the first time |
| 11 | 1:00.5 to 1:03.5 | "On Arc mainnet, it already happened." | Bm, high B |
| 12 | 1:03.5 to 1:11 | Mainnet #1 "Walk for thirty minutes", glide to Paid back | G, A, D; motif resolved, an octave up |
| 13 | 1:11 to 1:18.5 | Mainnet #3 "Cook dinner at home", glide to Paid out | Bm, G, F sharp minor; motif open |
| 14 | 1:18.5 to 1:24.5 | "Write it." "Stake it." "Keep it." | G, A, D rolled on each cut; motif resolves |
| 15 | 1:24.5 to 1:31 | SatStake, Live on Arc mainnet, URL with ink underline; fade to paper | Final D, rings out |
