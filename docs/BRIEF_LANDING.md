# Brief: landing page and app structure

Status: proposal, 2026-10-05, for the UI restyle. Content and structure only; theme comes later. Nothing here is a requirement yet. Each change it implies goes into 02, 04, or 05 first, with a change-log row, before any code (06 section 10). Section 9 lists them.

Why this exists: the current home page explains the contract, not the product. Someone landing on it, Liam included, could not say what SatStake is for. The North Star's first success criterion is that a grant reviewer understands the product within 10 seconds of landing (NS 9).

## 1. Who lands where

| Visitor | Arrives at | Wants to know in the first screen |
|---|---|---|
| Grant reviewer | Home, from DoraHacks | What is it, is it real and on mainnet, why Arc, is it well built |
| Curious person | Home | Is this for me, what does it cost, what do I need |
| Referee | **A pledge link a friend sent** | Why am I here, what am I asked to do, by when, what do I need |
| Beneficiary | A pledge link | Why am I named, could money come to me, do I have to do anything |
| Staker | Home, then the app | How do I make one, how do I share it, where are my promises |

The pledge page is the second front door. Referees and beneficiaries meet SatStake there first, never on the home page, so it must explain itself to a stranger.

## 2. Split the site in two

**Landing** (`#/`, `#/about`): explains and convinces. No wallet needed. Its header: logo, How it works, Why Arc, FAQ, and one button, "Open the app".

**App** (`#/mine`, `#/create`, `#/p/:id`): does things. Its header: logo, My promises, New promise, and the wallet control. `#/mine` is the app's home and the place a connected user returns to.

Hash routes stay, so nothing changes about hosting. The pledge page belongs to the app but must read fully without a wallet (P6).

## 3. Words

- Say **promise** to people. Keep "pledge" for the contract and the code.
- Say **stake** once, explained the first time it appears: "the money you put down".
- Say **referee**, explained once: "a friend you choose, who confirms whether you kept it".
- Say **who gets it if you miss** before using "beneficiary"; use "beneficiary" only where space is short.
- Show USDC amounts as dollars ("$20 in USDC"). Show cirBTC in sats with the cirBTC amount beside it. No dollar value for cirBTC: that needs a price feed, and oracles are a non-goal (NS 8).
- "Sats" is explained once on the landing page: "a sat is the smallest unit of Bitcoin".

## 4. Landing page, section by section

### 4.1 Hero

