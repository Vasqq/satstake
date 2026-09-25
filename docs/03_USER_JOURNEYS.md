# 03 User Journeys

Version 1.1, 2026-09-24. Every way any actor, human or system, can interact with SatStake. Each journey lists the high-level requirements it produces or depends on. Every journey maps to at least one HLR. Every HLR traces to a journey, a North Star section, or a verification finding; HLR-016, 018, 028, 035, and 041 trace to the latter two. Each journey is verified and its result recorded in docs/ACCEPTANCE.md (LLR-VV-009).

Actors are defined in 02_NORTH_STAR.md section 4, plus three system actors: **Adversary** (any account acting against the rules), **Issuer** (Circle, as controller of token pause and blocklist), and **Network** (Arc RPC endpoints and explorer).

Format: trigger, main flow, outcome, then numbered alternate or failure paths.

---

## A. Arrival and onboarding

**UJ-01 Visitor arrives without a wallet.** Trigger: opens the site. Flow: reads the one-sentence hook, the three-step explanation, and the live proof panel (contract address, verification link, pledge count). Opens an example pledge. Outcome: understands the product without connecting anything. HLR-013, HLR-020, HLR-027.

**UJ-02 Staker connects a wallet.** Trigger: taps Connect. Flow: site lists injected wallets; user picks one; site shows the shortened address. Outcome: connected. Alternates: (1) no injected wallet found: site explains that a browser wallet is needed and keeps read-only mode (HLR-025). (2) user rejects the connection request: site returns to its prior state without an error style. HLR-025.

**UJ-03 Wallet on the wrong network.** Trigger: connected wallet reports a chain other than Arc. Flow: site disables all write actions and offers "Switch to Arc"; wallet switches, or adds Arc if unknown. Outcome: writes enabled. Alternate: user declines; writes remain disabled with a visible reason. HLR-025.

**UJ-04 Staker has no stake tokens.** Trigger: selected token balance is zero. Flow: create form shows the balance and blocks submission with a plain explanation. Outcome: no wallet prompt is raised for an impossible action. HLR-021, HLR-024.

## B. Creating a pledge (Staker)

**UJ-10 Create a cirBTC pledge (primary path).** Trigger: staker opens Create. Flow: writes the promise; selects cirBTC; enters an amount (shown also in sats); enters referee and beneficiary addresses; picks a deadline; acknowledges the trust statement; submits; approves the exact amount if allowance is short; confirms creation. Outcome: pledge exists on-chain in Active state; staker lands on its share page with a copy-link control. HLR-001, HLR-002, HLR-021, HLR-026.

**UJ-11 Create a USDC pledge.** As UJ-10 with USDC through its ERC-20 interface. Outcome: same. HLR-001, HLR-009, HLR-026.

**UJ-12 Invalid form input.** Trigger: any field invalid: empty or over-length promise, zero amount, amount above balance, too many decimal places, malformed address, referee or beneficiary equal to the staker, referee equal to beneficiary, deadline under 60 seconds or over 365 days away. Flow: inline message per field; submit stays disabled. Outcome: no wallet prompt. HLR-008, HLR-021, HLR-024.

**UJ-13 Allowance already sufficient.** Flow: approval step is skipped; one wallet prompt only. HLR-021.

**UJ-14 Staker rejects a wallet prompt.** Trigger: rejects approval or creation. Outcome: form retains its values; neutral message; no state change on-chain beyond any completed approval. HLR-012, HLR-024.

**UJ-15 Approval succeeds, creation fails.** Trigger: creation reverts (for example the token was paused in between). Outcome: plain explanation; the exact allowance remains; retry needs one prompt. HLR-012, HLR-024.

**UJ-16 Repeated submit.** Trigger: staker taps submit again while a transaction is pending. Outcome: ignored; exactly one creation. HLR-021.

**UJ-17 Party address has contract code.** Trigger: referee or beneficiary is a contract address. Outcome: warning that a contract may be unable to act; creation still allowed. HLR-027.

**UJ-18 Staker names an unreachable beneficiary.** Trigger: always shown at acknowledgement. Outcome: staker confirms understanding that a broken pledge pays that address and cannot be recovered otherwise. HLR-027.

## C. Sharing and monitoring (all human actors)

**UJ-20 Open a share link.** Trigger: any actor opens the pledge page. Flow: sees promise, stake with symbol, the three parties labelled by role, deadline in local time, a countdown, and status. Outcome: complete understanding without a wallet. HLR-013, HLR-022.

**UJ-21 Open a link to a pledge that does not exist.** Outcome: "pledge not found" view with a link home. HLR-022, HLR-024.

**UJ-22 Connected party recognized.** Trigger: connected account equals the staker, referee, or beneficiary. Outcome: role badge and only the actions valid for that role and state. HLR-022.

**UJ-23 Find my pledges.** Trigger: connected actor opens My Pledges. Outcome: pledges listed by role, newest first, paged. HLR-014.

**UJ-24 State changes while viewing.** Trigger: a verdict, expiry, or settlement happens while the page is open. Outcome: page reflects the new state within one polling interval without reload. HLR-023.

**UJ-25 Device clock is wrong.** Trigger: local clock differs from chain time. Outcome: countdown and button availability follow chain time. HLR-023.

## D. Verdict (Referee)

**UJ-30 Confirm a kept promise.** Trigger: referee opens the link before the deadline and taps Kept. Outcome: status Kept; staker can now withdraw. HLR-003.

**UJ-31 Declare a broken promise.** Trigger: referee taps Broken before the deadline. Flow: confirmation dialog stating the action is irreversible. Outcome: status Broken; beneficiary can claim. HLR-003, HLR-022.

