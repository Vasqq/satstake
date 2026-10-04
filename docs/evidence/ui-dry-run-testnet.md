# UI dry run on Arc testnet

Date: 2026-10-04. Site: https://vasqq.github.io/satstake/ (the testnet build). Chain 5042002, contract `0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4`.

Repository commit: `e76f8c4`, the HEAD of the working branch when this ran. The Pages run that published the site is not available from this branch, so this is the closest record of what was deployed, not a proof of it.

The run drives the real site in a Chromium browser through an injected wallet (EIP-6963, name "Dry run wallet") whose requests are answered by a script holding the keys. Every action below was done by clicking and typing in the page. Screenshots are 1440 px wide, full page, in the gitignored `cache/dry-run/`; they are named per step below.

Result: 20 of 20 journeys passed.

| Journey | Title | Result |
|---|---|---|
| UJ-01 | Home page and the example pledge link | Pass |
| UJ-21 | Unknown pledge | Pass |
| UJ-02 | Connect a wallet | Pass |
| UJ-03 | Wrong network, then switch | Pass |
| UJ-12 | Invalid inputs show inline errors and submit stays disabled | Pass |
| UJ-10 | Create a cirBTC pledge (approval then creation) | Pass |
| UJ-11 | Create a USDC pledge | Pass |
| UJ-13 | USDC pledge with the allowance already sufficient | Pass |
| UJ-34 | Under-10-minutes warning for the staker and the referee | Pass |
| UJ-20 | Pledge page as each role: badge and action matrix | Pass |
| UJ-22 | Pledge page for a visitor and an unrelated account | Pass |
| UJ-44 | No settle control before the deadline | Pass |
| UJ-30 | Referee marks Kept | Pass |
| UJ-24 | Another session's change reaches an open page within a poll | Pass |
| UJ-40 | Staker withdraws after Kept | Pass |
| UJ-42 | Two-minute pledge expires with no verdict | Pass |
| UJ-31 | Referee marks Broken through the confirmation dialog | Pass |
| UJ-41 | Beneficiary claims a broken stake | Pass |
| UJ-23 | My pledges lists the new pledges newest first with roles | Pass |
| UJ-92 | Every hash and address shown has copy and explorer controls | Pass |

## Journeys

### UJ-01 Home page and the example pledge link: Pass

- Heading, lead sentence, three steps, the full contract address, the Sourcify link and a pledge count are shown with no wallet.
- The example link opened pledge #1 (state badge: Settled to beneficiary), with no wallet.

Screenshots: `01-visitor-home.png`, `02-visitor-example-pledge.png`

### UJ-21 Unknown pledge: Pass

- The page says "This pledge does not exist. Check the link." with a link home.
- An unknown route says "This page does not exist."

Screenshots: `03-visitor-unknown-pledge.png`

### UJ-02 Connect a wallet: Pass

- Before any click the page sent only: eth_accounts. No account request.
- Connect Dry run wallet showed the connected address and the network name.

Screenshots: `04-connect-before-connect.png`, `05-connect-connected.png`

### UJ-03 Wrong network, then switch: Pass

- Create page reasons while on chain 1: Your wallet is on another network. Switch to Arc Testnet. Still to complete: Promise, Amount, Referee address, Beneficiary address, Deadline, the box confirming you understand.
- The Switch to Arc Testnet button asked the wallet to switch; the status then read connected on Arc Testnet.

Screenshots: `06-staker-wrong-network.png`, `07-staker-switched.png`

### UJ-12 Invalid inputs show inline errors and submit stays disabled: Pass

- Activating submit on an empty form listed the faults: "Write the promise you are making.", "Choose a deadline.", "Tick the box to confirm you understand." and a "Still to complete" line.
- Referee address = "abc": "Enter the referee's address: 0x followed by 40 letters and digits."
- Referee address = 42 characters: "Enter a valid address for the referee and the beneficiary."
- Referee address = 42 characters: "You cannot be your own referee or beneficiary."
- Amount = "0": "Enter an amount above zero."
- Amount = "abc": "Use digits and at most one decimal point."
- Amount = "0.123456789": "cirBTC has 8 decimal places. Remove the extra digits."
- Amount = "1000000": balance is less than this amount
- Promise = 300 characters: "Shorten the promise to 280 bytes or fewer."
- Same referee and beneficiary: "The referee and the beneficiary must be different people."
- A custom deadline a day in the past: "The deadline must be at least 90 seconds from now. Pick a later time."
- Submit stayed aria-disabled throughout.