- Eyebrow: **Live on Arc mainnet**
- Heading: **Make promises that cost something to break.**
- Lead: **Lock money against a promise and name a friend to judge it. Keep it and you get your sats back. Miss it and they go to someone else.**
- Primary button: **Make a promise**. Secondary link: **See a live promise**.
- Visual: a real promise card, read live from mainnet (the seeded pledge #4): the promise in quotes, the stake, the countdown, the three people, the state. The product is its own hero image.

The heading is new; the second half of the lead is the North Star sentence. Changing what NS section 1 calls "the one sentence" is a North Star decision (see section 9).

### 4.2 How it works, with one example running through it

One person, one promise, three steps. The example is shown, not described.

1. **Promise and lock.** "Alex promises: *I'll run three times this week.* Alex locks $20 and picks Sunday 9 pm as the deadline."
2. **A friend judges.** "Alex names Sam as referee. Before Sunday 9 pm, Sam marks the promise kept or broken. Only Sam can."
3. **The money moves.** "Kept: the $20 goes back to Alex. Broken, or no answer from Sam by the deadline: it goes to the person Alex chose, Alex's brother Jo."

### 4.3 Three endings

Three cards, the core rule at a glance:

| Kept | Broken | No answer by the deadline |
|---|---|---|
| Your stake comes back to you | It goes to the person you chose | It goes to the person you chose |

Under them: "Silence counts as broken, so ask your referee to confirm in time." (P3)

### 4.4 What people use it for

Four short cards: **Habits** (run, write, study), **Between friends** (a friendly bet, settled by a third friend), **For a cause** (name a charity's address as the one who gets it if you miss), **Work** (ship by Friday, your manager as referee). Each one line.

### 4.5 Why you can trust it

- **No one holds your money.** It sits in a public contract, and only the rules move it: back to you, or to the person you chose. (P1)
- **No owner, no fees, no admin.** Not even the person who built it can touch a promise. (P2)
- **Anyone can check.** Every promise is public and readable without a wallet. The source code is verified. (P6)
- Live figures: promises made (`pledgeCount`) and amount locked now (`totalLocked` per token).
- One honest line, linked to About: "The referee is trusted by you, and Circle can pause its tokens. Read the limits." (NS 7, P7)

### 4.6 Why Arc (for builders and reviewers)

The North Star sentence, unchanged: "SatStake uses cirBTC as the stake, USDC as gas so a $5 promise costs cents to make, and Arc's deterministic finality so a forfeit is final the moment it lands." Then three short items: Bitcoin as the stake (cirBTC), fees paid in USDC (cents, no second token), settlement final when it lands.

### 4.7 For reviewers

A compact strip: contract address with copy, verified on Sourcify and the explorer, four seeded mainnet promises (one in each ending) linked, the GitHub repository, "built test first, every requirement traced", and the demo video.

### 4.8 Questions

- **What do I need?** A browser wallet on Arc with some USDC. Fees are paid in USDC and cost cents.
- **What if my referee disappears?** If they do not confirm by the deadline, the stake goes to the person you chose. Pick someone who will answer.
- **Can I cancel or change a promise?** No. Once made, only the referee's verdict or the deadline decides it.
- **Does SatStake charge anything?** No. Only Arc's network fee.
- **Who can see my promise?** Anyone with the link. It is public on the blockchain.
- **Is it audited?** No. It is tested, with every requirement traced to a test, but not audited.

### 4.9 Closing call and footer

"Ready to put something on it?" with **Make a promise**. Footer: About and limits, GitHub, contract on the explorer, "Built for Arc".

## 5. The pledge page, explaining itself

Shown above the promise, chosen by who is looking:

| Viewer | Banner |
|---|---|
| Not connected | "This is a promise on SatStake. *Alex* locked $20 and asked a friend to judge it. What is this?" (link to the landing page) |
| Referee | "You are the referee. Before *Sunday 9 pm*, confirm whether this promise was kept. If you do not answer, the stake goes to the beneficiary." |
| Staker | "Your promise. Send this link to your referee: they confirm it here." with a copy-link button |
| Beneficiary | "If this promise is broken or not confirmed by *Sunday 9 pm*, the stake comes to you." |

Names here are addresses on chain; the page shows them shortened. Then:

- The promise, large, in quotes.
- The stake, in dollars or sats.
- A three-step timeline: **Made**, **Judged**, **Paid out**, with the current step marked and the countdown under it.
- The three people with plain roles: "Made the promise", "Judges it", "Gets it if missed".
- The one action this viewer can take, if any, as a single clear button.

## 6. My promises (`#/mine`), the app's home

- A summary line: "3 active, $45 at stake, 2 kept" for the connected account.
- **Needs you** first: promises where this account can act now. As referee, awaiting a verdict, with the countdown and the two buttons inline. As staker, kept and ready to withdraw. As beneficiary, ready to claim.
- **In progress**: active promises waiting on someone else, each with its countdown and who it waits on.
- **Finished**: settled promises, with where the money went.
- Each card: the promise, the amount, your role, the state, and one action if there is one.
- Empty state: "You have not made or been named in a promise yet." with **Make a promise**.

Every figure comes from reads the app already makes (`pledgeIdsOf`, `getPledge`, `stateOf`); nothing needs an indexer.

## 7. New promise (`#/create`)

The form is sound; two changes of framing:

- Show a live preview card beside the form, the same card the share page will show, filling in as the user types.
- After creation, lead with sharing: "Done. Now send this link to Sam, your referee." with copy and the link shown in full.

## 8. Not proposed, and why

- **Notifications** (email, push): a non-goal (NS 8); the share link is the only channel, which is why section 7 puts it first.
- **Dollar values for cirBTC**: needs a price feed (NS 8 non-goal).
- **Accounts or profiles**: non-goal; the wallet is the identity.

## 9. What this changes upstream, before any code

| Change | Where |
|---|---|
| Hero heading above the one sentence, or a new one sentence | NS section 1 (a North Star decision), LLR-FE-070 |
| Landing sections 4.2 to 4.9 | LLR-FE-070, LLR-FE-071 |
| Landing and app headers; "Open the app" | LLR-FE-013 |
| User-facing word "promise" for "pledge" | 05 section 2.2 messages, LLR-FE-040, LLR-FE-050, every view's copy |
| Pledge page banners and timeline | LLR-FE-040, LLR-FE-041 |
| My promises grouped by "Needs you", summary line | LLR-FE-050 |
| Create preview card and share-first confirmation | LLR-FE-037 |
| README hero and submission text, to match | LLR-SB-001, LLR-SB-002 |

Scope and time: about one frontend group with its review round, roughly a day and a half. The walkthrough moves to about October 8 or 9, inside the October 10 limit; the hackathon deadline is October 14.
