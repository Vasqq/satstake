# Arc testnet deployment

Demonstration evidence for LLR-DP-006 (Sourcify verification with a perfect match) and the record
LLR-DP-005 requires. Performed 2026-09-30 by the agent, per the C0 decision that the agent runs the
deployment itself because it pays gas only and moves no tokens.

## The deployment

| | |
|---|---|
| Network | Arc testnet, chain 5042002 |
| RPC | `https://rpc.testnet.arc.io`, answering anonymous requests |
| Contract | `0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4` |
| Deploy transaction | `0xcee5ec10fd42ceb39a35ec2dd51b7b69ce80c8d1f8e98b32c7749214c442c736` |
| Block | 64784295 |
| Commit | `61fa8b0173c2484ab65e4f131d520091535d4de9` |
| Compiler | 0.8.28+commit.7893614a, optimizer on at 200 runs, `cancun` |
| Gas | 1,548,738 gas at 25 gwei, about 0.039 USDC, from the testnet operator's faucet balance (read from the receipt) |

Explorer: `https://explorer.testnet.arc.io/address/0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4`

The allowlist is the two tokens of `deployments/config/5042002.json`, in that file's order: USDC
`0x3600000000000000000000000000000000000000` and cirBTC
`0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF`, both confirmed on chain in Phase 0.

Run as a simulation first with no `--broadcast`, which the requirements demand of every mainnet
script and which applies just as well to a testnet one. The simulation succeeded, and only then was the same command broadcast. The script reads no
private key: it broadcasts with the sender the command line supplies. On testnet that sender was the
testnet operator, whose only key is the zero-value one in the gitignored `.env`, passed with
`--private-key`; the receipt's sender is that operator's address. The exact command line was not
recorded at the time. The keystore rule applies to mainnet only, and this run is not evidence for it:
the mainnet deployment supplies its sender with `--account` and records that command. Foundry writes the run's sensitive values under `cache/`, which
`.gitignore` covers along with `broadcast/`; both were confirmed ignored with `git check-ignore`
after the run.

## The post-deploy check (LLR-DP-004)

`forge script PostDeployCheckScript --rpc-url arc_testnet` against the deployed address: **Script ran
successfully**, so every clause the requirement names agreed with the config.

Read independently with `cast` rather than through the script, so the evidence does not rest on the
check agreeing with itself. A summary of `cast call` results, one per getter, and `cast codesize`, as
the contract stood at deployment:

```
allowedTokens      [0x3600000000000000000000000000000000000000, 0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF]
MIN_DURATION       60
MAX_DURATION       31536000
MAX_PROMISE_BYTES  280
MAX_PAGE           100
pledgeCount        0
code size          6201 bytes
```

Corrected at the independent review: the first version of this block gave 12405 bytes, which is the
character count of `cast code` output rather than the byte size, named the constant `MAX_PROMISE`,
which does not exist on chain, and gave the gas as about 0.09 USDC at 45 gwei. The code size, the
constants, `allowedTokens` and the gas were read again from the chain and the receipt on 2026-10-01.
`pledgeCount` was 0 at deployment and is no longer: the live testnet run of the pledge journeys
created pledges on this contract the same day (`docs/evidence/e2e-testnet.md`).

## Sourcify verification (LLR-DP-006)

**`match: exact_match`, with `creationMatch` and `runtimeMatch` both `exact_match`**, verified at
2026-09-30T13:34:19Z, match id 54336528. That is the perfect match the requirement asks for.

Read back at any time with:

```
curl -s https://sourcify.dev/server/v2/contract/5042002/0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4
```

**`forge verify-contract --verifier sourcify` does not work against the current Sourcify server.** It
posts to the legacy `POST /verify` endpoint, which now answers 404 with an HTML body, so Foundry
fails with `error decoding response body; expected value at line 1 column 1` after five retries. This
was measured on 2026-09-30, and the 404 was confirmed directly against the endpoint. Sourcify's
`/chains` list does include both Arc chains as supported (5042 Arc Mainnet, 5042002 Arc Testnet), so
the requirement is satisfiable as written and needs no change: the obstacle is Foundry's client, not
Sourcify's coverage.

The verification was therefore driven against Sourcify's v2 API. It was performed by hand first, then
`tools/verify-sourcify.mjs` was written so the mainnet group repeats it from a tool rather than from
a shell history. A re-run of that tool against this deployment reports the existing perfect match
without submitting anything:

```
verify-sourcify: chain 5042002, 0x3ae26b15b9085ddb223ffeb503b4f713e682cac4, match exact_match.
```

The block explorer half of verification applies to mainnet and is not part of this group. Sourcify's own push to Blockscout failed here with a 400, which is a push to a third party
rather than the Sourcify verification, and the tool deliberately ignores failures reported under
`externalVerifications`.

## The record (LLR-DP-005)

`deployments/5042002.json`, written by `tools/record-deployment.mjs` from the broadcast artifact, the
compiled artifact, git and Sourcify, so no field is typed by hand. It carries all six items the
requirement names. Its Sourcify status carries all three fields Sourcify reports, `match`,
`creationMatch` and `runtimeMatch`, and `perfectMatch`, true only when all three are `exact_match`.
The summary `match` alone is not enough: Sourcify's own v2 specification gives
`{"match":"exact_match","creationMatch":"exact_match","runtimeMatch":"match"}` as an example
response, a partial match whose summary reads exact. The first version of the record read only the
summary, and the independent review found it. Here all three read `exact_match`.

The record was rebuilt with the corrected tool's `buildRecord` and `sourcifyStatus` from the same
broadcast, not with its `main`, because `main` refuses unless HEAD is the broadcast commit and HEAD had
moved on by one commit, which changed no file under `src`, `lib` or `foundry.toml`. `gitCommit` was
carried over as `61fa8b0`, the commit the broadcast names, and only the two new fields changed. The
exact invocation is in `docs/evidence/tdd-log.md` under "Review fixes". The mainnet group should
record before committing anything, or relax the guard to compare the bytecode paths between the
broadcast commit and HEAD, so the same bypass is not needed there.

The tool refuses to write when `src`, `lib` or `foundry.toml` hold uncommitted changes, since the
recorded commit would otherwise name source that was never deployed. That is why the group's code was
committed before the deployment ran.
