# Arc mainnet deployment

Evidence for LLR-DP-003 (keystore only), LLR-DP-004 (post-deploy check), LLR-DP-005 (the record), LLR-DP-006
(Sourcify perfect match), LLR-DP-007 (explorer), and LLR-DP-012 (simulate before broadcasting). Performed
2026-10-03 by the agent, per the C0 decision that the agent runs the deployment because it pays gas only and
moves no tokens.

## The deployment

| | |
|---|---|
| Network | Arc mainnet, chain 5042 |
| RPC | `https://rpc.mainnet.arc.io` |
| Contract | `0xEbcda489EB528c573E9a190eB8EfE63b44d9204e` |
| Deploy transaction | `0xfe8720af50b8b8e7da5ed0fd83d0969add54629f38fe94b25b932d4a8bb85ede` |
| Block | 24150294 |
| Commit | `cbb7fc3c96912cb5c41b721af2e46b4b9afa498f` |
| Compiler | 0.8.28+commit.7893614a, optimizer on at 200 runs, `cancun` |
| Deployer | `0xd1728F74Ac083a0F9B41a3Ec16ed3A25af33809f` (keystore `satstake-deployer`) |
| Gas | 1,548,738 gas at 20 gwei, about 0.031 USDC (read from the receipt, status 1) |

Explorer: `https://explorer.arc.io/address/0xEbcda489EB528c573E9a190eB8EfE63b44d9204e`

The allowlist is the two tokens of `deployments/config/5042.json`, each with the official page it was
confirmed against (LLR-DP-002): USDC `0x3600000000000000000000000000000000000000` and cirBTC
`0x171A4217b86A807A64eB94757Db6849fb4bDbAA0`. `script/Deploy.s.sol` refuses to run unless the chain is
the config's 5042 (LLR-DP-001).

## Preflight

Read-only, before anything was signed: `cast chain-id` returned 5042; the deployer held 12.000778 USDC;
the gas price was 20 gwei; `src/` had no change against HEAD. The mainnet token config and the
`arc_mainnet` alias were committed first (`cbb7fc3`), so the record's commit holds every input of the
deployment.

## Simulation, then broadcast (LLR-DP-012, LLR-DP-003)

The simulation, with no `--broadcast`:

```
forge script script/Deploy.s.sol --rpc-url arc_mainnet --account satstake-deployer --password-file ~/.satstake/deployer.pw
```

It ended "Script ran successfully" and "SIMULATION COMPLETE", returned the address above, and estimated
2,013,359 gas, at most 0.0805 USDC at the 40 gwei it assumes. Only then was the same command run with
`--broadcast` added, which ended "ONCHAIN EXECUTION COMPLETE & SUCCESSFUL" at the simulated address.

No private key was passed or read: the sender came from the encrypted keystore through `--account`, and
its password from a file outside the repository through `--password-file`. The run's broadcast and cache
files are under the gitignored `broadcast/` and `cache/`.

## The record (LLR-DP-005)

`node tools/record-deployment.mjs 5042` wrote `deployments/5042.json` from the broadcast artifact before
any later commit, then again after verification to carry the Sourcify status. It holds the address,
transaction, block, commit, compiler version and settings, and the verification status.

## The post-deploy check (LLR-DP-004)

`forge script PostDeployCheckScript --rpc-url arc_mainnet` against the recorded address: **Script ran
successfully**. It confirms `allowedTokens()` against the config, the four constants, `pledgeCount() == 0`,
and each token's `decimals()`. It first failed to start because a test-only script deleted moments before
left a reference in `out/`; `forge clean` and a rebuild cleared it, as recorded on 2026-09-30.

## Sourcify (LLR-DP-006)

```
verify-sourcify: chain 5042, 0xebcda489eb528c573e9a190eb8efe63b44d9204e, match exact_match.
```

The record carries `match`, `creationMatch`, and `runtimeMatch`, all `exact_match`, and `perfectMatch: true`.

## Explorer (LLR-DP-007)

The explorer's API answers anonymous `curl` requests with a browser check, so the page was read in a
headless browser on 2026-10-03: `https://explorer.arc.io/address/0xEbcda489EB528c573E9a190eB8EfE63b44d9204e?tab=contract`
shows "Contract source code verified (exact match)", contract name SatStake, compiler 0.8.28+commit.7893614a,
`cancun`, optimizer on at 200 runs, verified at Oct 3, 2026 22:40:28, about a minute after the Sourcify
verification. It arrived through the explorer's bytecode database with no step in the explorer UI.

Writing that status into `deployments/5042.json` is left to Liam:
`node tools/record-deployment.mjs 5042 --explorer verified-by-sourcify --checked 2026-10-03`. Liam ran it on
2026-10-04; the record now says `verified-by-sourcify`, checked 2026-10-03, and condition 8 of the release gate
(06 section 3) passes on it.

## Mainnet RPC and block overrides

The pledge page explains a mined revert by replaying the call at the block before with that block's time
(`eth_call` block overrides). Read-only check against the mainnet RPC: `eth_call` to Multicall3
`getCurrentBlockTimestamp()` with the override `{ "time": "0x1234" }` returned `0x...1234`. The override
is accepted and applied.
