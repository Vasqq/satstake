# The restyled site, live on Arc mainnet

Date: 2026-10-08. Requirements: LLR-FE-070 and LLR-FE-072 (the D halves; the I halves are rows in `docs/INSPECTIONS.md`).

Commit `1e2edab` was pushed and its Pages run succeeded (run 37879297755). The published site https://vasqq.github.io/satstake/ was then driven from outside the repository in headless Chromium (the Playwright 1.63.0 pinned in `app/`), with no wallet, at 360 and 1440 px wide. The script is a throwaway in the gitignored `cache/`; its findings, identical at both widths except where noted:

## LLR-FE-070: the landing view proves it is live

- Heading "Put money behind your promise.", with the hero saying what SatStake does and that a browser wallet is needed to act.
- The network named: "Arc, chain 5042".
- The contract address in full, `0xEbcda489EB528c573E9a190eB8EfE63b44d9204e`, with its copy control, a link to the explorer (`https://explorer.arc.io/address/0xEbcda489EB528c573E9a190eB8EfE63b44d9204e`) and to its verified source (`https://repo.sourcify.dev/5042/0xEbcda489EB528c573E9a190eB8EfE63b44d9204e`).
- The live `pledgeCount`: "4 Promises made", the four promises seeded on mainnet (`docs/evidence/mainnet-seed.md`).
- Two links to `#/create` ("Make a promise") in the page, and "See a live promise" to `#/p/4`, the configured example.
- The card "Recent promises on Arc" shows promise #4 read from the contract: "Publish the first release notes by the end of October.", open, with the countdown in chain time, the deadline, "1,000 sats, 0.00001 cirBTC", and the three parties by shortened address; the other three seeded promises are its hidden slides ("01 / 04" at 1440; the counter is hidden below 400 px by design). Nothing on the page is a promise that is not on chain.

## LLR-FE-072: layout and keyboard on the live site

- No horizontal scroll on the landing page or on `#/p/4`, at 360 or at 1440.
- The first Tab stop is "Skip to content"; Enter moves focus to the main heading ("Put money behind your promise.").
- Changing the route to `#/p/4` sets the title to "Promise #4 | SatStake" and moves focus to its h1.
- The pledge page explains itself to a visitor: "This is a promise made with SatStake. 0xd172…809f locked 1,000 sats, 0.00001 cirBTC. 0x0Fb1…E4B9 judges it by <deadline>. Kept, the money goes back to 0xd172…809f; otherwise it goes to 0x8bc7…1cad. What is SatStake?"
- No console errors on either page at either width.

Contrast, focus styling, and announcements are inspected in the LLR-FE-072 row of `docs/INSPECTIONS.md`. Wallet-connected states (connect, switch, verdict, settle) are exercised by Liam's walkthrough (`docs/WALKTHROUGH.md`).
