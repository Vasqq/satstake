# A second instance leaves the first one working

Evidence for UJ-86 (a defect found after the mainnet deployment: a new instance is deployed and the site repointed, while the old instance stays callable and its pledges stay settleable). Assembled 2026-10-04 from records already in the repository; no new transaction was sent for it.

## What happened on Arc testnet

| Date | Event | Record |
|---|---|---|
| 2026-09-30 | First instance deployed, `0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4` | `docs/evidence/testnet-deployment.md`, `deployments/5042002.json` |
| 2026-10-03 | Second instance deployed on the same chain for the seed rehearsal, `0x1Acb90800E6F730c6dDEea2336F2d483F351B457`, and used for the full seed | `docs/evidence/seed-rehearsal-testnet.md` |
| 2026-10-04 | Pledges on the first instance still created, judged, and settled through the published site, after the second instance existed | `docs/evidence/ui-dry-run-testnet.md`, for example the staker's settlement [`0x2083ffb3cdc4d558d36f24f6b9c9a5a1343f98cb21c9525d283ff66f90db1b17`](https://explorer.testnet.arc.io/tx/0x2083ffb3cdc4d558d36f24f6b9c9a5a1343f98cb21c9525d283ff66f90db1b17) and the beneficiary's [`0x82046ef05de0ec990fd0f08167aaef38b2610b36f532cb1db73adad188278035`](https://explorer.testnet.arc.io/tx/0x82046ef05de0ec990fd0f08167aaef38b2610b36f532cb1db73adad188278035) |

The two instances share nothing: each holds its own pledges, totals, and token balances, and neither knows the other exists.

## Why the old instance cannot be switched off

- The contract has no owner, admin, pause, upgrade, `selfdestruct`, or `delegatecall`, so nobody, the deployer included, can stop or change a deployed instance: `test_SC060_theDeployedBytecodeHasNoDelegatecallSelfdestructOrCallcode` and `test_SC061_theCompiledAbiHasExactlyTheFourNonViewFunctions`.
- `settle` may be called by any account once a pledge is settleable, so a pledge on an old instance can be settled directly from a wallet, a block explorer's write tab, or `cast send`, with no site at all: the `test_SC040_` and `test_SC041_` tests.

## How the site is repointed

The site reads its contract address from `deployments/<chainId>.json`, the record the deployment tool writes (`app/src/config/networks.ts`, tested in `app/src/config/networks.test.ts`). Repointing it is a new deployment record and a Pages rebuild; no code changes. The old address stays reachable on the explorer, and its pledges stay settleable as above.

## Limit

The site has never been repointed for real: the testnet site stayed on the first instance throughout. The evidence for repointing is the configuration test, not a live switch.
