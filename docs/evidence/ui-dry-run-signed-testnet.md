# UI dry run of the Signed frontend on Arc testnet

Date: 2026-10-10T20:53:08Z to 2026-10-10T20:56:48Z (UTC). Site: a local testnet build of this worktree served by `vite preview` at http://127.0.0.1:4173/; the published Pages site (mainnet) was not touched. Chain 5042002, contract `0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4`.

Build commit: `1f608fe` (branch `signed-frontend`). Uncommitted changes under app/src, app/index.html, app/vite.config.ts or deployments when the run started: none. The build was made with `npm run build:testnet` from that tree just before the run.

The run drives the real app in Chromium (Playwright) through an injected wallet (EIP-6963, name "Dry run wallet") whose requests are answered by a script holding the keys. Every action below was done by clicking and typing in the page; the script reads the chain only to check what the page showed. Screenshots are full page, in the gitignored `cache/dry-run-signed/`, named per step below; the 390 px and dark ones carry `phone` and `dark` in their names.

Result: 8 of 9 journeys passed.

| Journey | Title | Result |
|---|---|---|
| SG-a | No wallet: landing, a promise page read-only, unknown id | Pass |
| SG-b | Connect, wrong network, then switch | Pass |
| SG-c | Create a USDC promise from the hero; the sealed panel | Pass |
| SG-d | Referee opens the share link: Kept, and Broken with the inline confirm | Pass |
| SG-f | Two-minute promise with no verdict reads No answer and pays the beneficiary | Pass |
| SG-e | Send payout: an unrelated account on Kept, the beneficiary on Broken | Pass |
| SG-h | 390 px wide and dark mode | Pass |
| SG-g | cirBTC promise of 100 sats from the hero | Pass |
| SG-i | Console errors and page errors across the run | Fail |

## Journeys

### SG-a No wallet: landing, a promise page read-only, unknown id: Pass

Time (UTC): 2026-10-10T20:53:17Z to 2026-10-10T20:53:49Z

