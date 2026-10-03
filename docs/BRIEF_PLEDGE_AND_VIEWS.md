# Design brief: "FE pledge page and other views"

Written by the lead before any code, per the workflow decision of 2026-10-03 (CLAUDE.md status log). The implementers build to this brief and do not invent user-facing copy. If a string or an interaction is missing here, they stop and ask the lead rather than writing one. Requirement text in `docs/05_LLR.md` wins over this brief; the brief only fixes the choices the requirements leave open.

Requirements covered: LLR-FE-040 to 044, 046, 050, 070, 071, and the clock tick that LLR-FE-012 needs for the countdown. 05 v1.17 adds LLR-FE-046 and extends LLR-FE-050; both came out of writing this brief.

## 0. Writing and interaction rules for every view

- Strings below are exact. Quotes mark the string; do not add punctuation or ellipses.
- No em dash (U+2014) anywhere, and none of the words LLR-FE-071 bans.
- Shortened address or hash: first 6 and last 4 characters, joined by an ellipsis character `…` (U+2026), for example `0x3Ae2…Cac4`. The full value is always the copy value and the `title`.
- Amounts: `formatUnits(amount, decimals)` with the token's configured decimals, then a space and the symbol: `5 USDC`, `0.0001 cirBTC`. For cirBTC, follow with ` (10,000 sats)` using `formatSats` from `app/src/format.ts` (LLR-FE-045). A pledge token that matches no configured token cannot occur with the allowlist; if it does, show `<raw integer> units of 0x…` with the token shortened.
- Local date and time: `Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })` in the visitor's time zone, for example `Oct 5, 2026, 3:30 PM GMT+2`. If the create form already has a formatter, reuse it.
- Every address and transaction hash shown is a `HashValue`: the shortened value in a monospace span, a "Copy" button, and a "View on explorer" link. Address links open in the same tab with `rel="noreferrer"`; transaction links open in a new tab with `rel="noopener noreferrer"`, so a pending request's progress is not lost. At 360 px the controls wrap below the value. After copy, a status element beside it says "Copied." or "Could not copy." (same pattern as `CopyLink`). Explorer URLs: `<explorerUrl>/address/<address>` and `<explorerUrl>/tx/<hash>`. The copy button's accessible name names what it copies: "Copy the referee's address", "Copy the transaction hash", "Copy the contract address". The explorer link's accessible name does the same: "View the staker on the explorer", "View the transaction on the explorer", "View the contract on the explorer".
- Focus: a control removed because its request succeeded hands focus to the text that replaced it (LLR-FE-072). Route changes already move focus to the main heading.
- Live regions: a status element is in the page from the first render and filled later. The per-second countdown is never inside a live region. Text that receives focus is not also a live region, so it is not read twice.
- Warning and error colours: measure their text and border contrast in both schemes and record it in the TDD log (LLR-FE-072).

## 1. Shared parts (built first, by one implementer, before the split)

| Part | Where | What |
|---|---|---|
| `formatAmount(network, token, amount)` | `app/src/format.ts` | The amount rule above |
| `formatLocalTime(seconds)` | `app/src/format.ts` | The date rule above |
| `shorten(hex)` | `app/src/format.ts` | The shortening rule above (reuse `wallet/address.ts` if it already does this) |
| `roleOf(pledge, account)` | `app/src/views/roles.ts` | `"staker" \| "referee" \| "beneficiary" \| null`, case-insensitive address compare. The contract forbids overlap, so at most one role |
| `ROLE_NAMES` | same | `staker: "Staker"`, `referee: "Referee"`, `beneficiary: "Beneficiary"` |
| `STATE_NAMES`, `STATE_MEANINGS` | `app/src/views/stateLabels.ts` | Tables below. The tag moves from LLR-FE-011 to LLR-FE-040 |
| `HashValue` | `app/src/views/HashValue.tsx` | The copy and explorer control above |
| Section 2.2 message for `SafeERC20FailedOperation` | `app/src/chain/errors.ts` | Now "The token refused the transfer. Nothing changed. You can try again later." (05 v1.17), since a settle can raise it and nothing is locked there |

State names (short, for lists and badges):

| State | Name |
|---|---|
| Active | "Active" |
| Expired | "Expired" |
| Kept | "Kept" |
| Broken | "Broken" |
| SettledToStaker | "Settled to staker" |
| SettledToBeneficiary | "Settled to beneficiary" |

