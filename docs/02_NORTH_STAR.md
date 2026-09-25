# 02 North Star

Version 1.1, 2026-09-24. This document states what SatStake is, who it serves, and which properties it must never lose. Every high-level requirement traces to a section here.

Tags: [D] decided. [S] supported by evidence (see 01_VERIFICATION_PASS.md). [A] assumption. [Q] open question. Open questions are not decisions.

## 1. The one sentence

Lock Bitcoin against a promise. Keep it and you get your sats back. Miss it and they go to someone else. [D]

## 2. Problem

People make promises to themselves and each other that cost nothing to break. Commitment contracts (the stickK model) work because the loss is real, but the existing services hold the money themselves, decide the outcome themselves, and settle on their own schedule. The staker has to trust the platform more than the promise. [A]

## 3. What SatStake is

A single smart contract on Arc and a static web page. A staker locks cirBTC or USDC against a written promise, names a referee who judges it, and names a beneficiary who receives the stake if the promise is broken. The contract settles the outcome by fixed rules. [D]

## 4. Actors

| Actor | Who | What they want |
|---|---|---|
| Staker | The person making the promise | Real consequences, and certainty that keeping the promise returns the stake |
| Referee | A person the staker trusts | A one-tap way to confirm or deny, with no custody of funds |
| Beneficiary | A friend, rival, or cause | Certainty that a broken promise pays them |
| Visitor | Anyone holding the share link | To see the promise, the stake, and the outcome without a wallet |
| Grant reviewer | An Arc or Circle reviewer | To understand the product in seconds and confirm it runs on mainnet |
| Operator | Claude Code with Liam | To deploy, verify, and publish without holding any power over pledges |

## 5. Product properties (the law beneath the requirements)

These are claims about the product. They must stay true in code, in the UI, and in every sentence written about SatStake.

- **P1 Rules, not people, move the money.** After a pledge is created, funds move only to the staker or the beneficiary, only by the pledge rules. [D]
- **P2 No privileged role.** There is no owner, admin, fee, pause, upgrade, or sweep function in SatStake. The operator has no power over any pledge after deployment. [D]
- **P3 Silence is failure.** If the referee has not confirmed the promise before the deadline, the promise is treated as broken. The staker's burden is to obtain confirmation in time. [D]
- **P4 Verdicts are final and time-bounded.** The referee rules once, only before the deadline. [D]
- **P5 One pledge cannot harm another.** A failure in one pledge's settlement (blocklisted recipient, paused token) leaves every other pledge unaffected. [D]
- **P6 Readable by anyone.** A pledge's promise, parties, stake, deadline, and status are public and readable without a wallet. [D]
- **P7 Honest claims only.** SatStake never claims that no one can freeze the funds. The token issuer (Circle) can pause a token or blocklist an address, and SatStake says so. [D] [S V-08, V-09]

Non-interfaces are product claims: the absence of an admin function is a feature, not an omission. No future change may add one without revising this document. [D]

## 6. Why Arc

- cirBTC is Circle's 1:1 BTC-backed token, available on Arc. [S V-06, V-07]
- Gas is paid in USDC at a 20 gwei floor, so a small stake is economical and the staker needs no second token. [S V-11]
- Deterministic finality means a settlement is final when it lands. [S]
- One sentence for the submission: "SatStake uses cirBTC as the stake, USDC as gas so a $5 promise costs cents to make, and Arc's deterministic finality so a forfeit is final the moment it lands." [D]

## 7. Trust model and known limitations

- The referee is trusted by the staker. A dishonest referee can mark a kept promise broken. The staker chooses the referee; SatStake prevents only the structural conflicts (referee cannot be the staker or the beneficiary). [D]
- The token issuer can pause a token or blocklist an address. While paused, pledges in that token cannot be created or settled. A blocklisted recipient cannot receive; that pledge's funds remain locked until the block is lifted. [S V-08] [A V-09]
- Tokens sent directly to the contract, outside `createPledge`, are unrecoverable, because no sweep function exists (P2). [D]
- A beneficiary address that nobody controls makes a broken pledge's stake unrecoverable. The UI warns the staker. [D]
- SatStake is tested, not formally verified, and not audited. [D]

## 8. Non-goals

Protocol fees, admin controls, upgradeability, multiple referees, partial stakes, cancellation, top-ups, oracles, notifications, indexers, backends, accounts, analytics, privacy features, agents, and native `msg.value` handling. [D]

## 9. Success criteria

- A grant reviewer understands the product from the landing page in under 10 seconds. [A]
- The mainnet deployment is verified on Sourcify and on the explorer. [D]
- Mainnet shows at least one pledge settled to a staker and one expired pledge settled to a beneficiary. [D]
- Every low-level requirement has implementing code and a passing test or a recorded inspection. [D]

## 10. Decision log

| # | Decision | Reason |
|---|---|---|
| D-01 | ERC-20 path only; no `msg.value` | Removes the 18/6 decimal trap from the contract; Circle recommends the ERC-20 interface (V-05) |
| D-02 | Single permissionless `settle` instead of separate withdraw and claim | Funds can only go to the rightful party, so anyone may trigger it; a charity beneficiary never has to act |
| D-03 | Promise text stored on-chain, capped at 280 bytes | Share page needs no log scan (V-11); cost is a fraction of a cent |
| D-04 | Deadline uses `block.timestamp` with a strict `<` / `>=` partition | Repeated timestamps only matter for sub-second ordering (V-10) |
| D-05 | Immutable token allowlist set at construction | No admin (P2); prevents arbitrary or fee-on-transfer tokens |
| D-06 | Per-address pledge index on-chain | Lets each actor find their pledges without logs or a backend |
| D-07 | Static frontend with hash routing | No server, deployable to GitHub Pages |
| D-08 | Referee must differ from staker and beneficiary | Removes the two structural conflicts of interest |

## 11. Definition of done

SatStake is done when all of the following are true. [D]

1. The product works on Arc mainnet as sections 1 to 7 describe.
2. Every user journey in 03_USER_JOURNEYS.md has been verified and shows its expected outcome, whether that outcome is a success or a correctly handled failure (docs/ACCEPTANCE.md).
3. Every requirement in 04_HLR.md and 05_LLR.md is fulfilled and traced to code and evidence (docs/TRACE_MATRIX.md).
4. Every tested requirement was tested first: the test was seen to fail, then the code made it pass.
5. Liam has completed the end-user walkthrough (docs/WALKTHROUGH.md) without finding a defect.

## 12. From North Star to README

The public README is this document rewritten for a reader who has ten seconds: section 1 becomes the opening line, section 3 the description, section 6 the "Why Arc" section, section 7 the "Trust model and limitations" section. Nothing may appear in the README that is not stated here. [D]
