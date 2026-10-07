# Mainnet seed

Date: 2026-10-07. Chain: Arc mainnet (5042). Contract `0xEbcda489EB528c573E9a190eB8EfE63b44d9204e` (`deployments/5042.json`). This is the run of `script/seed.mjs` that `docs/evidence/seed-rehearsal-testnet.md` rehearsed (LLR-DP-009, LLR-DP-012).

Signers: the deployer burner `0xd1728F74Ac083a0F9B41a3Ec16ed3A25af33809f` (staker and settler) and the referee burner `0x0Fb1b0C69dD6bD29C8Ec3057a3cF16d0ABD9E4B9`, through `--account` and `--password-file` only. Beneficiary `0x8bc7639eB29f2CaEc085E52eC1Fe0D0Ee8581cad`, held by the project owner. Liam authorized the agent to broadcast the seed on 2026-10-07, replacing the C0 decision that he would run it.

Before: `pledgeCount() == 0`; deployer 11.969803 USDC and 4,487 sats, referee 0.970452 USDC. Every phase ran first without `--send` (simulation on the live chain, all calls passed), then with it.

## Transactions

| Phase | Call | Transaction |
|---|---|---|
| create | approve cirBTC 2000 | [0xda228af5...056b8](https://explorer.arc.io/tx/0xda228af5bf3667a81c604ea6c0a71eae8733783549bd47ddf3c829028bd056b8) |
| create | approve USDC 2000000 | [0x7f708331...abb3b](https://explorer.arc.io/tx/0x7f708331ff501c879469de896d8538c21c2f7719518a7c2cd2ee5adf2c9abb3b) |
| create | createPledge 1 (cirBTC, 1000 sats) | [0x42edc1c7...09a14](https://explorer.arc.io/tx/0x42edc1c76c7adf506b658e0957cd80a56efaada6cd6569801912c512fec09a14) |
| create | createPledge 2 (USDC, 1 USDC) | [0x2e8a964e...4ffa5](https://explorer.arc.io/tx/0x2e8a964e767428d8067c02ac592ac20394555b9417ff82c5791ff9ee6a64ffa5) |
| create | createPledge 3 (USDC, 1 USDC) | [0x052f103e...70cdd](https://explorer.arc.io/tx/0x052f103e764161ac8a28c83f8a7185c1acc75c1c076e236f2d86f9b89d670cdd) |
| create | createPledge 4 (cirBTC, 1000 sats) | [0xe0679b55...fa2e5](https://explorer.arc.io/tx/0xe0679b5561d3a316b2a321bc6a33f6bb8e620b6326ab7ecfa50a35c3e71fa2e5) |
| verdicts | markKept 1 | [0xaa302705...51e84](https://explorer.arc.io/tx/0xaa3027055a9d447b2ca2385dd481a93c611512e185efe1edd06dc48202b51e84) |
| verdicts | markBroken 3 | [0xb4ef0202...365b2](https://explorer.arc.io/tx/0xb4ef0202dc4aeb9f941aacc9f37dcedb2ca2b7e0ce201ff6c8cdb23af48365b2) |
| settle | settle 1 (block 24757307) | [0x12535aff...9bc4ee](https://explorer.arc.io/tx/0x12535aff6aa71a7de574dfcc5d5e8a833fb2d3975024c01b994e8a61929bc4ee) |
| settle | settle 2 (block 24757312) | [0xc88bc0fe...7d7212](https://explorer.arc.io/tx/0xc88bc0fefadea76d408c8c19123a6385c214f42dfe0eef9babe00745079d7212) |
| settle | settle 3 (block 24757317) | [0x195905df...6564d1](https://explorer.arc.io/tx/0x195905df3227ce06e77bc9832b20e8c067ae10170336b8cf50d255bad06564d1) |

Settle 2 ran after pledge 2's deadline (chain time 1791389695) had passed with no verdict.

## Result

`pledgeCount() == 4`. `stateOf` read after the run: pledge 1 `4` (SettledToStaker), pledge 2 `5` (SettledToBeneficiary), pledge 3 `5` (SettledToBeneficiary), pledge 4 `0` (Active, deadline 2026-11-01T00:00:00Z).

Token transfers decoded from the settle receipts (all status 1), each the full stake and nothing else:

| Pledge | Ending | Token | To | Amount |
|---|---|---|---|---|
| 1 | Kept | cirBTC | staker `0xd172…809f` | 1000 sats |
| 2 | No answer by the deadline | USDC | beneficiary `0x8bc7…1cad` | 1000000 (1 USDC) |
| 3 | Broken | USDC | beneficiary `0x8bc7…1cad` | 1000000 (1 USDC) |

Each USDC settle also logs a Transfer of 10^18 from the native-token address `0xfff…fffe`: on Arc, USDC is also the native gas token, and the precompile reports the same move at 18 decimals. It is one movement, not two.