Screenshots: `08-staker-empty-form.png`, `09-staker-invalid-inputs.png`

### UJ-10 Create a cirBTC pledge (approval then creation): Pass

- Progress texts seen: Step 1 of 2: let SatStake take 0.0000001 cirBTC. Confirm in your wallet. | Step 2 of 2: create the pledge. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.0000001 cirBTC. Waiting for the network to confirm. | Step 2 of 2: create the pledge. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.0000001 cirBTC. Done. | Step 2 of 2: create the pledge. Confirm in your wallet. ;; Step 1 of 2: let SatStake take 0.0000001 cirBTC. Done. | Step 2 of 2: create the pledge. Waiting for the network to confirm.
- Landed on #/p/26.
- Copy link put https://vasqq.github.io/satstake/#/p/26 on the clipboard.
- On chain: staker, token, amount, referee, beneficiary, a deadline of about one day and the promise text match; state Active.

Transactions:

- staker approve: [`0xa213868b4d9e66fe2f82feeb829bdb73af913a37f1cea50f5bbacb49718c824c`](https://explorer.testnet.arc.io/tx/0xa213868b4d9e66fe2f82feeb829bdb73af913a37f1cea50f5bbacb49718c824c)
- staker createPledge: [`0x1089444d9f89be31c5e84060b115b0947d7309ebc9d95b8b689647a0b40f9358`](https://explorer.testnet.arc.io/tx/0x1089444d9f89be31c5e84060b115b0947d7309ebc9d95b8b689647a0b40f9358)

Screenshots: `10-staker-cirbtc-kept-form-filled.png`, `11-staker-cirbtc-kept-progress.png`, `12-staker-cirbtc-created.png`, `13-staker-cirbtc-link-copied.png`

### UJ-11 Create a USDC pledge: Pass

- Progress texts seen: Step 1 of 2: let SatStake take 0.1 USDC. Confirm in your wallet. | Step 2 of 2: create the pledge. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.1 USDC. Waiting for the network to confirm. | Step 2 of 2: create the pledge. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the pledge. Confirm in your wallet. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the pledge. Waiting for the network to confirm.
- Landed on #/p/27; chain state matches.

Transactions:

- staker approve: [`0xb1b76af8dd10c25124b2dac1b13daeb511997301dde4b229ee4fa18e69fd44e6`](https://explorer.testnet.arc.io/tx/0xb1b76af8dd10c25124b2dac1b13daeb511997301dde4b229ee4fa18e69fd44e6)
- staker createPledge: [`0xaf56fe3b686ec01257a6dac45c8d4a91e1fcbb1d5d2fcdd9b443b105b73ecbd0`](https://explorer.testnet.arc.io/tx/0xaf56fe3b686ec01257a6dac45c8d4a91e1fcbb1d5d2fcdd9b443b105b73ecbd0)

Screenshots: `14-staker-usdc-broken-form-filled.png`, `15-staker-usdc-broken-progress.png`, `16-staker-usdc-created.png`

### UJ-13 USDC pledge with the allowance already sufficient: Pass

- The script approved exactly 0.1 USDC from the staker before opening the form, since the app never leaves an allowance behind.
- Progress texts seen: Create the pledge. Confirm in your wallet. ;; Create the pledge. Waiting for the network to confirm.
- With the allowance in place the flow showed a single unnumbered step, Create the pledge, and no approval.
- The contract spent the whole allowance; none is left.

Transactions:

- staker approve (script, before the form): [`0xfb74cabadff488138ee7232afd3c7181ff790d505ad9761a4d24c25ad454656a`](https://explorer.testnet.arc.io/tx/0xfb74cabadff488138ee7232afd3c7181ff790d505ad9761a4d24c25ad454656a)
- staker createPledge: [`0x602a4eb7e46458254b24f73f2d33cb66b88e52dd01daadb369a63abc5bbc42cd`](https://explorer.testnet.arc.io/tx/0x602a4eb7e46458254b24f73f2d33cb66b88e52dd01daadb369a63abc5bbc42cd)

Screenshots: `17-staker-usdc-two-minute-form-filled.png`, `18-staker-usdc-two-minute-progress.png`, `19-staker-two-minute-created.png`

### UJ-34 Under-10-minutes warning for the staker and the referee: Pass

- Staker page shows: Less than 10 minutes left. If your referee does not mark this promise kept before the deadline, your stake goes to the beneficiary.
- Referee page shows: Less than 10 minutes left. If you do not record a verdict before the deadline, the stake goes to the beneficiary.

Screenshots: `20-staker-two-minute-warning.png`, `21-referee-watch-two-minute-warning.png`

### UJ-20 Pledge page as each role: badge and action matrix: Pass

- Staker: badge "You are the staker", hint "Your referee must mark this promise kept before the deadline.", no verdict or settle control.
- Referee: badge "You are the referee", the question "Did the staker keep this promise?" with Kept and Broken, and no settle control.
- Beneficiary: badge "You are the beneficiary", no verdict or settle control, no deadline warning.

Screenshots: `22-referee-watch-verdict-controls.png`, `23-beneficiary-active.png`

### UJ-22 Pledge page for a visitor and an unrelated account: Pass

- Visitor with no wallet: full facts, no badge, no controls, "Connect a wallet to act."
- Unrelated connected account: no badge, no controls, no warning while Active.
- After accountsChanged to the staker, the badge read "You are the staker".
- After accountsChanged to the referee, the badge read "You are the referee".
- After accountsChanged to the beneficiary, the badge read "You are the beneficiary".
- After accountsChanged to an unrelated account, the badge went.

Screenshots: `24-visitor-two-minute-pledge.png`, `25-settler-two-minute-pledge.png`, `38-multi-role-switch.png`

### UJ-44 No settle control before the deadline: Pass

- With 115 s left on chain, none of the five pages (staker, referee, beneficiary, visitor, unrelated account) offered a settle control.

### UJ-30 Referee marks Kept: Pass

- The referee's page showed Confirm in your wallet, then the result "You marked this promise kept." with the transaction hash, a copy control and an explorer link; the verdict controls went.
- Chain state: Kept.

Transactions:

- referee markKept: [`0x1cb0fa05167e21974433501aa547ab15d68e45f5b80c77e0cf1eaa402ed3d663`](https://explorer.testnet.arc.io/tx/0x1cb0fa05167e21974433501aa547ab15d68e45f5b80c77e0cf1eaa402ed3d663)

Screenshots: `26-referee-kept-controls.png`, `27-referee-kept-confirming.png`, `28-referee-kept-done.png`

### UJ-24 Another session's change reaches an open page within a poll: Pass

- The staker's page, already open on the pledge, showed Kept 0.6 s after the referee's page confirmed (poll interval 4 s), with no reload.

Screenshots: `29-staker-followed-kept.png`

### UJ-40 Staker withdraws after Kept: Pass

- The staker pressed Withdraw my stake; the page said "Done. The stake was sent to the staker." and then showed Settled to staker. On chain the staker's cirBTC rose by exactly 10 sats.

Transactions:

- staker settle: [`0x2083ffb3cdc4d558d36f24f6b9c9a5a1343f98cb21c9525d283ff66f90db1b17`](https://explorer.testnet.arc.io/tx/0x2083ffb3cdc4d558d36f24f6b9c9a5a1343f98cb21c9525d283ff66f90db1b17)

Screenshots: `30-staker-withdrawn.png`

### UJ-42 Two-minute pledge expires with no verdict: Pass

- The deadline had not arrived when this step began; waiting for chain time.
- The referee's open page read Expired, showed Deadline passed, and no longer offered Kept or Broken.
- An unrelated account sent the expired stake; the beneficiary received exactly 0.1 USDC and the sender received no transfer.
- The referee's open page followed to Settled to beneficiary on its own, 1.5 s after the settler's page confirmed.

Transactions:

- settler settle: [`0xee27e9a79f479417940bbab01785e1e2bfa47265fee246e441f6c133a9c34d56`](https://explorer.testnet.arc.io/tx/0xee27e9a79f479417940bbab01785e1e2bfa47265fee246e441f6c133a9c34d56)

Screenshots: `31-referee-watch-expired.png`, `36-settler-expired-offer.png`, `37-settler-expired-settled.png`

### UJ-31 Referee marks Broken through the confirmation dialog: Pass

- The dialog said "Mark this promise broken?" with the amount and the beneficiary, and focus started on Cancel.
- Cancel closed it and sent nothing.
- Mark it broken sent one transaction; the page said "You marked this promise broken."; chain state Broken.

Transactions:

- referee markBroken: [`0xada5425bdad58a01a793a67178898a5c6461b50679311242aba914a7d0c089f9`](https://explorer.testnet.arc.io/tx/0xada5425bdad58a01a793a67178898a5c6461b50679311242aba914a7d0c089f9)

Screenshots: `32-referee-broken-dialog.png`, `33-referee-broken-done.png`

### UJ-41 Beneficiary claims a broken stake: Pass

- The beneficiary claimed; the receipt holds one Transfer of 0.1 USDC to the beneficiary; chain state SettledToBeneficiary.

Transactions:

- beneficiary settle: [`0x82046ef05de0ec990fd0f08167aaef38b2610b36f532cb1db73adad188278035`](https://explorer.testnet.arc.io/tx/0x82046ef05de0ec990fd0f08167aaef38b2610b36f532cb1db73adad188278035)

Screenshots: `34-beneficiary-claim-offered.png`, `35-beneficiary-claimed.png`

### UJ-23 My pledges lists the new pledges newest first with roles: Pass

The run drew deadlines in the machine's local zone (EDT). The two deadlines below are converted to UTC by hand (10:40 PM EDT on Oct 3 is 2:40 AM UTC on Oct 4); the dry run was not rerun, and the script now sets the browser zone to UTC.

- staker: 20 cards on the first page; all filled in after 0.5 s; 0 still empty, 0 saying "Could not read this pledge."
- staker: the list puts #28, #27, #26 in that order, newest first. Card for #28: Pledge #28 You are the staker · Settled to beneficiary UI dry run: USDC two-minute 0.1 USDC · Deadline Oct 4, 2026, 2:40 AM UTC
- beneficiary: 3 cards on the first page; all filled in after 0.0 s; 0 still empty, 0 saying "Could not read this pledge."
- beneficiary: the list puts #28, #27, #26 in that order, newest first. Card for #28: Pledge #28 You are the beneficiary · Settled to beneficiary UI dry run: USDC two-minute 0.1 USDC · Deadline Oct 4, 2026, 2:40 AM UTC

Screenshots: `39-staker-mine-as-first-drawn.png`, `40-staker-mine.png`, `41-beneficiary-mine-as-first-drawn.png`, `42-beneficiary-mine.png`

### UJ-92 Every hash and address shown has copy and explorer controls: Pass

- The pledge page shows 3 addresses (staker, referee, beneficiary); each has a Copy button and a link to https://explorer.testnet.arc.io/address/<address>.
- Copy on the referee's row put the full referee address on the clipboard and said Copied.
- The home page's contract address has the same two controls.
- Transaction hashes: the referee's result in UJ-30 showed its hash with a copy control and an explorer link (checked there against the hash the wallet sent).

Screenshots: `43-staker-hash-controls.png`

## Wallet requests and signing (LLR-FE-074)

The injected wallet refuses `personal_sign`, `eth_sign` and `eth_signTypedData*` and counts any such request. Count: 0.

Methods the site asked the wallet for, over all sessions:

- `eth_accounts`: 7
- `eth_chainId`: 28
- `eth_requestAccounts`: 7
- `eth_sendTransaction`: 10
- `wallet_requestPermissions`: 7
- `wallet_switchEthereumChain`: 1

## Accounts

- Staker (the testnet operator): `0x18648257045D8c323Cff1E4F80EeD22F157D8767`
- Referee (throwaway, generated in memory): `0xD55Aa2925FB4e626359774A3c53D5c446242d16f`
- Beneficiary (throwaway, generated in memory): `0x7116398A212e11bA5f178B52582629D55F5b41E5`
- Settler (throwaway, generated in memory): `0x6Cd88d6feD074168F8f851B266D0bce6F152AfD7`

## Pledges created

- #26: cirBTC, 10 sats, 1 day
- #27: USDC 0.1, 1 day
- #28: USDC 0.1, 2 minutes

## Funds

- Gas funding sent to the throwaway accounts: referee 0.0885225 USDC [`0x9dced189203dacb05bc9600f568ef1a866790924e6e3df627054f8772128d473`](https://explorer.testnet.arc.io/tx/0x9dced189203dacb05bc9600f568ef1a866790924e6e3df627054f8772128d473); beneficiary 0.0667725 USDC [`0xbe265afd6d1b98c67a304418eb71d88122fb5bdd74ef5f829abd57955b56e02e`](https://explorer.testnet.arc.io/tx/0xbe265afd6d1b98c67a304418eb71d88122fb5bdd74ef5f829abd57955b56e02e); settler 0.0667725 USDC [`0x43e3fb654dc91e5fdb07b9c6afc21f7d06ee53b268da24e9cf89635f69a3604e`](https://explorer.testnet.arc.io/tx/0x43e3fb654dc91e5fdb07b9c6afc21f7d06ee53b268da24e9cf89635f69a3604e).
- Operator before: 13.6255132699176 USDC, 1405 sats.
- Operator after the sweep: 13.5849613449176 USDC, 1405 sats.
- Net cost: 0.040551925 USDC (network fees; every stake returned to the operator, the beneficiary's receipts swept back), 0 sats.
- Sweep: completed.
  - referee returns its remaining USDC to the operator [`0x73c85a916cf93a84457ec9f1b9f7366c1d5cd2ffca1211c74c69240abff10517`](https://explorer.testnet.arc.io/tx/0x73c85a916cf93a84457ec9f1b9f7366c1d5cd2ffca1211c74c69240abff10517) (266700000000000 native units left, the unspent margin of the fee cap)
  - beneficiary returns its remaining USDC to the operator [`0x447b94cdf180a00c8d0c21f5fff8e9c37194224e3e8deb6b1c3e33bdc78374d1`](https://explorer.testnet.arc.io/tx/0x447b94cdf180a00c8d0c21f5fff8e9c37194224e3e8deb6b1c3e33bdc78374d1) (266700000000000 native units left, the unspent margin of the fee cap)
  - settler returns its remaining USDC to the operator [`0xd973d367d342c1a061788a2f8085f39a33533ae4d291cfd3d827846f1317382f`](https://explorer.testnet.arc.io/tx/0xd973d367d342c1a061788a2f8085f39a33533ae4d291cfd3d827846f1317382f) (266700000000000 native units left, the unspent margin of the fee cap)

## Runs

The script was run four times in a row on 2026-10-03 and 2026-10-04 while it was being made reliable; this record is the fourth and last, in which all 20 journeys passed on one run. Runs one to three each ended with every stake settled and the sweep complete, and left pledges #17 to #25 behind, all in a settled state; at the end of the fourth, `totalLocked` for USDC reads 0 and pledges #17 to #28 are all settled. Across the four runs the operator's balance fell from 13.7471690449176 to 13.5849613449176 USDC, a cost of 0.1622077 USDC in network fees, with the operator's 1,405 sats unchanged. Each run's throwaway accounts keep about 0.0002667 USDC of unspent fee margin that the sweep cannot move (the key is gone): about 0.0032 USDC stranded in total, in 12 addresses.

What the three earlier runs showed, which the last run does not repeat because the script was changed:

- Run one and run three each failed UJ-11 at the acknowledgement checkbox: Playwright's `check()` reported that clicking the checkbox did not change its state, on the USDC form opened straight after the cirBTC pledge. A script fallback created the pledge so the rest could run. The fourth run clicks the box directly and probes it before and after, and the click registered every time; the cause of the earlier miss is not identified. A layout shift while the balance hints load is one candidate (the script now waits for them), automation timing is another. It is recorded as unexplained, not as a defect.
- Run one failed UJ-42 on a check made before the referee's open page had polled, and run two failed UJ-23 on a check made before the cards had filled in; both were script timing and are fixed.

## Findings

- Low, UJ-23: My pledges draws up to 20 bare "Pledge #N" boxes first and fills them in over about half a second, because each card reads its pledge and its state as separate requests (about 40 reads for a full page). There is no loading text on a card. Screenshot: `39-staker-mine-as-first-drawn.png`.
- Low: one browser request in the staker session answered HTTP 429 at some point in the run (the console log does not say when or which). Every card still filled in, so the retry rule held. The My pledges burst is a candidate cause, not a confirmed one.
- Observation, LLR-FE-074: on connect the site sends `wallet_requestPermissions` as well as `eth_requestAccounts` (wagmi's injected connector). Neither is a message signature and the count of signing requests is 0, but the requirement's wording names connecting, switching and sending, so the lead may want the permission request named too.
- Limit of this evidence, UJ-13: the app's own flow never leaves an allowance behind, so the script granted exactly 0.1 USDC before the form opened; what is shown is the form's behaviour on a sufficient allowance, not a second pledge in a row.
- Limit of this evidence, UJ-92: the transaction-hash controls were checked only on the referee's Kept result (UJ-30), against the hash the wallet sent; the other actions' results were not each inspected.
- Limit of this evidence, UJ-20 and UJ-22: the split between the two journeys is the dry run's reading of the brief; the account-switch check (accountsChanged) sits under UJ-22.
- Limit of this evidence: the commit above is the working branch's HEAD, not the commit the Pages build used.
- Browser console errors and page errors seen (deduplicated):
  - staker: Failed to load resource: the server responded with a status of 429 ()
