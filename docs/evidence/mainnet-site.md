# The published site reads Arc mainnet

Date: 2026-10-08. Requirement: LLR-DP-008 (method D); journey UJ-84.

`.github/workflows/pages.yml` builds `npm run build:mainnet` since commit `94391a3`, whose Pages run succeeded. The site at https://vasqq.github.io/satstake/ was then checked from outside the repository:

- The published bundle (`assets/index-CONWAeFY.js`, fetched with `curl`) holds the mainnet contract `0xEbcda489EB528c573E9a190eB8EfE63b44d9204e` and the mainnet RPC `rpc.mainnet.arc.io`. The testnet RPC also appears once, because both network configurations ship in the bundle and the build selects one.
- Rendered in headless Chrome with a 15-second budget, with no wallet: the page shows "Arc, chain 5042", the contract address in full, and "Pledges created 4", the live `pledgeCount()` of the mainnet contract after the seed (`docs/evidence/mainnet-seed.md`).

The page's look and words will change with Liam's restyle; this records that the published build targets mainnet and reads it live.
