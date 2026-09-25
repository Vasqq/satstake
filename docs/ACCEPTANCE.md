# Acceptance

LLR-VV-009. One row per journey in `03_USER_JOURNEYS.md`: who acts, the expected outcome, how it is verified, and the result. A journey passes only when every listed verification has passed. Journeys that need a person with a wallet in a browser are verified twice: by automated tests of the logic, and by a step in `docs/WALKTHROUGH.md` on the mainnet site.

Verification keys: **Unit** Foundry tests of the contract; **Inv** invariant tests; **E2E** live testnet script (`e2e/`, evidence in `docs/evidence/`); **FE** Vitest tests of the application logic; **WT** walkthrough step on mainnet; **Evid** deployment or inspection record. Test names are filled in as each group lands.

| Journey | Actor | Expected outcome | Verification | Result | Date |
|---|---|---|---|---|---|
| UJ-01 | Visitor | Understands the product from the home view and an example pledge without a wallet | FE; WT | Pending | |
| UJ-02 | Staker | Connects a wallet; no wallet keeps read-only mode; a rejected connection returns to the prior state without error styling | FE; WT | Pending | |
| UJ-03 | Staker | Writes disabled on the wrong chain; switch or add Arc enables them; declining keeps them disabled with a reason | FE; WT | Pending | |
| UJ-04 | Staker | Zero balance blocks submission with an explanation and no wallet prompt | FE; WT | Pending | |
| UJ-10 | Staker | cirBTC pledge created Active; staker lands on its share page with a copy-link control | Unit; E2E; FE; WT | Pending | |
| UJ-11 | Staker | USDC pledge created through the ERC-20 interface, same outcome as UJ-10 | Unit; E2E; FE; WT | Pending | |
| UJ-12 | Staker | Each invalid input shows an inline message, submit stays disabled, no wallet prompt | Unit; FE | Pending | |
| UJ-13 | Staker | Sufficient allowance skips approval; one wallet prompt | FE; WT | Pending | |
| UJ-14 | Staker | Rejected prompt keeps form values, shows a neutral message, changes nothing beyond a completed approval | FE; WT | Pending | |
| UJ-15 | Staker | Creation revert after approval is explained; exact allowance remains; retry needs one prompt | Unit; FE | Pending | |
| UJ-16 | Staker | Repeated submit while pending is ignored; exactly one creation | FE | Pending | |
| UJ-17 | Staker | Contract address as a party shows a warning; creation still allowed | FE | Pending | |
| UJ-18 | Staker | Acknowledgement of beneficiary irrecoverability required before submission | FE; WT | Pending | |
| UJ-20 | Any person | Share page shows promise, stake, roles, local deadline, countdown, and status without a wallet | FE; WT | Pending | |
| UJ-21 | Any person | Unknown pledge shows a not-found view with a link home | Unit; FE; WT | Pending | |
| UJ-22 | Party | Connected party sees a role badge and only the actions valid for role and state | FE; WT | Pending | |
| UJ-23 | Party | My Pledges lists the account's pledges by role, newest first, paged | Unit; FE; WT | Pending | |
| UJ-24 | Any person | Page reflects a verdict, expiry, or settlement within one polling interval without reload | FE; WT | Pending | |
| UJ-25 | Any person | Countdown and button availability follow chain time despite a wrong device clock | FE | Pending | |
| UJ-30 | Referee | Kept before the deadline sets status Kept | Unit; E2E; WT | Pending | |
| UJ-31 | Referee | Broken before the deadline, after a confirmation dialog, sets status Broken | Unit; E2E; FE; WT | Pending | |
| UJ-32 | Referee | Verdict controls hidden at the deadline; a late transaction is rejected and explained | Unit; E2E; FE | Pending | |
| UJ-33 | Referee | A second verdict is impossible: controls absent, contract rejects | Unit; FE | Pending | |
| UJ-34 | Staker, referee | Under 10 minutes left with no verdict shows a warning | FE | Pending | |
| UJ-40 | Staker | Kept stake transferred in full to the staker; status Settled to staker | Unit; E2E; WT | Pending | |
| UJ-41 | Beneficiary | Broken stake transferred in full to the beneficiary; status Settled to beneficiary | Unit; E2E; Evid | Pending | |
| UJ-42 | Beneficiary | Expired stake transferred in full to the beneficiary | Unit; E2E; Evid; WT | Pending | |
| UJ-43 | Anyone | Settlement triggered by a third party pays only the rightful party | Unit; E2E | Pending | |
| UJ-44 | Anyone | No settle control before the deadline; a direct call is rejected | Unit; E2E; FE | Pending | |
| UJ-45 | Anyone | Second settlement rejected; no funds move | Unit; E2E | Pending | |
| UJ-46 | Issuer | Blocklisted recipient: pledge unchanged and settleable later; other pledges unaffected; page explains | Unit; Inv; FE | Pending | |
| UJ-47 | Issuer | Paused token: no state change; plain explanation; retry possible after unpause | Unit; FE | Pending | |
| UJ-50 | Staker | Withdrawal before a verdict rejected | Unit | Pending | |
| UJ-51 | Staker | No cancel, reduce, extend, or redirect function exists | Unit (ABI surface); Evid | Pending | |
| UJ-52 | Staker | Naming self as referee or beneficiary rejected at creation | Unit; FE | Pending | |
| UJ-60 | Adversary | Verdict by a stranger rejected | Unit | Pending | |
| UJ-61 | Adversary | Pledge in an unlisted token rejected | Unit | Pending | |
| UJ-62 | Adversary | Re-entrancy impossible by allowlist and guarded regardless | Unit; Inv; Evid | Pending | |
| UJ-63 | Adversary | Tokens sent directly leave pledge accounting unaffected and are unrecoverable | Unit; Inv | Pending | |
| UJ-64 | Adversary | Index flooding costs a stake per pledge; the victim's list stays usable through paging | Unit; FE | Pending | |
| UJ-65 | Referee | A dishonest verdict is permitted by design and disclosed at creation | FE; Evid | Pending | |
| UJ-66 | Adversary | README and site display the canonical contract address | Evid | Pending | |
| UJ-70 | Grant reviewer | Confirms the product is real, on mainnet, verified, and Arc-specific without a wallet | Evid; WT | Pending | |
| UJ-71 | Grant reviewer | Completes UJ-10 or UJ-11 with a small amount | WT | Pending | |
| UJ-80 | Operator | Testnet deployment reproducible from config and recorded | Evid | Pending | |
| UJ-81 | Operator | Journeys B, D, and E exercised on testnet with real tokens | E2E | Pending | |
| UJ-82 | Operator | Mainnet deployment with the confirmed allowlist | Evid | Pending | |
| UJ-83 | Operator | Sourcify perfect match; explorer shows verified | Evid | Pending | |
| UJ-84 | Operator | Static site on GitHub Pages pointing at mainnet | Evid; WT | Pending | |
| UJ-85 | Operator | Mainnet holds the four seeded pledges in their target states | Evid; WT | Pending | |
| UJ-86 | Operator | After a defect, a new instance is deployed and the old one stays settleable | Unit (ABI surface); Evid | Pending | |
| UJ-90 | Network | `-32014` and transient errors retried transparently | FE | Pending | |
| UJ-91 | Network | Next configured RPC endpoint used when the primary fails | FE | Pending | |
| UJ-92 | Network | Every explorer link has a copyable hash beside it | FE; WT | Pending | |
| UJ-93 | Network | RPC reporting another chain disables writes with a visible error | FE | Pending | |
