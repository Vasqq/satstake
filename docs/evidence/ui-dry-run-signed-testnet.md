# UI dry run of the Signed frontend on Arc testnet

Date: 2026-10-12T22:14:26Z to 2026-10-12T22:17:17Z (UTC). Site: a local testnet build of this worktree served by `vite preview` at http://127.0.0.1:4173/; the published Pages site (mainnet) was not touched. Chain 5042002, contract `0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4`.

Build commit: `698f9c5` (branch `signed-frontend`). Uncommitted changes under app/src, app/index.html, app/vite.config.ts or deployments when the run started: yes (21 paths). The build was made with `npm run build:testnet` from that tree just before the run.

The run drives the real app in Chromium (Playwright) through an injected wallet (EIP-6963, name "Dry run wallet") whose requests are answered by a script holding the keys. Every action below was done by clicking and typing in the page; the script reads the chain only to check what the page showed. Screenshots are full page, in the gitignored `cache/dry-run-signed/`, named per step below; the 390 px and dark ones carry `phone` and `dark` in their names.

Result: 7 of 9 journeys passed.

| Journey | Title | Result |
|---|---|---|
| SG-a | No wallet: landing, a promise page read-only, unknown id | Pass |
| SG-b | Connect, wrong network, then switch | Pass |
| SG-c | Create a USDC promise on the New promise page; the signature and the panel | Pass |
| SG-d | Referee opens the share link: Kept, and Broken with the inline confirm | Pass |
| SG-f | Two-minute promise with no verdict reads No answer and pays the beneficiary | Fail |
| SG-e | Send payout: an unrelated account on Kept, the beneficiary on Broken | Pass |
| SG-h | 390 px wide and dark mode | Pass |
| SG-g | cirBTC promise of 100 sats from the New promise page | Pass |
| SG-i | Console errors and page errors across the run | Fail |

## Journeys

### SG-a No wallet: landing, a promise page read-only, unknown id: Pass

Time (UTC): 2026-10-12T22:14:32Z to 2026-10-12T22:15:04Z

