# Walkthrough

LLR-VV-010. An end-user script on the mainnet site for every journey that `docs/ACCEPTANCE.md` marks for a walkthrough step (WT). Liam performs it once, in order. Each step says what to do and what must happen. A step whose result differs from what is written is a defect: stop, note the step number and what was seen, and do not submit.

Site: https://vasqq.github.io/satstake/ (the mainnet build). Contract: `0xEbcda489EB528c573E9a190eB8EfE63b44d9204e` on Arc mainnet, chain 5042.

Words in quotation marks are the site's current wording. The site calls a pledge a "promise" throughout.

## Before you start

- **A browser wallet with three accounts**, all yours, used only for this: **S** (staker), **R** (referee), **B** (beneficiary). The Foundry burners are not used here; their keys stay in their keystores. If an account needs funding, send it from your own funds; every stake below returns to S or goes to B, so the cost is network fees only, a few cents.
- **Funds on Arc mainnet:** S holds about 2 USDC and about 600 sats of cirBTC (0.000006 cirBTC). R holds about 0.1 USDC and B about 0.05 USDC, for network fees: on Arc the fee is paid in USDC, so B cannot send a payout without some.
- **A second browser window** with no wallet connected, or a private window, for the visitor's view.
- **Screen recording** for the demo video, part C. Parts A and B do not need to be recorded.
- The site's network check needs the RPC to answer. If the page says it could not confirm the network, wait a minute and reload.

## Part A. Without a wallet

1. **UJ-01, UJ-70.** In the visitor window, open the site. **Expect:** "Live on Arc mainnet" in the header; the hero "I promise to" with an example ending, the line "Or my stake goes to someone I chose. A friend decides whether I kept it, and code makes sure the money goes where they say." and a "Write your own ↗" link to "New promise" (the landing has no create form); further down, an agreement and a clock each labelled as an example; and the "Check it yourself." section, labelled "Live on Arc", with "Promises made" of at least 4, the network "Arc" with "Chain 5042", the full contract address with "Copy" and "View on explorer", "Verified on Sourcify", and "A live promise". No wallet prompt appears.
2. **UJ-70.** Open "Verified on Sourcify", then "View on explorer". **Expect:** Sourcify shows SatStake verified with an exact match at the address above; the explorer shows the contract with verified source.
3. **UJ-01, UJ-20, UJ-85.** Back on the site, open "A live promise". **Expect:** "Promise #4" laid out as an agreement: the promise as the main text, the stake with its symbol (cirBTC also in sats), the staker, referee, and beneficiary on signature lines with copy and explorer controls, the deadline in your local time, a live clock with the time left, and the state "Open". This is seeded promise #4, open until 2026-11-01.
4. **UJ-85.** Change the address bar to `#/p/1`, then `#/p/2`, then `#/p/3`. **Expect:** #1 "Paid back" (kept, stake returned to the staker); #2 and #3 "Paid out" (the stake went to the beneficiary: #2 had no verdict by its deadline, #3 was marked broken). None offers an action.
5. **UJ-21.** Open `#/p/999999`. **Expect:** "Promise not found" and "This promise does not exist. Check the link.", with a link home.
6. **UJ-92.** On promise #1, look at every address and transaction hash shown. **Expect:** each has a copy control beside its explorer link.
7. **UJ-02, alternate 1.** Open the site in a browser profile with no extensions installed (a new guest profile in Chrome, for example), and open "New promise". **Expect:** "Reading needs no wallet. To act, connect a browser wallet; on a phone, use your wallet app’s browser."; every page still reads.

## Part B. With the wallet

