# 01 Verification Pass

Version 1.1, 2026-09-24. Second research pass, with Phase 0 results appended (see the end of this document). Purpose: resolve the remaining factual ambiguities before any requirement is written, so that no requirement rests on an unverified platform assumption.

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

## Phase 0 results (2026-09-24)

| Check | Result | Evidence |
|---|---|---|
| 1. cirBTC mainnet address (V-06) | Confirmed `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` on both official pages. On chain 5042: name "Circle Wrapped Bitcoin", symbol cirBTC, 8 decimals. V-06 is now [S]. | `deployments/accounts.md` |
| 2. EVM target (V-13) | Solidity 0.8.28, optimizer 200 runs: a probe using `TSTORE`, `TLOAD`, and `MCOPY` deployed and ran on Arc testnet under both `cancun` and `prague`. Foundry 1.0.0 does not offer `osaka`. Decision: keep `cancun` (LLR-SC-001 default), because `prague` adds no opcode the contract uses and `cancun` has the widest support across Slither and verifiers. | `docs/evidence/phase0.md` |
| 3. Explorer logged out (V-03) | `explorer.arc.io` address and transaction pages render without login. The testnet explorer `testnet.arcscan.app` now redirects to `explorer.testnet.arc.io`. | `docs/evidence/phase0.md` |
| 4. FiatToken interface (V-09) | `paused()` returns false for USDC and cirBTC on mainnet and testnet; `isBlacklisted(address)` answers on both testnet tokens; the explorer labels cirBTC's implementation `FiatTokenV2_2`. V-09 is now [S] for the interface; pause behaviour itself stays tested only with mocks. | `docs/evidence/phase0.md` |
| 5. Testnet cirBTC (V-07) | App Kit Swap (`@circle-fin/swap-kit` 1.7.0, no API key) swapped 5 testnet USDC for 1,425 sats of cirBTC. Its Solana dependency chain carried high advisories in `toml` 3.0.0; an npm override to `toml` 4.3.0 cleared them. The kit was used from a scratch directory and is not a project dependency. | `docs/evidence/phase0.md` |
| 6. Prior art (V-14) | No commitment device with a referee and forfeit on Arc. Nearest new neighbour: ProofPay, buyer and seller trade escrow on Arc testnet (https://github.com/24hlivepay/ProofPay-Mainnet). Different niche. The name SatStake has no product, package, or repository conflict; `satstake.com` is a parked page. | Searches listed in `docs/evidence/phase0.md` |

## Findings added in Phase 0

| ID | Topic | Finding | Tag | Design impact |
|---|---|---|---|---|
| V-15 (resolved) | Judging criteria | Published on the program page: "Relevance to Arc, technical credibility, the quality of what you built, and whether the project is worth taking further. Promise counts for more than traction here." Source: https://dorahacks.io/hackathon/arc-microgrants/detail | [S] | CLAUDE.md section 8 maps the build to these four criteria. |
| V-17 | Review timing | "Reviews run on a rolling basis and every decision is issued by October 21. Earlier submissions get earlier answers." Shortlisted projects are "scored and decided in batches". Twenty grants from a fixed pool; "Program dates and microgrant counts may be adjusted." Same source. | [S] | Schedule pulled forward: walkthrough target October 3, limit October 10. |
| V-18 | Eligibility | The project must be deployed and working on mainnet at submission; a public builder profile is required; testnet-only builds are not eligible. Same source. | [S] | Submission waits for the mainnet release gate; the builder profile is GitHub `Vasqq`. |
