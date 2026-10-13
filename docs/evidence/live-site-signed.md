# Live site, Signed design (2026-10-12)

The Signed design published to GitHub Pages against Arc mainnet, and checked in a browser with no wallet.

## Publication

- `signed-frontend` at `698f9c5` fast-forwarded onto `worktree-fe-config-reading` (from `6646b7a`) and `main` (from `ce68292`), each confirmed first with `git merge-base --is-ancestor`; no force push.
- Pages: run 38263819700 (`main`) and 38263815135 (`worktree-fe-config-reading`), both success. CI on `698f9c5`: runs 38263819646 (`main`), 38263815160 (`worktree-fe-config-reading`) and 38263786013 (`signed-frontend`), all success.

## What the published site shows

Site: https://vasqq.github.io/satstake/ (loaded with a cache-busting query, so the published build and not a cached one was read).

- Header: "Live on Arc mainnet". The landing is the Signed design: the "I promise to" hero with the create pad under it, the example agreement, the example clock, the strikes, the trust section naming Circle's power to pause a token or block an address, and "Check it yourself."
- "Check it yourself." read from the contract with no wallet: promise #4 open, "4 PROMISES MADE", "$0 in USDC" and "1,000 sats (0.00001 cirBTC)" locked, network "Arc", chain 5042, contract `0xEbcda489EB528c573E9a190eB8EfE63b44d9204e`.
- `#/p/1`, title "Promise #1" with the site name: "Walk for thirty minutes every day this week.", Paid back, the stake went to the staker.
- `#/p/2`: "Send the draft to the editor before the deadline.", Paid out, the stake went to the beneficiary.
- `#/p/3`: "Cook dinner at home on all five weekdays.", Paid out, the stake went to the beneficiary.
- `#/p/4`: "Publish the first release notes by the end of October.", open, 1,000 sats (0.00001 cirBTC), judged by Oct 31, 2026, 8:00 PM EDT (the deadline, shown in the browser's zone), on the agreement layout with Read as.
- `#/p/999999`: "Promise not found", "This promise does not exist. Check the link."
- Errors: listeners for `error` and `securitypolicyviolation` were attached on the landing page and kept through the hash routes above; none fired.

These match the seeded promises in `docs/evidence/mainnet-seed.md`.
