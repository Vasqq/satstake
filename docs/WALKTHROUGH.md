# Walkthrough

LLR-VV-010. An end-user script on the mainnet site for every journey that `docs/ACCEPTANCE.md` marks for a walkthrough step (WT). Liam performs it once, in order. Each step says what to do and what must happen. A step whose result differs from what is written is a defect: stop, note the step number and what was seen, and do not submit.

Site: https://vasqq.github.io/satstake/ (the mainnet build). Contract: `0xEbcda489EB528c573E9a190eB8EfE63b44d9204e` on Arc mainnet, chain 5042.

## Before you start

- **A browser wallet with three accounts**, all yours, used only for this: **S** (staker), **R** (referee), **B** (beneficiary). The Foundry burners are not used here; their keys stay in their keystores. If an account needs funding, send it from your own funds; every stake below returns to S or goes to B, so the cost is network fees only, a few cents.
- **Funds on Arc mainnet:** S holds about 2 USDC and about 600 sats of cirBTC (0.000006 cirBTC). R holds about 0.1 USDC and B about 0.05 USDC, for network fees: on Arc the fee is paid in USDC, so B cannot claim a stake without some.
- **A second browser window** with no wallet connected, or a private window, for the visitor's view.
- **Screen recording** for the demo video, part C. Parts A and B do not need to be recorded.
- The site's network check needs the RPC to answer. If the page says the network cannot be reached, wait a minute and reload.

## Part A. Without a wallet

1. **UJ-01, UJ-70.** In the visitor window, open the site. **Expect:** the heading "Lock Bitcoin against a promise." with "Keep it and you get your sats back. Miss it and they go to someone else." under it, three steps, and a proof panel with the network, the full contract address with a copy control, a Sourcify link, an explorer link, and a live pledge count of at least 4. No wallet prompt appears.
2. **UJ-70.** Open the Sourcify link, then the explorer link. **Expect:** Sourcify shows SatStake verified with an exact match at the address above; the explorer shows the contract with verified source.
3. **UJ-01, UJ-20, UJ-85.** Back on the site, open the example pledge. **Expect:** the promise as the main text, the stake with its symbol (cirBTC also in sats), the staker, referee, and beneficiary each labelled with copy and explorer controls, the deadline in your local time, a countdown, and the state Active. This is seeded pledge #4, Active until 2026-11-01.
4. **UJ-85.** Change the address bar to `#/p/1`, then `#/p/2`, then `#/p/3`. **Expect:** #1 Settled to staker, #2 Settled to beneficiary (it expired with no verdict), #3 Settled to beneficiary (marked broken). None offers an action.
5. **UJ-21.** Open `#/p/999999`. **Expect:** "This pledge does not exist. Check the link." and a link home.
6. **UJ-92.** On pledge #1, look at every address and transaction hash shown. **Expect:** each has a copy control beside its explorer link.
7. **UJ-02, alternate 1.** Open the site in a browser profile with no extensions installed (a new guest profile in Chrome, for example), and open Create. **Expect:** a sentence saying a browser wallet is needed; every page still reads.

## Part B. With the wallet