State meanings (the pledge page's status line):

| State | Meaning |
|---|---|
| Active | "Active. Waiting for the referee's verdict." |
| Active, chain time at or past the deadline | "The deadline has passed. Updating the status from the network." |
| Expired | "Expired. The deadline passed with no verdict. The stake can now be sent to the beneficiary." |
| Kept | "Kept. The referee confirmed the promise. The stake can now be returned to the staker." |
| Broken | "Broken. The referee marked the promise broken. The stake can now be sent to the beneficiary." |
| SettledToStaker | "Settled. The stake was returned to the staker." |
| SettledToBeneficiary | "Settled. The stake was sent to the beneficiary." |

## 2. Pledge page `#/p/:id` (implementer A)

Requirements: LLR-FE-040, 041, 042, 043, 044, 046, the clock tick. Keep `PledgeView`'s existing reading, polling, not-found, and retry behaviour (LLR-FE-011, 013) as it is.

### 2.1 Wireframe (1440 px; at 360 px the definition list stacks label over value)

```
Pledge #12                                          [ You are the referee ]
  Run 5 km every week until December.            (promise, the largest text after the heading)
[Active] Waiting for the referee's verdict.       (status, live; state name as a coloured badge)

  Stake         0.0001 cirBTC (10,000 sats)
  Deadline      Oct 5, 2026, 3:30 PM GMT+2
  Time left     2 days 4 hours
  Staker        0x12ab…cd34   Copy   View on explorer
  Referee       0x98fe…7a10   Copy   View on explorer   (you)
  Beneficiary   0x5c3d…0b2e   Copy   View on explorer

  ┌ warning (LLR-FE-043, only when it applies) ─────────────────────┐
  └─────────────────────────────────────────────────────────────────┘

  Did the staker keep this promise?                    (actions, LLR-FE-042)
  [ Kept ]  [ Broken ]
  Your verdict is final. Record it before the deadline, or the stake goes to the beneficiary.

  (transaction progress and result, LLR-FE-046)

  [CopyLink, only for the pledge just created]
  (polling error, existing)
```

- The promise is the main element: directly under the heading, larger than body text. The state name is a badge coloured by state, whose text carries the meaning (colour is never the only cue); the rest of the meaning sentence follows it.
- The promise is shown as written: line breaks kept (`white-space: pre-wrap`), long words wrap (`overflow-wrap: anywhere`), and it is plain text, never HTML.
- Labels in the list: "Stake", "Deadline", "Time left", "Staker", "Referee", "Beneficiary".
- Until the pledge is read, the page shows only the heading and the existing reading message.

### 2.2 Role (LLR-FE-041)

When the connected account has a role: a badge beside the heading, "You are the staker", "You are the referee", or "You are the beneficiary", and " (you)" after that party's row. Nothing when there is no role or no wallet.

### 2.3 Countdown (LLR-FE-012)

A tick re-renders the countdown every second from `clock.now()`. Text of the "Time left" value, from `remaining = deadline - chainTime` in seconds:

| Remaining | Text |
|---|---|
| clock not yet synced | "Reading the time from the network" |
| at least 1 day | "D days H hours" |
| at least 1 hour | "H hours M minutes" |
| at least 1 minute | "M minutes S seconds" |
| 1 to 59 seconds | "S seconds" |
| 0 or less | "Deadline passed" |

Use the singular for 1 ("1 day", "1 hour", "1 minute", "1 second"). The "Time left" row is shown only while the state is Active or Expired (Expired always reads "Deadline passed"). Kept, Broken and settled pledges show the Deadline row only, since nothing is waiting on time.

### 2.4 Actions (LLR-FE-042, section 2.1 matrix)

The matrix labels are exact. "Kept" and "Broken" are hidden once chain time reaches the deadline, whatever the last poll said. Settle buttons call `settle(id)`.

| Case | Shows |
|---|---|
| No wallet, matrix says "Connect a wallet to act" or "Connect a wallet to settle" | That sentence as a paragraph, with a full stop. No button |
| Wallet connecting or reconnecting, matrix offers something | "Waiting for your wallet to connect." No button |
| Staker, Active, before the deadline | No button. The hint "Your referee must mark this promise kept before the deadline." |
| Referee, Active, before the deadline | Group heading "Did the staker keep this promise?", buttons "Kept" and "Broken", then "Your verdict is final. Record it before the deadline, or the stake goes to the beneficiary." |
| A settle label applies | The one button, then: "Anyone can send this. The full stake goes only to the staker." or "Anyone can send this. The full stake goes only to the beneficiary.", matching where the state sends it |
| Matrix says none | Nothing |
| A wallet is connected, the matrix offers a button, but `useWriteGate` is not enabled | The button, disabled, with the gate's reasons listed under it (same as the create form) |

Every write uses `useWriteGate(health.network, network)`, passes `chainId: network.chainId`, and waits with `receiptOf` from `create/flow.ts`.

### 2.5 Broken confirmation (LLR-FE-044)

A native `<dialog>` opened with `showModal()` when "Broken" is activated:

- Heading: "Mark this promise broken?"
- Body: "The stake of <amount> will go to the beneficiary, <shortened beneficiary>. Your verdict cannot be changed."
- Buttons, in this order: "Cancel", "Mark it broken". Focus starts on "Cancel". Escape cancels.
- The dialog is labelled by its heading and described by its body (`aria-labelledby`, `aria-describedby`).
- Cancel closes and returns focus to "Broken", in code rather than through browser behaviour. "Mark it broken" closes the dialog and sends `markBroken(id)`.
- If chain time reaches the deadline or the polled state leaves Active while the dialog is open, it closes, sends nothing, and focus moves to the status line (`tabindex="-1"`).

"Kept" sends `markKept(id)` with no dialog.

### 2.6 Transaction progress and result (LLR-FE-046)

One region under the actions, a status element present from the first render. Every action control on the page is disabled from the click until the request ends.

| Moment | Text |
|---|---|
| Waiting for the wallet | "Confirm in your wallet." |
| Hash returned, waiting for the receipt | "Waiting for the network to confirm." then the transaction `HashValue` |
| Verdict confirmed | "You marked this promise kept." or "You marked this promise broken." with the hash |
| Settle confirmed | "Done. The stake was sent to the staker." or "... to the beneficiary." with the hash |
| Reverted, before or after sending | The section 2.2 message for the error, error style, with the hash if there is one |
| Wallet rejection | The LLR-FE-061 neutral message |
| Any other failure | The LLR-FE-062 general message with its copy control |
| No receipt within 3 minutes, or the receipt read failed | "Your transaction was sent, but its confirmation could not be read. This page shows the change as soon as the network does." with the hash |

On click, focus moves to the progress element (`tabindex="-1"`), since the button that had it is disabled; the progress element is then not a live region. A confirmed receipt starts a re-read of the state at once instead of waiting for the next poll, and focus moves to the success text. After a failure, focus stays on the progress element, which now holds the failure.

Lifetimes: the LLR-FE-061 and LLR-FE-062 general messages are removed on a new request or when the connection's state, account, or chain changes. The success, revert, and unconfirmed texts stay until the next request or until the page is left. After a failed or unconfirmed request, the actions come back as the polled state allows, so the user can try again.

### 2.7 Deadline warning (LLR-FE-043)

Shown when the state is Active, chain time is before the deadline, fewer than 600 seconds remain, and the connected account is the staker or the referee. Warning style, inside a status element present from the first render, so it is announced once when it appears.

- Referee: "Less than 10 minutes left. If you do not record a verdict before the deadline, the stake goes to the beneficiary."
- Staker: "Less than 10 minutes left. If your referee does not mark this promise kept before the deadline, your stake goes to the beneficiary."

## 3. Home `#/` (implementer B)

Requirement: LLR-FE-070. Document title "SatStake".

```
Lock Bitcoin against a promise.                                     (h1)
Keep it and you get your sats back. Miss it and they go to someone else.

[ Create a pledge ]      See an example pledge

How it works                                                        (h2)
 1  Write a promise and lock a stake.
    Choose cirBTC (Circle's Bitcoin-backed token on Arc) or USDC, name a referee you trust, and pick a deadline.
 2  Your referee decides.
    Before the deadline, they mark the promise kept or broken. No one else can.
 3  Anyone sends the stake on.
    Once the referee rules or the deadline passes, anyone can send it: back to you if kept, to the beneficiary you named if broken or not confirmed in time.

Live on Arc Testnet                                                 (h2, network name from config)
  Network          Arc Testnet, chain 5042002
  Contract         0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4  Copy  View on explorer
  Source code      Verified on Sourcify
  Pledges created  12
  Arc settles each transaction with deterministic, sub-second finality. Network fees are paid in USDC. SatStake charges none.
```

- The three sentences of NS section 1 are exact and in order; the test checks them verbatim.
- "Create a pledge" is a link styled as the primary button, to `#/create`. "See an example pledge" links to `#/p/<examplePledgeId>`.
- The contract address is shown in full here, in a monospace block with `overflow-wrap: anywhere` (UJ-66: a visitor compares the canonical address), with the `HashValue` controls beside it.
- "Verified on Sourcify" links to `https://repo.sourcify.dev/<chainId>/<contract>`.
- "Pledges created" is `pledgeCount()`, read when the view opens. Before it answers: "Reading". On failure: "Not available right now", retried every 30 seconds.

## 4. About `#/about` (implementer B)

Requirement: LLR-FE-071. Document title "About SatStake".

```
About SatStake                                                      (h1)
SatStake is a smart contract on Arc and this website, which reads and uses it. You lock a stake against a promise, and a referee you choose decides whether you kept it.

What you are trusting                                               (h2)
Your referee. The referee alone decides. A dishonest referee can mark a kept promise broken. If your referee does not mark the promise kept before the deadline, the stake goes to the beneficiary, even if you kept it. SatStake only stops you from being your own referee or beneficiary, and stops the referee from also being the beneficiary.
The token issuer. Circle can pause cirBTC or USDC, or block an address. While a token is paused, pledges in it cannot be created or settled. If the person receiving a stake is blocked, that stake stays locked until the block is lifted. Other pledges are not affected.

Limits to know                                                      (h2)
Tokens sent straight to the contract, outside a pledge, cannot be recovered. There is no function to sweep them.
If the beneficiary address belongs to no one, the stake of a broken or expired pledge is lost for good. Check the address before you create a pledge.
SatStake is tested, not formally verified, and has not been audited.

What SatStake cannot do                                             (h2)
SatStake itself has no owner, admin, fee, pause, or upgrade function. After a pledge is created, no one can cancel it, change its amount, move its deadline, or change who receives the stake. The token issuer's powers above still apply.
```

Each lead phrase ("Your referee.", "The token issuer.") is bold. The LLR-FE-071 test scans every user-facing string in `app/src` (string literals and JSX text), not only this view.

## 5. My pledges `#/mine` (implementer B)

Requirement: LLR-FE-050 (05 v1.17). Document title "My pledges | SatStake". Reads go through the configured chain's client, so the list works whatever chain the wallet is on.

| Situation | Shows |
|---|---|
| No wallet | "Connect a wallet to see the pledges you take part in." |
| Wallet connecting or reconnecting | "Waiting for your wallet to connect." |
| Reading | "Reading your pledges from the network." |
| Read failed | "Could not read your pledges. The site keeps trying while this page is open." Retried every 5 seconds |
| No pledges | "No pledges name this account yet." then a link "Create a pledge" to `#/create` |
| Pledges | The list below |

```
My pledges                                                          (h1)
You take part in 45 pledges. Newest first.                          (singular: "1 pledge")

┌ Pledge #45                                     You are the referee · Active ┐
│ Run 5 km every week until December.                     (two lines at most)  │
│ 0.0001 cirBTC (10,000 sats) · Deadline Oct 5, 2026, 3:30 PM GMT+2           │
└──────────────────────────────────────────────────────────────────────────────┘
  ... 20 per page

Showing 1 to 20 of 45                         [ Newer ]  [ Older ]
```

- Each card is one link to `#/p/<id>`. Role text from `ROLE_NAMES` as "You are the <role, lower case>", state from `STATE_NAMES`.
- Newest first: with `count` from `pledgeCountOf`, page `p` (from 0) covers `end = count - 20p`, `offset = max(0, end - 20)`, `limit = end - offset`; read `pledgeIdsOf(account, offset, limit)` and reverse it. Each card reads `getPledge` and `stateOf` for its id.
- "Newer" is disabled on the first page, "Older" on the last. While a new page is read, the pager stays and the cards are replaced by "Reading your pledges from the network." After paging, focus moves to the "Showing" line (`tabindex="-1"`, not a live region; the list area's status element announces the reading and the result). The pager is hidden when there is one page.
- A change of connected account goes back to the first page and reads again. The list is read when the view opens and is not polled.
- A card whose reads fail shows "Pledge #<id>" and "Could not read this pledge." and still links to it.

## 6. Who builds what

| Step | Who | Files | Mutation numbers |
|---|---|---|---|
| Shared parts (section 1) | Implementer S | `format.ts`, `views/roles.ts`, `views/stateLabels.ts`, `views/HashValue.tsx` | 830 to 859 |
| Pledge page (section 2) | Implementer A, worktree A | `views/PledgeView.tsx`, new files under `views/pledge/`, `chain/` tick hook | 860 to 929 |
| Home, about, mine (sections 3 to 5) | Implementer B, worktree B | `views/Views.tsx` split into `HomeView.tsx`, `AboutView.tsx`, `MineView.tsx` | 930 to 979 |

Both A and B may need to touch `App.tsx` (passing props) and `styles.css`. Keep `App.tsx` changes to the route lines; in `styles.css`, add rules at the end under a comment naming the view. The lead merges.

## 7. Brief review

The frontend reviewer (Opus) checked this brief before any code: 1 High, 8 Medium, 8 Low, all applied above, except that the wallet notice sitting above the home hero belongs to the shared wallet bar of an earlier group and goes to the pre-release sweep in `docs/INSPECTIONS.md`.
