# Accounts

Public addresses only. Keys never enter this repository: the mainnet burners live in Foundry keystores and are used through `--account` and `--password-file`; the testnet key lives in the gitignored `.env`.

## Arc mainnet (chain 5042)

| Role | Address | Key storage | Purpose |
|---|---|---|---|
| Deployer | `0xd1728F74Ac083a0F9B41a3Ec16ed3A25af33809f` | keystore `satstake-deployer` | Deploys SatStake; staker of the seeded pledges |
| Referee | `0x0Fb1b0C69dD6bD29C8Ec3057a3cF16d0ABD9E4B9` | keystore `satstake-referee` | Judges the seeded pledges |
| Beneficiary | `0x8bc7639eB29f2CaEc085E52eC1Fe0D0Ee8581cad` | held by the project owner | Receives broken and expired seeded pledges |

Balances confirmed with `cast call balanceOf` at block 22618124, 2026-09-24:

| Role | USDC (6 decimals) | cirBTC (8 decimals) |
|---|---|---|
| Deployer | 12.000778 | 0.00004487 |
| Referee | 0.970452 | 0 |
| Beneficiary | 0 | 0 |

The cirBTC first arrived at the referee and was moved to the deployer in transaction `0xf61d27a792d2e6ae33c692c0b475a40c3ddc140100cc6c0e0f495270a980775d` (block 22618075), so the referee only judges and never stakes.

## Token addresses (mainnet)

| Token | Address | Confirmed against | Date |
|---|---|---|---|
| USDC (ERC-20 interface) | `0x3600000000000000000000000000000000000000` | https://docs.arc.io/arc/references/contract-addresses | 2026-09-24 |
| cirBTC | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | https://developers.circle.com/assets/cirbtc-contract-addresses.md and https://docs.arc.io/arc/references/contract-addresses | 2026-09-24 |

On-chain check of cirBTC on chain 5042: `name()` "Circle Wrapped Bitcoin", `symbol()` "cirBTC", `decimals()` 8, `paused()` false.

## Arc testnet (chain 5042002)

| Role | Address | Key storage | Balance |
|---|---|---|---|
| Testnet operator | `0x18648257045D8c323Cff1E4F80EeD22F157D8767` | `.env` (gitignored, zero value) | 20 USDC from faucet.circle.com, 2026-09-24 |
