# 01 Verification Pass

Version 1.0, 2026-09-24. Second research pass. Purpose: resolve the remaining factual ambiguities before any requirement is written, so that no requirement rests on an unverified platform assumption.

Tags: [S] supported by a cited source. [A] assumption, must be confirmed in Phase 0. [Q] open question, cannot be resolved by desk research.

## Findings

| ID | Topic | Finding | Tag | Design impact |
|---|---|---|---|---|
| V-01 | Chain IDs | Mainnet 5042, testnet 5042002, per `crates/shared/src/chain_ids.rs` in circlefin/arc-node. Values such as 1516 and 1243 found in third-party guides are wrong. Source: https://github.com/circlefin/arc-node/pull/263 | [S] | Chain IDs are fixed constants in the frontend config (LLR-FE-001). |
| V-02 | Mainnet RPC | Docs describe early-mainnet endpoints as permissioned, but `rpc.mainnet.arc.io` was measured answering anonymous requests with CORS for a foreign origin on 2026-09-21. Source: https://github.com/circlefin/arc-node/issues/454 and https://docs.arc.io/arc/references/rpc-endpoints | [S] behavior, [Q] permanence | The frontend shall accept an ordered RPC list and fall back (LLR-FE-003). No backend is needed while anonymous access holds. |
| V-03 | Mainnet explorer | `explorer.arc.io` is Blockscout. Its `/api` sits behind a Cloudflare managed challenge. HTML pages were reported rendering logged-out on 2026-09-21 (issue #454); an August review described it as login-gated (PR #263). Testnet explorer is `testnet.arcscan.app`. | [S] conflicting, [Q] | Explorer links are shown, but every link is paired with a copyable hash (LLR-FE-040). Phase 0 confirms logged-out rendering in a browser. |
| V-04 | Source verification | Sourcify supports chain 5042 natively and returns a perfect match. Sourcify's push to the Arc explorer is blocked by Cloudflare, so the explorer may still show the contract as unverified. `forge verify-contract --verifier blockscout` fails from scripts. Manual verification through the explorer UI works. Source: https://github.com/circlefin/arc-node/issues/425 | [S] | Deployment verifies on Sourcify by script, then Liam performs a one-time manual explorer UI verification at checkpoint C3 if the explorer does not show it (LLR-DP-006, LLR-DP-007). |
| V-05 | USDC interfaces | Native USDC uses 18 decimals; the ERC-20 interface at `0x3600000000000000000000000000000000000000` uses 6 decimals over the same balance. Circle recommends relying solely on the ERC-20 interface for reading balances and sending transfers. Source: https://docs.arc.io/arc/references/contract-addresses | [S] | The contract never handles `msg.value`; all assets move through the ERC-20 path (LLR-SC-002). |
| V-06 | cirBTC token | cirBTC uses the same FiatTokenProxy architecture as USDC and EURC, with 8 decimals. Testnet address `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF`. Mainnet address previously reported as `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0`. Sources: https://docs.arc.io/arc/references/contract-addresses and https://developers.circle.com/assets/cirbtc-contract-addresses.md | [S] architecture, decimals, testnet address; [A] mainnet address | Mainnet address must be confirmed against the Circle page before deploy (LLR-DP-002). |
| V-07 | cirBTC acquisition | Mainnet: tradable on Uniswap on Arc without a Circle account. Testnet: App Kit Swap supports USDC, EURC, and cirBTC on Arc testnet. Sources: https://blog.uniswap.org/uniswap-is-live-on-arc and https://docs.arc.io/app-kit/swap | [S] | Demo stakes in cirBTC are feasible within the $20 budget. USDC remains a supported stake asset as a fallback. |
| V-08 | Blocklist enforcement | Transfers to or from a blocklisted address revert; only that operation reverts and fees are still collected. Standard anvil does not reproduce this; Arc Foundry (`arc-forge`, `arc-anvil`) does. Sources: https://docs.arc.io/arc/references/evm-differences and https://www.arc.io/blog/arc-compatibility-guide-for-existing-evm-apps | [S] | Settlement is per pledge, so a blocklisted recipient affects only its own pledge (HLR-011). Documented limitation (NS section 7). |
| V-09 | Issuer controls | FiatToken contracts can be paused by the issuer, which blocks all transfers of that token. | [A] standard FiatToken behavior, inferred from V-06 | Documented limitation. Pause affects create and settle; state is unchanged and the action can be retried (HLR-012). |
| V-10 | Time and randomness | Multiple blocks may share the same timestamp; `block.prevrandao` is always 0. Source: https://docs.arc.network/arc/concepts/evm-compatibility | [S] | Deadline logic uses a strict partition: verdict iff `timestamp < deadline`, expiry iff `timestamp >= deadline` (LLR-SC-020, LLR-SC-030). No randomness is used. |
| V-11 | RPC limits | `eth_getLogs` span is capped at 10,000 blocks. The public endpoint is load-balanced across backends with different heads and can return `-32014 requested data not available`. Gas price sits at a 20 gwei floor. Blocks arrive at roughly 2 per second. Source: https://github.com/circlefin/arc-node/issues/454 | [S] community-measured | The frontend reads all state through view functions, never through log scans (LLR-FE-010), and retries `-32014` (LLR-FE-004). |
| V-12 | Foundry ergonomics | `forge create --constructor-args` swallows following flags. Source: issue #454 | [S] | Deployment uses `forge script` only (LLR-DP-003). |
| V-13 | EVM version | Arc is reported Osaka-active since May 2026 (arc-node#429, round 1 research). | [A] | Compile with `evm_version = "cancun"` unless Phase 0 proves a later target works on Arc testnet (LLR-SC-001). |
| V-14 | Prior art | Rechecked 2026-09-24. No personal commitment device exists on Arc. Nearest: CommitLock (Ethereum, ETH stake, forfeits to contract owner, oracle-verified GitHub commits, https://github.com/johng2023/gitAccountable); agent bonding and slashing projects on Arc (Bazaar, Athena, Bondwire) target machine actors, not people. | [S] | Niche still open. Rerun within 48 hours of submission. |
| V-15 | Judging rubric | No official rubric has been published. | [Q] | Proxy rubric in CLAUDE.md stands. |
| V-16 | "Verified" meaning | The DoraHacks requirement says "verified"; it does not say which verifier. | [Q] | Satisfy both: Sourcify perfect match and explorer UI verification. |

## Phase 0 confirmation list

Each [A] or [Q] item above that a requirement depends on is repeated here as a concrete check. Record results in the CLAUDE.md status log.

1. Confirm the cirBTC mainnet address on the Circle contract-addresses page (V-06).
2. Deploy a trivial contract to Arc testnet with `evm_version = "cancun"`, then try `"prague"` (V-13).
3. Open `explorer.arc.io` logged out in a browser and confirm an address page renders (V-03).
4. Call `pause`-related view functions (`paused()`) on both tokens to confirm the FiatToken interface (V-09).
5. Obtain testnet cirBTC through App Kit Swap (V-07).
6. Rerun the prior-art queries (V-14).
