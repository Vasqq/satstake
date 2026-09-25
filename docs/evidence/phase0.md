# Phase 0 evidence

Recorded 2026-09-24. Supports the results table at the end of `docs/01_VERIFICATION_PASS.md`.

## Check 2: EVM target on Arc testnet (chain 5042002)

Probe contract: one function that writes and reads transient storage (`TSTORE`, `TLOAD`) and ABI-encodes a value pair (Solidity emits `MCOPY` under `cancun` and later), then stores a result. Expected result of `bump(7)`: 71. Compiled with Solidity 0.8.28, optimizer at 200 runs.

| `evm_version` | Contract | Deploy tx | `bump(7)` tx | `v()` |
|---|---|---|---|---|
| cancun | `0xBFe25B09f33B598dBa99F92358Af4AeAE15A2FE4` | `0xbb3c31ec6753a4f629a1e659570eafcd86f08922ca5bed7e49806b3d9b1aa42b` | `0xd6c7be3c0defbbdb86b77ee8ddc083541d4c7e252196ea5df215177e4e0401a8` | 71 |
| prague | `0x4548f9fA301aF9Ff7de7142421Dfb3A33B085823` | `0x646523cc0a4090c27988e28b4de07805681a3c26bf907d25a50b107d2a211a22` | `0x2c6444343b0a1b453c4f6d64c32aa4e44cb8b9d0aeda84a7935afef62d74104e` | 71 |

`osaka` was rejected by Foundry 1.0.0 as an unknown EVM version, so it was not tested.

## Check 3: explorer rendering without login

In a browser with no Blockscout session, 2026-09-24:

- Mainnet address page `https://explorer.arc.io/address/0xd1728F74Ac083a0F9B41a3Ec16ed3A25af33809f` showed balance, token holdings, and transfer count, with a "Log in" button visible.
- Mainnet transaction page `https://explorer.arc.io/tx/0xf61d27a792d2e6ae33c692c0b475a40c3ddc140100cc6c0e0f495270a980775d` showed status Success, method `transfer`, the cirBTC amount, and the implementation label `FiatTokenV2_2`.
- Testnet `https://testnet.arcscan.app/address/0xBFe25B09f33B598dBa99F92358Af4AeAE15A2FE4` redirected to `https://explorer.testnet.arc.io/address/...` and showed the contract with its creator and creation transaction.

## Check 4: FiatToken interface

| Network | Token | `paused()` | `isBlacklisted(0x…01)` | `decimals()` |
|---|---|---|---|---|
| Mainnet 5042 | USDC `0x3600000000000000000000000000000000000000` | false | not called | 6 |
| Mainnet 5042 | cirBTC `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | false | not called | 8 |
| Testnet 5042002 | USDC `0x3600000000000000000000000000000000000000` | false | false | 6 |
| Testnet 5042002 | cirBTC `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | false | false | 8 |

On testnet the USDC ERC-20 interface reported 20000000 (6 decimals) while the native balance read 20.0 (18 decimals) for the same account, consistent with V-05.

## Check 5: testnet cirBTC through App Kit Swap

- Packages: `@circle-fin/swap-kit` 1.7.0 and `@circle-fin/adapter-viem-v2` 1.18.0, published by Circle's npm maintainers. Installed with `--ignore-scripts` in a scratch directory outside the repository.
- `npm audit` before the fix: 4 high, via `@coral-xyz/anchor` → `toml` 3.0.0 (GHSA-82x6-q7mm-w9cf, GHSA-v5mp-jgw5-2x6j). After an `overrides` entry pinning `toml` 4.3.0: 0 high, 0 critical.
- Estimate for 2 USDC: 0.0000057 cirBTC, provider fee 0.0004 USDC.
- Swap of 5 testnet USDC: tx `0x7548553a48a7288b17b1c4b3bcdd4a4fcce7c32c22a0f3536bf8b963d39f96af`, received 1,425 sats. Testnet operator cirBTC balance afterwards: 1425.

## Check 6: prior art and name

Web searches: "SatStake crypto"; "Arc network commitment contract stake promise referee forfeit cirBTC USDC"; "onchain commitment device stake money on goal referee forfeit smart contract 2026"; "dorahacks arc microgrants buidl pledge accountability stake".

GitHub repository searches: "commitment contract arc network", "pledge referee stake arc", "stickk onchain" (no results); "cirBTC" and "arc microgrants" (listed below where relevant).

- Off-chain commitment services found: stickK, Forfeit. Neither runs on a chain.
- Arc projects found touching cirBTC: ProofPay (trade escrow), Circle's lend-and-borrow sample, lending apps, a Uniswap v4 launchpad hook, a DCA agent. None is a personal commitment device.
- Arc Microgrants repositories found: agent labor markets, monitoring oracles, receipt stamps, spread ledgers. None overlaps.
- Name: no GitHub repository other than this one, no npm package, `satstake.com` is a parked page, `satstake.io` does not resolve.