- The landing reads with no wallet: the hero sentence "I promise to" with rotating examples, the lead sentence, the agreement, the full contract address, a Sourcify link and a promise count.
- The landing has no create form; Write your own links to the New promise page.
- The live promise (#1) opened with no wallet and shows its heading, "Done. The stake went to 0xd65D…3fB0.", the seven-line agreement with the three addresses, and the clock. Status line: "Paid out. The stake went to the person named to get it.". No Kept, Broken or Send payout control, no role badge.
- An unknown id shows the heading "Promise not found" and "This promise does not exist. Check the link.", with links home and to My promises.
- An unknown route shows "This page does not exist."

Screenshots: `01-visitor-landing.png`, `02-visitor-live-promise.png`, `03-visitor-unknown-promise.png`

### SG-b Connect, wrong network, then switch: Pass

Time (UTC): 2026-10-12T22:15:04Z to 2026-10-12T22:15:08Z

- Before any click the page sent only: eth_accounts. No account request.
- Beside Sign it while the wallet is on chain 1: Your wallet is on another network. Switch to Arc Testnet. Still to complete: Amount, Referee address, Beneficiary address, Deadline, the box confirming you understand.
- Switch to Arc Testnet asked the wallet to switch; the status then read connected on Arc Testnet and the wrong-network reason went.

Screenshots: `04-staker-before-connect.png`, `05-staker-wrong-network.png`, `06-staker-switched.png`

### SG-c Create a USDC promise on the New promise page; the signature and the panel: Pass

Time (UTC): 2026-10-12T22:15:08Z to 2026-10-12T22:15:17Z

- Sign it was labelled "Sign it with $0.10 in USDC". Progress texts seen: Step 1 of 2: let SatStake take 0.1 USDC. Confirm in your wallet. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.1 USDC. Waiting for the network to confirm. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the promise. Confirm in your wallet. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the promise. Waiting for the network to confirm. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the promise. Done.
- The wallet sent approve 0xc5cb6cdc14c16e5037c8398dad01884f56d867d68691ef4357c30cfab92deeba and then createPledge 0x5d70e73a3c98934eaafaae01a9633b8c5ca349bcb2e2637c7e8d24eae5908fa5.
- The signed panel shows the creation hash 0x5d70e73a3c98934eaafaae01a9633b8c5ca349bcb2e2637c7e8d24eae5908fa5, the same as the hash the wallet sent; its explorer link is https://explorer.testnet.arc.io/tx/0x5d70e73a3c98934eaafaae01a9633b8c5ca349bcb2e2637c7e8d24eae5908fa5.
- The panel's promise number is #36; the creation event says #36, and pledgeCount at the creation block is 36.
- The share link in the panel is http://127.0.0.1:4173/#/p/36. The stake-held line reads "after the referee rules or Oct 13, 2026, 10:15 PM UTC", the chain deadline.
- The pad shows "Signed: SatStake" only after the creation confirmed; it showed no signature while the wallet prompt was open.
- Copy the link to this promise put the share link on the clipboard.
- After signing, the Sign it control is gone and the signed panel holds focus.

Transactions:

- 2026-10-12T22:15:10Z staker approve: [`0xc5cb6cdc14c16e5037c8398dad01884f56d867d68691ef4357c30cfab92deeba`](https://explorer.testnet.arc.io/tx/0xc5cb6cdc14c16e5037c8398dad01884f56d867d68691ef4357c30cfab92deeba)
- 2026-10-12T22:15:13Z staker createPledge: [`0x5d70e73a3c98934eaafaae01a9633b8c5ca349bcb2e2637c7e8d24eae5908fa5`](https://explorer.testnet.arc.io/tx/0x5d70e73a3c98934eaafaae01a9633b8c5ca349bcb2e2637c7e8d24eae5908fa5)

Screenshots: `07-staker-usdc-kept-pad-filled.png`, `08-staker-usdc-kept-confirming.png`, `09-staker-usdc-kept-signed.png`, `10-staker-signed-after-copy.png`

### SG-d Referee opens the share link: Kept, and Broken with the inline confirm: Pass

Time (UTC): 2026-10-12T22:15:17Z to 2026-10-12T22:15:37Z

- The referee, opening the share link from the signed panel, sees the badge "You judge this promise", the question "Was this promise kept?" and the Kept and Broken buttons. Banner: "0x1864…8767 named you to judge this promise. Before Oct 13, 2026, 10:15 PM UTC, decide: was it kept? Your answer is final. The stake never passes through you. S"
- Kept sent one transaction (markKept); the page said "You marked this promise kept." with the same hash the wallet sent and an explorer link; chain state is Kept and the banner reads Kept.
- A second promise, #37, was made with Make another promise from the signed panel (creation 0xc20052f4b949e25a057a3b5b1348f1f4dfd8d807b02dca9b6feffb28418182c2). Its panel number matches the event and pledgeCount.
- Broken opened the inline confirm "Mark this promise broken?" under the ruling line with the amount and the beneficiary; focus started on Cancel; it is not a modal dialog.
- Cancel closed the confirm and sent no request to the wallet (eth_sendTransaction count unchanged); the promise stayed Active with Kept and Broken still offered.
- Mark it broken sent markBroken 0x825465c98fc0ac81667f614d3da714512b7bd00f7bb5e25507c4038e87932c2c; the page said "You marked this promise broken." with that hash; chain state is Broken.

Transactions:

- 2026-10-12T22:15:20Z referee markKept: [`0x0c4d5a7667d4b58a782cf8b55ffef42c2fca3f9a964895c29099adc2d348985b`](https://explorer.testnet.arc.io/tx/0x0c4d5a7667d4b58a782cf8b55ffef42c2fca3f9a964895c29099adc2d348985b)
- 2026-10-12T22:15:23Z staker approve: [`0x44d143deb1c79cfae2cee0cf11f66b1ac0f317d4cbf0e0117dae50a5e2eda829`](https://explorer.testnet.arc.io/tx/0x44d143deb1c79cfae2cee0cf11f66b1ac0f317d4cbf0e0117dae50a5e2eda829)
- 2026-10-12T22:15:26Z staker createPledge: [`0xc20052f4b949e25a057a3b5b1348f1f4dfd8d807b02dca9b6feffb28418182c2`](https://explorer.testnet.arc.io/tx/0xc20052f4b949e25a057a3b5b1348f1f4dfd8d807b02dca9b6feffb28418182c2)
- 2026-10-12T22:15:34Z referee markBroken: [`0x825465c98fc0ac81667f614d3da714512b7bd00f7bb5e25507c4038e87932c2c`](https://explorer.testnet.arc.io/tx/0x825465c98fc0ac81667f614d3da714512b7bd00f7bb5e25507c4038e87932c2c)

Screenshots: `11-referee-p1-verdict-controls.png`, `12-referee-p1-kept-confirming.png`, `13-referee-p1-kept-done.png`, `14-staker-usdc-broken-pad-filled.png`, `15-staker-usdc-broken-confirming.png`, `16-staker-usdc-broken-signed.png`, `17-referee-p2-broken-confirm.png`, `18-referee-p2-broken-done.png`

### SG-f Two-minute promise with no verdict reads No answer and pays the beneficiary: Fail

Time (UTC): 2026-10-12T22:15:38Z to 2026-10-12T22:17:03Z

- FAILED: locator.fill: Timeout 30000ms exceeded.
- FAILED: assertion failed: blocked: the two-minute promise was not created

Screenshots: `19-sg-f-failure.png`, `32-sg-f-failure.png`

### SG-e Send payout: an unrelated account on Kept, the beneficiary on Broken: Pass

Time (UTC): 2026-10-12T22:16:08Z to 2026-10-12T22:16:45Z

- On the Kept promise #36 an unrelated account pressed Send payout (0x45352c98c80b9218b0fd42b7558a1d9a27396d81eb73a6f4048ec03190c589da); the page said "Done. The stake was sent to the staker." and then read Paid back. The receipt holds one Transfer of 0.1 USDC to the staker and none to the sender.
- On the Broken promise #37 the beneficiary pressed Send payout (0xcfce9c881831402b21e03593d8268e63c7f9ba064dc360741a0e46c7b1b6207a); the page said "Done. The stake was sent to the beneficiary." and then read Paid out. The receipt holds one Transfer of 0.1 USDC to the beneficiary and none to the staker.

Transactions:

- 2026-10-12T22:16:40Z settler settle: [`0x45352c98c80b9218b0fd42b7558a1d9a27396d81eb73a6f4048ec03190c589da`](https://explorer.testnet.arc.io/tx/0x45352c98c80b9218b0fd42b7558a1d9a27396d81eb73a6f4048ec03190c589da)
- 2026-10-12T22:16:43Z beneficiary settle: [`0xcfce9c881831402b21e03593d8268e63c7f9ba064dc360741a0e46c7b1b6207a`](https://explorer.testnet.arc.io/tx/0xcfce9c881831402b21e03593d8268e63c7f9ba064dc360741a0e46c7b1b6207a)

Screenshots: `20-settler-p1-payout-offered.png`, `21-settler-p1-payout-done.png`, `22-beneficiary-p2-payout-offered.png`, `23-beneficiary-p2-payout-done.png`

### SG-h 390 px wide and dark mode: Pass

Time (UTC): 2026-10-12T22:16:45Z to 2026-10-12T22:16:46Z

- 390 px, light, no wallet: horizontal overflow 0 px, page background rgb(247, 248, 250).
- 1440 px, dark, no wallet: page background rgb(12, 15, 21), prefers-color-scheme dark matches: true.
- 390 px, dark: page background rgb(12, 15, 21) (light was rgb(247, 248, 250)); horizontal overflow 0 px.
- 390 px, dark, signed panel for #38: horizontal overflow 0 px.
- 390 px, dark, promise page #38: horizontal overflow 0 px.

Screenshots: `24-phone-light-visitor-landing.png`, `25-desktop-dark-visitor-landing.png`, `26-phone-dark-landing.png`, `30-phone-dark-p4-promise-page.png`

### SG-g cirBTC promise of 100 sats from the New promise page: Pass

Time (UTC): 2026-10-12T22:16:46Z to 2026-10-12T22:17:03Z

- Sign it was labelled "Sign it with 100 sats of cirBTC"; the panel number #38 matches the event and pledgeCount. Progress: Step 1 of 2: let SatStake take 0.000001 cirBTC. Confirm in your wallet. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Waiting for the network to confirm. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Done. | Step 2 of 2: create the promise. Confirm in your wallet. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Done. | Step 2 of 2: create the promise. Waiting for the network to confirm. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Done. | Step 2 of 2: create the promise. Done.
- The promise page for #38 reads "PROMISE #38 “UI dry run: cirBTC 100 sats”" and "100 sats (0.000001 cirBTC)" in the agreement, with the note "A sat is the smallest unit of Bitcoin." Banner: "You made this promise. Send this link to 0x03ea…3d69, who judges it: they answer here, and SatStake does not notify them. Silence counts as "
- The referee marked it Kept and an unrelated account sent the payout (0x75e5dc68b3ecfe5a0eabb40b54a2d78e7ab1cc5bf1bf3c2bde23b53378c71c7b); the receipt moves exactly 100 sats to the staker and the staker's balance is back to 1205 sats.

Transactions:

- 2026-10-12T22:16:49Z staker approve: [`0x8f042fb009e8e8a2621eadbaddead85523631665a3732440b709a7be019bfca4`](https://explorer.testnet.arc.io/tx/0x8f042fb009e8e8a2621eadbaddead85523631665a3732440b709a7be019bfca4)
- 2026-10-12T22:16:52Z staker createPledge: [`0xd814fc94636955150dde58772be54c4faee48d977b165c92315aea7ed30ac91a`](https://explorer.testnet.arc.io/tx/0xd814fc94636955150dde58772be54c4faee48d977b165c92315aea7ed30ac91a)
- 2026-10-12T22:16:57Z referee markKept: [`0x4f661af8f2e1d42378e7089014be01a14caa7806138fb82c96939931b7797fa0`](https://explorer.testnet.arc.io/tx/0x4f661af8f2e1d42378e7089014be01a14caa7806138fb82c96939931b7797fa0)
- 2026-10-12T22:17:01Z settler settle: [`0x75e5dc68b3ecfe5a0eabb40b54a2d78e7ab1cc5bf1bf3c2bde23b53378c71c7b`](https://explorer.testnet.arc.io/tx/0x75e5dc68b3ecfe5a0eabb40b54a2d78e7ab1cc5bf1bf3c2bde23b53378c71c7b)

Screenshots: `27-phone-dark-cirbtc-100-sats-pad-filled.png`, `28-phone-dark-cirbtc-100-sats-confirming.png`, `29-phone-dark-cirbtc-100-sats-signed.png`, `31-settler-p4-payout-done.png`

### SG-i Console errors and page errors across the run: Fail

Time (UTC): 2026-10-12T22:14:26Z to 2026-10-12T22:17:03Z

- 8 distinct console or page errors; listed under Console and network errors.

## Wallet requests and signing (LLR-FE-074)

The injected wallet refuses `personal_sign`, `eth_sign` and `eth_signTypedData*` and counts any such request. Count: 0.

Methods the site asked the wallet for, over all sessions:

- `eth_accounts`: 8
- `eth_chainId`: 32
- `eth_requestAccounts`: 6
- `eth_sendTransaction`: 12
- `wallet_requestPermissions`: 6
- `wallet_switchEthereumChain`: 1

## Accounts

- Staker (the testnet operator): `0x18648257045D8c323Cff1E4F80EeD22F157D8767`
- Referee (throwaway, generated in memory; the settler is the unrelated account): `0x03ea50dCBb9b2CE0Fa0581a9F0b24536272b3d69`
- Beneficiary (throwaway, generated in memory; the settler is the unrelated account): `0x8c3456A1a0B5B0a5b4Ef9e52E91450C6a30C4D1D`
- Settler (throwaway, generated in memory; the settler is the unrelated account): `0x84763B6F2d5a7876c934D3b8b020E4a912C94346`

## Promises created

- #36: USDC 0.1, 1 day, Kept, payout by an unrelated account, created [`0x5d70e73a3c98934eaafaae01a9633b8c5ca349bcb2e2637c7e8d24eae5908fa5`](https://explorer.testnet.arc.io/tx/0x5d70e73a3c98934eaafaae01a9633b8c5ca349bcb2e2637c7e8d24eae5908fa5)
- #37: USDC 0.1, 1 day, Broken, payout by the beneficiary, created [`0xc20052f4b949e25a057a3b5b1348f1f4dfd8d807b02dca9b6feffb28418182c2`](https://explorer.testnet.arc.io/tx/0xc20052f4b949e25a057a3b5b1348f1f4dfd8d807b02dca9b6feffb28418182c2)
- #not created: USDC 0.1, 2 minutes, no verdict, payout by an unrelated account
- #38: cirBTC 100 sats, 1 day, Kept, payout by an unrelated account, created [`0xd814fc94636955150dde58772be54c4faee48d977b165c92315aea7ed30ac91a`](https://explorer.testnet.arc.io/tx/0xd814fc94636955150dde58772be54c4faee48d977b165c92315aea7ed30ac91a)

## Funds

- Gas funding sent to the throwaway accounts: referee 0.0885225 USDC [`0xe089517bf9888fb07bc36c3bf1b8044c20029a5ca38637ec17a1e92ccbde1162`](https://explorer.testnet.arc.io/tx/0xe089517bf9888fb07bc36c3bf1b8044c20029a5ca38637ec17a1e92ccbde1162); beneficiary 0.0667725 USDC [`0x7c0d764223a0590849d5002881bdb17ca3a715ed3dc311e6cc6227c410cd15bf`](https://explorer.testnet.arc.io/tx/0x7c0d764223a0590849d5002881bdb17ca3a715ed3dc311e6cc6227c410cd15bf); settler 0.0885225 USDC [`0xd28d46c680d8a0882581e38b982876b84ce4880d294bba04cb3e0a9d1b19632f`](https://explorer.testnet.arc.io/tx/0xd28d46c680d8a0882581e38b982876b84ce4880d294bba04cb3e0a9d1b19632f).
- Operator before: 12.9640073352301 USDC, 1205 sats. Locked in SatStake before: 200000 USDC units, 100 cirBTC units; pledge count 35.
- Operator after the sweep: 12.9234996352301 USDC, 1205 sats. Locked in SatStake after: 200000 USDC units, 100 cirBTC units; pledge count 38.
- Net cost: 0.0405077 USDC (network fees; every stake returned to the operator or swept back from the beneficiary), 0 sats.
- Sweep: completed.
  - referee returns its remaining USDC to the operator [`0x96161264f985e1bce12f0264f260bf118a920340d80c0f6ddfdb061ad0e5c18c`](https://explorer.testnet.arc.io/tx/0x96161264f985e1bce12f0264f260bf118a920340d80c0f6ddfdb061ad0e5c18c) (266700000000000 native units left, the unspent margin of the fee cap)
  - beneficiary returns its remaining USDC to the operator [`0x1dee8630400dc008d1b883b10957038f6ac6d2217deba89f86868b2c2b4a2a0d`](https://explorer.testnet.arc.io/tx/0x1dee8630400dc008d1b883b10957038f6ac6d2217deba89f86868b2c2b4a2a0d) (266700000000000 native units left, the unspent margin of the fee cap)
  - settler returns its remaining USDC to the operator [`0x18f309a310cc7cc19d965a604959f8f9aacabacab42cc9469f04799a3388329d`](https://explorer.testnet.arc.io/tx/0x18f309a310cc7cc19d965a604959f8f9aacabacab42cc9469f04799a3388329d) (266700000000000 native units left, the unspent margin of the fee cap)

## Console and network errors (SG-i)

- visitor: Failed to load resource: the server responded with a status of 429 ()
- staker: Failed to load resource: the server responded with a status of 429 ()
- referee: Failed to load resource: the server responded with a status of 429 ()
- referee-watch: Failed to load resource: the server responded with a status of 429 ()
- settler: Failed to load resource: the server responded with a status of 429 ()
- beneficiary: Failed to load resource: the server responded with a status of 429 ()
- desktop-dark-visitor: Failed to load resource: the server responded with a status of 429 ()
- phone-dark: Failed to load resource: the server responded with a status of 429 ()

HTTP responses with status 400 or above seen by the browser (counts):

- 429 POST https://rpc.testnet.arc.io: 115

## Findings

- SG-f: SG-f failed: locator.fill: Timeout 30000ms exceeded. Screenshot: `19-sg-f-failure.png`.
- SG-f: SG-f failed: assertion failed: blocked: the two-minute promise was not created Screenshot: `32-sg-f-failure.png`.