8. **UJ-03.** In the wallet, switch to any network other than Arc (Ethereum, for example). In the main window, open the site and connect account S. **Expect:** "Your wallet is on another network. SatStake runs on Arc.", a "Switch to Arc" control, and every write action disabled with the reason shown.
9. **UJ-03, alternate.** Press "Switch to Arc" and decline in the wallet. **Expect:** "You cancelled the request in your wallet. Nothing was sent.", in neutral styling, and writes stay disabled with the reason visible. Press it again and accept. **Expect:** the wallet is on Arc mainnet (it adds the network first if it does not know it) and writes become available.
10. **UJ-02, alternate 2.** Disconnect the site in the wallet, reload, press Connect, and reject the request in the wallet. **Expect:** the page returns to its state before, with "You cancelled the connection in your wallet." and no error styling. Connect again with S and accept. **Expect:** the shortened address of S is shown.
11. **UJ-04.** Switch the wallet to account R and open "New promise". Pick cirBTC. **Expect:** "You have no cirBTC in this wallet. Add some, or choose another token." The "Sign it" button stays disabled and says what is still to complete; pressing it shows the failures and no wallet prompt appears.
12. **UJ-18.** Switch back to S. On "New promise", look at the statement above the button. **Expect:** it must be ticked to sign, and it reads: "I understand that the referee alone decides whether I kept this promise. If the referee marks it broken, or has not marked it kept by the deadline, my stake goes to the beneficiary and cannot be recovered." Beside the beneficiary field: "This address receives your stake if the promise is broken or missed. If nobody controls it, the stake is lost for good."
13. **UJ-14.** On "New promise", write the promise "test the walkthrough, kept" in the heading's field. Below it, the pad shows an empty signature line. On the pad: USDC, amount 0.5, referee R, beneficiary B, deadline "1 day". Tick the statement and press "Sign it with $0.50 in USDC". **Expect:** "Your wallet may ask twice", then "Step 1 of 2: let SatStake take 0.5 USDC" and "Step 2 of 2: create the promise". Approve the exact amount in the wallet, then reject the creation prompt. **Expect:** every field keeps its value, "Your approval of 0.5 USDC is confirmed and stays in place, so trying again asks your wallet once.", and "You cancelled the request in your wallet. Nothing was sent." in neutral styling, and the signature line is still empty.
14. **UJ-13, UJ-11, UJ-71.** Press "Sign it with $0.50 in USDC" again. **Expect:** one wallet prompt only, for the creation. Confirm it. **Expect:** progress and still no signature while the network confirms; then, on the same page, a handwritten "SatStake" signs the line once, followed by the panel: "Promise #… · signed", "Signed in transaction" with the hash, "Promise number", "Send this link to your referee and your beneficiary" with "Copy the link to this promise", and "Open the promise". Note the number as **P1**.
15. **UJ-11.** Press "Make another promise" and create a second USDC promise of 0.5, "test the walkthrough, broken", referee R, beneficiary B, deadline "1 day", approving and confirming both prompts. **Expect:** "Step 1 of 2" for the approval and "Step 2 of 2" for the creation, then the signature and the panel. Note the number as **P2**. A verdict needs the deadline still ahead, which "1 day" leaves plenty of; a Kept or Broken promise can be paid out at any time after.
16. **UJ-22.** Open P1 ("Open the promise" or `#/p/<P1>`) connected as S. **Expect:** "You made this promise", "(you)" beside the staker, and no verdict controls. Switch to R. **Expect:** "You judge this promise", "Was this promise kept?" with "Kept" and "Broken". Switch to B. **Expect:** "You get the stake if it is broken or missed" and no actions while the promise is open.
17. **UJ-24, UJ-30.** Open P1 in the visitor window too. In the main window as R, press "Kept" and confirm in the wallet. **Expect:** in the main window, the transaction hash, then "You marked this promise kept." and the state "Kept"; in the visitor window, "Kept" within a few seconds, with no reload.
18. **UJ-31.** On P2 as R, press "Broken". **Expect:** an inline step, "Mark this promise broken?", saying the stake will go to the beneficiary, B, and "Your verdict cannot be changed.", and no wallet prompt. Press "Cancel". **Expect:** nothing is sent, focus returns to "Broken". Press "Broken" again, then "Mark it broken", and confirm in the wallet. **Expect:** "You marked this promise broken." and the state "Broken".
19. **UJ-23.** As S, open "My promises". **Expect:** P2 then P1 then any older promises of S, newest first, each with its promise, amount, deadline, your role ("You made it"), and its state.

## Part C. The demo video (LLR-SB-003)

At most 90 seconds, in this order: UJ-10, UJ-42, UJ-40. Prepare it first, then record.

20. **Prepare UJ-42.** As S, create a USDC promise of 0.5, "run 5 km before the deadline", referee R, beneficiary B, deadline "2 minutes", the shortest preset. Do not mark it. Note its number as **P3** and wait until its clock shows the deadline passed and the state "No answer by the deadline".
21. **Prepare UJ-40.** P1 is Kept from step 17; it is the promise to pay back on camera.
22. **Record UJ-10.** Start recording on the home page, connected as S. Press "Write your own ↗", which opens "New promise". Write "ship the SatStake demo", pick cirBTC, enter 0.000005 (the button reads "Sign it with 500 sats of cirBTC"), referee R, beneficiary B, deadline "7 days", tick the statement, press the button, approve, confirm. **Expect:** once the creation confirms, the "SatStake" signature writes itself on the line, then the panel with the promise number and its share link.
23. **Record UJ-42.** Open P3 as B. **Expect:** no verdict by the deadline, so the page offers "Send payout" with "Anyone can send this. The full stake goes only to the beneficiary." Press it and confirm. **Expect:** "Done. The stake was sent to the beneficiary." and the state "Paid out"; B's USDC balance is up by 0.5 less the network fee (the explorer shows a transfer of exactly 0.5).
24. **Record UJ-40.** Open P1 as S. **Expect:** "Send payout" with "Anyone can send this. The full stake goes only to the staker." Press it and confirm. **Expect:** "Done. The stake was sent to the staker." and the state "Paid back". Stop recording.
25. **Pay out P2** with "Send payout" (any account; the stake goes to the beneficiary), so no walkthrough promise is left with a stake in it except the week-long cirBTC promise from step 22, which stays open as a live example.

## Part D. After the walkthrough

26. **UJ-84.** Confirm the site you used was the mainnet build: step 1 showed "Live on Arc mainnet", "Arc" with "Chain 5042", and the address above.
27. Record the result. For each step, Pass or the defect seen. If every step passed, tell the agent so it can mark the walkthrough journeys Pass in `docs/ACCEPTANCE.md`, then submit on DoraHacks with the text in `docs/SUBMISSION.md` and the video.