- The landing reads with no wallet: the hero sentence "I promise to" with rotating examples, the lead sentence, the agreement, the full contract address, a Sourcify link and a promise count.
- The pad is drawn with a demonstration signature; with no wallet and no promise written, the Seal it control is aria-disabled.
- The live promise (#1) opened with no wallet and shows its heading, "Done. The stake went to 0xd65D…3fB0.", the seven-line agreement with the three addresses, and the clock. Status line: "Paid out. The stake went to the person named to get it.". No Kept, Broken or Send payout control, no role badge.
- An unknown id shows the heading "Promise not found" and "This promise does not exist. Check the link.", with links home and to My promises.
- An unknown route shows "This page does not exist."

Screenshots: `01-visitor-landing.png`, `02-visitor-live-promise.png`, `03-visitor-unknown-promise.png`

### SG-b Connect, wrong network, then switch: Pass

Time (UTC): 2026-10-10T20:53:49Z to 2026-10-10T20:53:53Z

- Before any click the page sent only: eth_accounts. No account request.
- Beside Seal it while the wallet is on chain 1: Your wallet is on another network. Switch to Arc Testnet. Still to complete: Amount, Referee address, Beneficiary address, Deadline, the box confirming you understand.
- Switch to Arc Testnet asked the wallet to switch; the status then read connected on Arc Testnet and the wrong-network reason went.

Screenshots: `04-staker-before-connect.png`, `05-staker-wrong-network.png`, `06-staker-switched.png`

### SG-c Create a USDC promise from the hero; the sealed panel: Pass

Time (UTC): 2026-10-10T20:53:53Z to 2026-10-10T20:54:04Z

- Seal it was labelled "Seal it with $0.10 in USDC". Progress texts seen: Step 1 of 2: let SatStake take 0.1 USDC. Confirm in your wallet. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.1 USDC. Waiting for the network to confirm. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the promise. Confirm in your wallet. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the promise. Waiting for the network to confirm. ;; Step 1 of 2: let SatStake take 0.1 USDC. Done. | Step 2 of 2: create the promise. Done.
- The wallet sent approve 0x50631286b903bbdd9fd4dff037b6711ab04ad7f7d5d301f539e6e7f8e8fcfffa and then createPledge 0x83cd1fc444039681da86ca914295c747c571cbc3efddccaed396f52c6c8d1f0c.
- The sealed panel shows the creation hash 0x83cd1fc444039681da86ca914295c747c571cbc3efddccaed396f52c6c8d1f0c, the same as the hash the wallet sent; its explorer link is https://explorer.testnet.arc.io/tx/0x83cd1fc444039681da86ca914295c747c571cbc3efddccaed396f52c6c8d1f0c.
- The panel's promise number is #32; the creation event says #32, and pledgeCount at the creation block is 32.
- The share link in the panel is http://127.0.0.1:4173/#/p/32. The "Locked until" line reads "Referee rules, or Oct 11, 2026, 8:53 PM UTC", the chain deadline.
- The seal is drawn (svg class "on"); its ring label reads "PROMISE № 32 · $0.10 IN USDC · SEALED ON ARC TESTNET · 83CD1FC4"; all 64 ticks agree with the bits of the creation hash.
- Copy the link to this promise put the share link on the clipboard.
- After sealing, the Seal it control is gone and the sealed panel holds focus.

Transactions:

- 2026-10-10T20:53:56Z staker approve: [`0x50631286b903bbdd9fd4dff037b6711ab04ad7f7d5d301f539e6e7f8e8fcfffa`](https://explorer.testnet.arc.io/tx/0x50631286b903bbdd9fd4dff037b6711ab04ad7f7d5d301f539e6e7f8e8fcfffa)
- 2026-10-10T20:53:58Z staker createPledge: [`0x83cd1fc444039681da86ca914295c747c571cbc3efddccaed396f52c6c8d1f0c`](https://explorer.testnet.arc.io/tx/0x83cd1fc444039681da86ca914295c747c571cbc3efddccaed396f52c6c8d1f0c)

Screenshots: `07-hero-promise-clipped.png`, `08-staker-usdc-kept-pad-filled.png`, `09-staker-usdc-kept-confirming.png`, `10-staker-usdc-kept-sealed.png`, `11-staker-sealed-after-copy.png`

### SG-d Referee opens the share link: Kept, and Broken with the inline confirm: Pass

Time (UTC): 2026-10-10T20:54:04Z to 2026-10-10T20:54:25Z

- The referee, opening the share link from the sealed panel, sees the badge "You judge this promise", the question "Was this promise kept?" and the Kept and Broken buttons. Banner: "0x1864…8767 named you to judge this promise. Before Oct 11, 2026, 8:53 PM UTC, decide: was it kept? Your answer is final. The stake never passes through you. Si"
- Kept sent one transaction (markKept); the page said "You marked this promise kept." with the same hash the wallet sent and an explorer link; chain state is Kept and the banner reads Kept.
- A second promise, #33, was made with Make another promise from the sealed panel (creation 0xcbafbaab11244c2f6b40688e3d3561b12e8452fc432373808aca0d1174c6a3c2). Its panel number matches the event and pledgeCount.
- Broken opened the inline confirm "Mark this promise broken?" under the ruling line with the amount and the beneficiary; focus started on Cancel; it is not a modal dialog.
- Cancel closed the confirm and sent no request to the wallet (eth_sendTransaction count unchanged); the promise stayed Active with Kept and Broken still offered.
- Mark it broken sent markBroken 0x7e038087d0a9dcfd0e3894cb51d950f488b406e5168b0a7c40d365738138ce44; the page said "You marked this promise broken." with that hash; chain state is Broken.

Transactions:

- 2026-10-10T20:54:07Z referee markKept: [`0x0aa42b195247d7baae84355e7e957768537ab7122f760e5690c4a7329bef9f8c`](https://explorer.testnet.arc.io/tx/0x0aa42b195247d7baae84355e7e957768537ab7122f760e5690c4a7329bef9f8c)
- 2026-10-10T20:54:11Z staker approve: [`0x34a7478dbe81d94696ec2b497a58e0edf820935930ac27b33c80787d408e0c60`](https://explorer.testnet.arc.io/tx/0x34a7478dbe81d94696ec2b497a58e0edf820935930ac27b33c80787d408e0c60)
- 2026-10-10T20:54:13Z staker createPledge: [`0xcbafbaab11244c2f6b40688e3d3561b12e8452fc432373808aca0d1174c6a3c2`](https://explorer.testnet.arc.io/tx/0xcbafbaab11244c2f6b40688e3d3561b12e8452fc432373808aca0d1174c6a3c2)
- 2026-10-10T20:54:24Z referee markBroken: [`0x7e038087d0a9dcfd0e3894cb51d950f488b406e5168b0a7c40d365738138ce44`](https://explorer.testnet.arc.io/tx/0x7e038087d0a9dcfd0e3894cb51d950f488b406e5168b0a7c40d365738138ce44)

Screenshots: `12-referee-p1-verdict-controls.png`, `13-referee-p1-kept-confirming.png`, `14-referee-p1-kept-done.png`, `15-hero-promise-clipped.png`, `16-staker-usdc-broken-pad-filled.png`, `17-staker-usdc-broken-confirming.png`, `18-staker-usdc-broken-sealed.png`, `19-referee-p2-broken-confirm.png`, `20-referee-p2-broken-done.png`

### SG-f Two-minute promise with no verdict reads No answer and pays the beneficiary: Pass

Time (UTC): 2026-10-10T20:54:26Z to 2026-10-10T20:56:38Z

- The two-minute promise #34 was made from the hero page (#/create); creation 0x9bc77d1f745578defb989df37be545bd649d7e7bd894625f61a35e590a793377; the panel number matches the event and pledgeCount.
- The referee's page for it, opened from its share link, offers Kept and Broken while the deadline is ahead.
- The deadline had not arrived when this step began; waiting for chain time.
- The referee's open page, with no reload, read "No answer by the deadline. The promise counts as broken, and the stake can be sent to the person named to get it." after the deadline; Kept and Broken were gone. Banner: "The deadline passed with no answer, so this promise counts as broken. The stake goes to 0xDB87…37FB; anyone can send it now. You can no longer give a "
- An unrelated account sent the payout (0xe5452fc1c9877ccaba207fe0c210007e8011892c3960a9fbff331fd461e7f204); the receipt holds one Transfer of 0.1 USDC to the beneficiary, none to the sender or the staker; the page read Paid out.
- The referee's open page followed to Paid out on its own.

Transactions:

- 2026-10-10T20:54:29Z staker approve: [`0xa6d7d7ea93c7d8d25f82e3b3987ef8761d2158742f986a7f266c993c830fe91b`](https://explorer.testnet.arc.io/tx/0xa6d7d7ea93c7d8d25f82e3b3987ef8761d2158742f986a7f266c993c830fe91b)
- 2026-10-10T20:54:32Z staker createPledge: [`0x9bc77d1f745578defb989df37be545bd649d7e7bd894625f61a35e590a793377`](https://explorer.testnet.arc.io/tx/0x9bc77d1f745578defb989df37be545bd649d7e7bd894625f61a35e590a793377)
- 2026-10-10T20:56:36Z settler settle: [`0xe5452fc1c9877ccaba207fe0c210007e8011892c3960a9fbff331fd461e7f204`](https://explorer.testnet.arc.io/tx/0xe5452fc1c9877ccaba207fe0c210007e8011892c3960a9fbff331fd461e7f204)

Screenshots: `21-hero-promise-clipped.png`, `22-staker-usdc-two-minute-pad-filled.png`, `23-staker-usdc-two-minute-confirming.png`, `24-staker-usdc-two-minute-sealed.png`, `25-referee-watch-p3-active.png`, `39-referee-watch-p3-no-answer.png`, `40-settler-p3-payout-offered.png`, `41-settler-p3-payout-done.png`

### SG-e Send payout: an unrelated account on Kept, the beneficiary on Broken: Pass

Time (UTC): 2026-10-10T20:54:38Z to 2026-10-10T20:55:15Z

- On the Kept promise #32 an unrelated account pressed Send payout (0x8789f355ba3707534f49a6acd67e0c7ea6ddc522e63f932b81562048222f0bd6); the page said "Done. The stake was sent to the staker." and then read Paid back. The receipt holds one Transfer of 0.1 USDC to the staker and none to the sender.
- On the Broken promise #33 the beneficiary pressed Send payout (0xe446fc432602a8c9e4f14ac53fa32f1c9ea3dfe428934e86443d3a39ef65f693); the page said "Done. The stake was sent to the beneficiary." and then read Paid out. The receipt holds one Transfer of 0.1 USDC to the beneficiary and none to the staker.

Transactions:

- 2026-10-10T20:55:10Z settler settle: [`0x8789f355ba3707534f49a6acd67e0c7ea6ddc522e63f932b81562048222f0bd6`](https://explorer.testnet.arc.io/tx/0x8789f355ba3707534f49a6acd67e0c7ea6ddc522e63f932b81562048222f0bd6)
- 2026-10-10T20:55:13Z beneficiary settle: [`0xe446fc432602a8c9e4f14ac53fa32f1c9ea3dfe428934e86443d3a39ef65f693`](https://explorer.testnet.arc.io/tx/0xe446fc432602a8c9e4f14ac53fa32f1c9ea3dfe428934e86443d3a39ef65f693)

Screenshots: `26-settler-p1-payout-offered.png`, `27-settler-p1-payout-done.png`, `28-beneficiary-p2-payout-offered.png`, `29-beneficiary-p2-payout-done.png`

### SG-h 390 px wide and dark mode: Pass

Time (UTC): 2026-10-10T20:55:15Z to 2026-10-10T20:55:16Z

- 390 px, light, no wallet: horizontal overflow 0 px, page background rgb(247, 248, 250).
- 1440 px, dark, no wallet: page background rgb(12, 15, 21), prefers-color-scheme dark matches: true.
- 390 px, dark: page background rgb(12, 15, 21) (light was rgb(247, 248, 250)); horizontal overflow 0 px.
- 390 px, dark, sealed panel for #35: horizontal overflow 0 px.
- 390 px, dark, promise page #35: horizontal overflow 0 px.
- 390 px, dark, promise page #34 (No answer, paid out): horizontal overflow 0 px.

Screenshots: `30-phone-light-visitor-landing.png`, `31-desktop-dark-visitor-landing.png`, `32-phone-dark-landing.png`, `37-phone-dark-p4-promise-page.png`, `42-phone-dark-p3-promise-page.png`

### SG-g cirBTC promise of 100 sats from the hero: Pass

Time (UTC): 2026-10-10T20:55:16Z to 2026-10-10T20:55:32Z

- Seal it was labelled "Seal it with 100 sats"; the seal label reads "PROMISE № 35 · 100 SATS · SEALED ON ARC TESTNET · 81B30E50"; the panel number #35 matches the event and pledgeCount. Progress: Step 1 of 2: let SatStake take 0.000001 cirBTC. Confirm in your wallet. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Waiting for the network to confirm. | Step 2 of 2: create the promise. Starts after step 1. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Done. | Step 2 of 2: create the promise. Confirm in your wallet. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Done. | Step 2 of 2: create the promise. Waiting for the network to confirm. ;; Step 1 of 2: let SatStake take 0.000001 cirBTC. Done. | Step 2 of 2: create the promise. Done.
- The promise page for #35 reads "PROMISE #35 “UI dry run: cirBTC 100 sats”" and "100 sats, 0.000001 cirBTC" in the agreement, with the note "A sat is the smallest unit of Bitcoin." Banner: "You made this promise. Send this link to 0xaee3…aFf2, who judges it: they answer here, and SatStake does not notify them. Silence counts as "
- The referee marked it Kept and an unrelated account sent the payout (0x76c84e7471afddbc03fae0920f3e52abbe95232f89ef66d4afa5bc888d0fbad7); the receipt moves exactly 100 sats to the staker and the staker's balance is back to 1205 sats.

Transactions:

- 2026-10-10T20:55:19Z staker approve: [`0x09fe9a6e391e16a52515444efe460d1b58296ba0f22b4ba9ecc55320ab46fb34`](https://explorer.testnet.arc.io/tx/0x09fe9a6e391e16a52515444efe460d1b58296ba0f22b4ba9ecc55320ab46fb34)
- 2026-10-10T20:55:21Z staker createPledge: [`0x81b30e508a36a03d0b9ee0d8315c2ae51aedfb324768b738e685bf39818280e0`](https://explorer.testnet.arc.io/tx/0x81b30e508a36a03d0b9ee0d8315c2ae51aedfb324768b738e685bf39818280e0)
- 2026-10-10T20:55:28Z referee markKept: [`0xc472b766b60b7d43cfac5995c1942acef7e22f8228cae291b362a0aa067db000`](https://explorer.testnet.arc.io/tx/0xc472b766b60b7d43cfac5995c1942acef7e22f8228cae291b362a0aa067db000)
- 2026-10-10T20:55:31Z settler settle: [`0x76c84e7471afddbc03fae0920f3e52abbe95232f89ef66d4afa5bc888d0fbad7`](https://explorer.testnet.arc.io/tx/0x76c84e7471afddbc03fae0920f3e52abbe95232f89ef66d4afa5bc888d0fbad7)

Screenshots: `33-hero-promise-clipped.png`, `34-phone-dark-cirbtc-100-sats-pad-filled.png`, `35-phone-dark-cirbtc-100-sats-confirming.png`, `36-phone-dark-cirbtc-100-sats-sealed.png`, `38-settler-p4-payout-done.png`

### SG-i Console errors and page errors across the run: Fail

Time (UTC): 2026-10-10T20:53:08Z to 2026-10-10T20:56:38Z

- 9 distinct console or page errors; listed under Console and network errors.

## Wallet requests and signing (LLR-FE-074)

The injected wallet refuses `personal_sign`, `eth_sign` and `eth_signTypedData*` and counts any such request. Count: 0.

Methods the site asked the wallet for, over all sessions:

- `eth_accounts`: 8
- `eth_chainId`: 38
- `eth_requestAccounts`: 6
- `eth_sendTransaction`: 15
- `wallet_requestPermissions`: 6
- `wallet_switchEthereumChain`: 1

## Accounts

- Staker (the testnet operator): `0x18648257045D8c323Cff1E4F80EeD22F157D8767`
- Referee (throwaway, generated in memory; the settler is the unrelated account): `0xaee3346C2C516e9CF3A8bAE0818e3EC72116aFf2`
- Beneficiary (throwaway, generated in memory; the settler is the unrelated account): `0xDB875e4C3C2ec045B0c28705FA14D53EE4e137FB`
- Settler (throwaway, generated in memory; the settler is the unrelated account): `0xce335cA9449537A87Aa151f52f02BD231cE19294`

## Promises created

- #32: USDC 0.1, 1 day, Kept, payout by an unrelated account, created [`0x83cd1fc444039681da86ca914295c747c571cbc3efddccaed396f52c6c8d1f0c`](https://explorer.testnet.arc.io/tx/0x83cd1fc444039681da86ca914295c747c571cbc3efddccaed396f52c6c8d1f0c)
- #33: USDC 0.1, 1 day, Broken, payout by the beneficiary, created [`0xcbafbaab11244c2f6b40688e3d3561b12e8452fc432373808aca0d1174c6a3c2`](https://explorer.testnet.arc.io/tx/0xcbafbaab11244c2f6b40688e3d3561b12e8452fc432373808aca0d1174c6a3c2)
- #34: USDC 0.1, 2 minutes, no verdict, payout by an unrelated account, created [`0x9bc77d1f745578defb989df37be545bd649d7e7bd894625f61a35e590a793377`](https://explorer.testnet.arc.io/tx/0x9bc77d1f745578defb989df37be545bd649d7e7bd894625f61a35e590a793377)
- #35: cirBTC 100 sats, 1 day, Kept, payout by an unrelated account, created [`0x81b30e508a36a03d0b9ee0d8315c2ae51aedfb324768b738e685bf39818280e0`](https://explorer.testnet.arc.io/tx/0x81b30e508a36a03d0b9ee0d8315c2ae51aedfb324768b738e685bf39818280e0)

## Funds

- Gas funding sent to the throwaway accounts: referee 0.0885225 USDC [`0x24018ade02a6db84e2ec0a99726d160043b28eef4cd1030e5604999f9acfffc2`](https://explorer.testnet.arc.io/tx/0x24018ade02a6db84e2ec0a99726d160043b28eef4cd1030e5604999f9acfffc2); beneficiary 0.0667725 USDC [`0x8c30001b6f99b3bd9b3061d525186675151ae60023a0e26f014a8d10f5789548`](https://explorer.testnet.arc.io/tx/0x8c30001b6f99b3bd9b3061d525186675151ae60023a0e26f014a8d10f5789548); settler 0.0885225 USDC [`0xfb3d962fb37649b62e3210c94c4efcdb0e53a5d5151be21f50d5dc90dfdc32d1`](https://explorer.testnet.arc.io/tx/0xfb3d962fb37649b62e3210c94c4efcdb0e53a5d5151be21f50d5dc90dfdc32d1).
- Operator before: 13.0156318102301 USDC, 1205 sats. Locked in SatStake before: 200000 USDC units, 100 cirBTC units; pledge count 31.
- Operator after the sweep: 12.9640073352301 USDC, 1205 sats. Locked in SatStake after: 200000 USDC units, 100 cirBTC units; pledge count 35.
- Net cost: 0.051624475 USDC (network fees; every stake returned to the operator or swept back from the beneficiary), 0 sats.
- Sweep: completed.
  - referee returns its remaining USDC to the operator [`0x5e7157accee88aded8fffb817a96518ea2aae7284710b7d804c9ef1a15d1d4a5`](https://explorer.testnet.arc.io/tx/0x5e7157accee88aded8fffb817a96518ea2aae7284710b7d804c9ef1a15d1d4a5) (266700000000000 native units left, the unspent margin of the fee cap)
  - beneficiary returns its remaining USDC to the operator [`0x74c274d85ff5cf07d30370e6dc7f02c509651ded664eff036194c77a4964ddaa`](https://explorer.testnet.arc.io/tx/0x74c274d85ff5cf07d30370e6dc7f02c509651ded664eff036194c77a4964ddaa) (266700000000000 native units left, the unspent margin of the fee cap)
  - settler returns its remaining USDC to the operator [`0x44484e448b58233b227a1e4de216fae4a2c77e36b89e10656e733f53394c5b63`](https://explorer.testnet.arc.io/tx/0x44484e448b58233b227a1e4de216fae4a2c77e36b89e10656e733f53394c5b63) (266700000000000 native units left, the unspent margin of the fee cap)

## Console and network errors (SG-i)

- visitor: Failed to load resource: the server responded with a status of 429 ()
- staker: Failed to load resource: the server responded with a status of 429 ()
- referee: Failed to load resource: the server responded with a status of 429 ()
- referee-watch: Failed to load resource: the server responded with a status of 429 ()
- settler: Failed to load resource: the server responded with a status of 429 ()
- beneficiary: Failed to load resource: the server responded with a status of 429 ()
- phone-light-visitor: Failed to load resource: the server responded with a status of 429 ()
- desktop-dark-visitor: Failed to load resource: the server responded with a status of 429 ()
- phone-dark: Failed to load resource: the server responded with a status of 429 ()

HTTP responses with status 400 or above seen by the browser (counts):

- 429 POST https://rpc.testnet.arc.io: 82

## Findings

- SG-c: The hero's promise field is wider than its box for the 21-character promise "UI dry run: USDC kept": the field scrolls (1067 px of text in 1005 px) and the end of the sentence is cut off at 1440 px wide. Screenshot: `07-hero-promise-clipped.png`.
- SG-d: The hero's promise field is wider than its box for the 23-character promise "UI dry run: USDC broken": the field scrolls (1186 px of text in 1005 px) and the end of the sentence is cut off at 1440 px wide. Screenshot: `15-hero-promise-clipped.png`.
- SG-f: The hero's promise field is wider than its box for the 27-character promise "UI dry run: USDC two-minute": the field scrolls (1396 px of text in 1005 px) and the end of the sentence is cut off at 1440 px wide. Screenshot: `21-hero-promise-clipped.png`.
- SG-g: The hero's promise field is wider than its box for the 27-character promise "UI dry run: cirBTC 100 sats": the field scrolls (484 px of text in 358 px) and the end of the sentence is cut off at 390 px wide. Screenshot: `33-hero-promise-clipped.png`.
- Medium, hero (seen on every promise made, desktop and 390 px): the sentence after "I promise to" is a single-line field in a very large type size. A promise of 21 characters already runs past the box at 1440 px, and 27 characters at 390 px, and the end is cut off with no wrap and no ellipsis. The same clipped sentence stays in the hero after sealing (`10-staker-usdc-kept-sealed.png`, `36-phone-dark-cirbtc-100-sats-sealed.png`), so the person never sees their whole promise where it is written large. The full text is correct on chain and on the promise page (`37-phone-dark-p4-promise-page.png`). Steps: open the landing or `#/create`, write any promise longer than about 20 characters.
- Low, SG-i: every session logged "Failed to load resource: 429" and the browser saw 82 HTTP 429 answers from `https://rpc.testnet.arc.io` over the run (nine sessions polling, several with live pledge pages). Every page still read its data and every action completed, so the retry path held; it is the same shape as the 429 recorded in the previous run, now in every session. SG-i is marked Fail because the brief asks for every console error to be collected and there are some; none is a script or page exception.
- Observation, not a defect: the text around the seal's ring is about 7 px high at 1440 px and 390 px (`crop` of `36-phone-dark-cirbtc-100-sats-sealed.png`); the label is real (checked in the DOM against the chain) but is not readable by eye.
- Script finding: the first full attempt (before the last two script fixes) failed its panel check only because the script matched "Promise number" in the case the page writes it in (the label is drawn in capitals). That attempt had already sent three real promises (#29 USDC 0.1, 1 day; #30 USDC 0.1, 2 minutes; #31 cirBTC 100 sats, 1 day) and then ended with the later journeys blocked, so their referee and beneficiary keys, which exist only in the process, are gone. Those three stakes (0.2 USDC and 100 sats) can no longer get a verdict and will pay to a beneficiary nobody holds a key for; the 2-minute one is already Expired and payable the same way. The step that was at fault is now soft (a failed page check is recorded and the run goes on), and the final run above is the only one whose journeys are reported. Start of the final run: `totalLocked` 200000 USDC units and 100 cirBTC units, which is exactly these three stakes; end of the final run: the same, so the final run left nothing locked.

## Limits of the evidence

- The site was a local `vite preview` of the testnet build, not the published Pages site (which serves mainnet and was not driven). The build commit above is the worktree HEAD; the script (`app/scripts/ui-dry-run.mjs`) was uncommitted when the run was made.
- The wallet is an injected test wallet; real wallets (prompt wording, chain-switch behaviour, mobile in-app browsers) are not covered. Screenshots at 390 px are a desktop Chromium viewport of that width, with no touch emulation.
- The seal check compares the 64 ticks and the ring text with the real creation hash; the arcs and dots were not compared mark by mark, and the "drawn in" animation was judged from the `on` class and screenshots taken 2.5 s later, not from frames.
- Dark mode was seen on the landing (desktop and 390 px), the hero pad filled, the sealed panel, and two promise pages, all at 390 px; the desktop sealed panel and verdict pages were captured in light only. 390 px light was captured for the landing only.
- Findings were read from screenshots downscaled for viewing; layout detail below about 10 px (the ring text) was not judged.
- The 429 count is the browser's own; it does not say which calls failed or how many were retried.
- The 2-minute promise's creation, expiry and payout were timed against chain time; the "No answer" text was read on a referee page that had been open since before the deadline, with no reload.