**UJ-32 Verdict too late.** Trigger: referee acts at or after the deadline. Outcome: verdict controls are not offered once chain time reaches the deadline; if a transaction was sent just before and mined after, the contract rejects it and the page explains that the deadline passed. HLR-003, HLR-004, HLR-017, HLR-024.

**UJ-33 Second verdict.** Trigger: referee tries to change a recorded verdict. Outcome: impossible; controls absent; contract rejects. HLR-003.

**UJ-34 Deadline approaching.** Trigger: under 10 minutes remain and no verdict. Outcome: warning shown to the referee and the staker. HLR-022.

## E. Settlement

**UJ-40 Staker withdraws a kept stake.** Trigger: status Kept. Outcome: full stake transferred to the staker; status Settled to staker. HLR-005.

**UJ-41 Beneficiary claims a broken stake.** Trigger: status Broken. Outcome: full stake to the beneficiary; status Settled to beneficiary. HLR-005.

**UJ-42 Beneficiary claims an expired stake (demo climax).** Trigger: deadline passed with no verdict. Outcome: full stake to the beneficiary. HLR-004, HLR-005.

**UJ-43 Anyone triggers settlement.** Trigger: a visitor or any party taps settle on a settleable pledge. Outcome: funds go to the rightful party only. HLR-006, HLR-005.

**UJ-44 Settlement too early.** Trigger: pledge Active and deadline not reached. Outcome: no settle control; contract rejects a direct call. HLR-005, HLR-024.

**UJ-45 Settlement twice.** Outcome: second attempt rejected; no funds move. HLR-005.

**UJ-46 Recipient blocklisted by the issuer.** Trigger: settlement transfer reverts. Outcome: pledge state unchanged and still settleable later; all other pledges unaffected; page explains the token issuer blocked the transfer. HLR-011, HLR-012, HLR-024.

**UJ-47 Token paused by the issuer.** Trigger: create or settle reverts during a pause. Outcome: no state change; plain explanation; retry possible after unpause. HLR-012, HLR-024.

## F. Staker attempts to escape

**UJ-50 Withdraw before a verdict.** Outcome: rejected. HLR-005, HLR-007.
**UJ-51 Cancel, reduce, extend, or redirect.** Outcome: no such function exists. HLR-007, HLR-010.
**UJ-52 Name self as referee or beneficiary.** Outcome: rejected at creation. HLR-008.

## G. Adversary

**UJ-60 Stranger records a verdict.** Outcome: rejected. HLR-003.
**UJ-61 Pledge with an unlisted token.** Outcome: rejected. HLR-009.
**UJ-62 Re-entrancy through a token callback.** Outcome: impossible by allowlist and guarded regardless. HLR-009, HLR-015.
**UJ-63 Tokens sent directly to the contract.** Outcome: pledge accounting unaffected; the tokens are unrecoverable. HLR-015, HLR-027.
**UJ-64 Index flooding.** Trigger: adversary creates many pledges naming a victim as referee or beneficiary. Outcome: costs the adversary a stake per pledge; victim's list stays usable through paging. HLR-014.
**UJ-65 Dishonest referee.** Trigger: referee marks a kept promise broken. Outcome: permitted by design; the trust statement at creation discloses it. HLR-027.
**UJ-66 Look-alike site.** Outcome: out of scope for the contract; the README and site display the canonical contract address. HLR-034.

## H. Grant reviewer

**UJ-70 Evaluate the submission.** Trigger: opens the DoraHacks entry. Flow: reads the description; opens the live site; sees seeded mainnet pledges in each outcome; opens the Sourcify and explorer links; skims the README, the state diagram, and the traceability summary; watches the 90-second video. Outcome: can confirm it is real, on mainnet, verified, and Arc-specific, without a wallet. HLR-020, HLR-031, HLR-033, HLR-034.

**UJ-71 Reviewer tries it with a wallet.** Trigger: reviewer holds USDC on Arc. Outcome: completes UJ-10 or UJ-11 with a small amount. HLR-001, HLR-021.

## I. Operator

**UJ-80 Deploy to testnet.** Outcome: reproducible deployment from config, recorded in the repo. HLR-030, HLR-032.
**UJ-81 Run the end-to-end suite on testnet.** Outcome: journeys B, D, E exercised against the real network with real tokens. HLR-040.
**UJ-82 Deploy to mainnet.** Trigger: checkpoint C3; Liam unlocks the keystore. Outcome: deployed with the confirmed allowlist. HLR-030.
**UJ-83 Verify source.** Outcome: Sourcify perfect match; explorer shows verified, manually if needed. HLR-031.
**UJ-84 Publish the frontend.** Outcome: static site on GitHub Pages pointing at mainnet. HLR-030.
**UJ-85 Seed demo pledges.** Outcome: mainnet holds one pledge settled to a staker, one expired and settled to a beneficiary, one broken and settled, and one Active through the review period. HLR-033.
**UJ-86 Defect found after mainnet deploy.** Outcome: a new instance is deployed and the frontend repointed; the old instance stays callable and its pledges remain settleable directly. HLR-010, HLR-032.

## J. Network

**UJ-90 Lagging RPC backend.** Trigger: `-32014` or a transient network error. Outcome: retried transparently. HLR-029.
**UJ-91 Primary RPC unavailable.** Outcome: next configured endpoint used. HLR-029.
**UJ-92 Explorer unavailable or gated.** Outcome: every link has a copyable hash beside it. HLR-029, HLR-024.
**UJ-93 RPC reports a different chain.** Outcome: writes disabled; visible error. HLR-025, HLR-029.