8. **UJ-03.** In the wallet, switch to any network other than Arc (Ethereum, for example). In the main window, open the site and connect account S. **Expect:** a message that the wallet is on another network, a "Switch to Arc" control, and every write action disabled with a visible reason.
9. **UJ-03, alternate.** Press the switch control and decline in the wallet. **Expect:** writes stay disabled, the reason stays visible, no error styling. Press it again and accept. **Expect:** the wallet is on Arc mainnet (it adds the network first if it does not know it) and writes become available.
10. **UJ-02, alternate 2.** Disconnect the site in the wallet, reload, press Connect, and reject the request in the wallet. **Expect:** the page returns to its state before, with a neutral message and no error styling. Connect again with S and accept. **Expect:** the shortened address of S is shown.
11. **UJ-04.** Switch the wallet to account R and open Create. Pick cirBTC. **Expect:** the form shows R's cirBTC balance of zero and blocks submission with a plain explanation, and no wallet prompt appears when you press submit.
12. **UJ-18.** Switch back to S. On Create, look at the statement above submit. **Expect:** it must be ticked to submit, and it reads: "I understand that the referee alone decides whether I kept this promise. If the referee marks it broken, or has not marked it kept by the deadline, my stake goes to the beneficiary and cannot be recovered."
13. **UJ-14.** Fill the form for a USDC pledge of 0.5 USDC: promise "Walkthrough: kept", referee R, beneficiary B, deadline "1 day". Tick the statement and submit. Approve the exact amount in the wallet, then reject the creation prompt. **Expect:** every field keeps its value, the confirmed approval stays shown, and a neutral message says nothing else changed.
14. **UJ-13, UJ-11, UJ-71.** Submit the same form again. **Expect:** one wallet prompt only, for the creation, since the approval from step 13 already covers the amount. Confirm it. **Expect:** progress, then the new pledge's page in state Active with a copy-link control. Note its number as **P1**.
15. **UJ-11.** Create a second USDC pledge of 0.5 USDC, promise "Walkthrough: broken", referee R, beneficiary B, deadline "1 day", approving and confirming both prompts. **Expect:** numbered progress for the approval and the creation, then its page, Active. Note its number as **P2**. A verdict needs the deadline still ahead, which "1 day" leaves plenty of; a Kept or Broken pledge can be settled at any time after.
16. **UJ-22.** On P1, connected as S. **Expect:** a staker badge, "(you)" beside the staker, and no verdict controls. Switch to R. **Expect:** a referee badge and two controls, Kept and Broken. Switch to B. **Expect:** a beneficiary badge and no actions while the pledge is Active.
17. **UJ-24, UJ-30.** Open P1 in the visitor window too. In the main window as R, press Kept and confirm in the wallet. **Expect:** in the main window, progress then the state Kept; in the visitor window, Kept within a few seconds, with no reload.
18. **UJ-31.** On P2 as R, press Broken. **Expect:** a dialog saying where the stake goes and that the verdict is final. Press Cancel. **Expect:** nothing is sent, focus returns to Broken. Press Broken again, then "Mark it broken", and confirm in the wallet. **Expect:** the state Broken.
19. **UJ-23.** As S, open My pledges. **Expect:** P2 then P1 then any older pledges of S, newest first, each with its promise, amount, deadline, your role, and its state.

## Part C. The demo video (LLR-SB-003)

At most 90 seconds, in this order: UJ-10, UJ-42, UJ-40. Prepare it first, then record.

20. **Prepare UJ-42.** As S, create a USDC pledge of 0.5 USDC, promise "Run 5 km before the deadline", referee R, beneficiary B, deadline "2 minutes", the shortest preset. Do not mark it. Note its number as **P3** and wait until its countdown reaches zero.
21. **Prepare UJ-40.** P1 is Kept from step 17; it is the pledge to withdraw on camera.
22. **Record UJ-10.** Start recording on the home page. As S, open Create, write "Ship the SatStake demo", pick cirBTC, enter 0.000005 (the form shows 500 sats), referee R, beneficiary B, a deadline a week out, tick the statement, submit, approve, confirm. **Expect:** the new pledge's page, Active, with its copy-link control.
23. **Record UJ-42.** Open P3 as B. **Expect:** the deadline passed with no verdict, so the page offers "Claim stake". Press it and confirm. **Expect:** the state Settled to beneficiary, and B's USDC balance up by 0.5 less the network fee (the explorer shows the transfer of exactly 0.5).
24. **Record UJ-40.** Open P1 as S. **Expect:** "Withdraw my stake". Press it and confirm. **Expect:** the state Settled to staker. Stop recording.
25. **Settle P2** (as S or R the control reads "Send stake to beneficiary", as B "Claim stake"), so no walkthrough pledge is left with a stake in it except the week-long cirBTC pledge from step 22, which stays Active as a live example.

## Part D. After the walkthrough

26. **UJ-84.** Confirm the site you used was the mainnet build: the proof panel in step 1 showed "Arc, chain 5042" and the address above.
27. Record the result. For each step, Pass or the defect seen. If every step passed, tell the agent so it can mark the walkthrough journeys Pass in `docs/ACCEPTANCE.md`, then submit on DoraHacks with the text in `docs/SUBMISSION.md` and the video.
