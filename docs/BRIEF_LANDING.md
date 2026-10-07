# Brief: landing page and app structure

Status: version 2, 2026-10-05, accepted on 2026-10-07: 05 v1.26 and NS v1.2 carry its changes, and the requirements name its texts. Content and structure only; the theme is the dark design approved on 2026-10-06. Each change it implies goes into 02, 04, or 05 first, with a change-log row, before any code (06 section 10). Section 9 lists them. Version 2 applies an independent content review (Sonnet): a shorter page, two overclaims removed, and pledge-page banners rewritten for someone arriving cold.

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

**Landing** (`#/`, `#/about`): explains and convinces. No wallet needed. Its header: logo, How it works, FAQ, About, and one button, "Open the app".

**App** (`#/mine`, `#/create`, `#/p/:id`): does things. Its header: logo, My promises, New promise, and the wallet control. `#/mine` is the app's home and the place a connected user returns to.

Hash routes stay, so nothing changes about hosting. The pledge page belongs to the app but must read fully without a wallet (P6).

## 3. Words

- **Money** in the hero; **stake** inside the product, explained the first time: "the money you put down". Never "funds".
- **Promise** to people; "pledge" stays in the contract and the code. The 05 section 2.2 messages change first, since LLR-FE-060 requires them verbatim.
- **Referee**, explained in the hero and the first step: "a friend you choose, who confirms whether you kept it".
- **The person you named** (or "who gets it if you miss") before "beneficiary"; use "beneficiary" only where space is short, and never unexplained on the pledge page.
- **cirBTC** is called "Bitcoin-backed cirBTC" at least once above the fold; never "Bitcoin" alone, since it is Circle's token, not Bitcoin itself.
- **Amounts:** USDC as dollars ("$20 in USDC"); cirBTC in sats with the cirBTC amount beside it ("1,000 sats, 0.00001 cirBTC"), with a short hint on first appearance: "a sat is the smallest unit of Bitcoin". No dollar value for cirBTC, and no total that adds the two tokens: that needs a price feed, and oracles are a non-goal (NS 8).
- **People on chain are addresses.** The pledge page shows a shortened address, never a name. Example names (Alex, Sam, Jo) appear on the landing page only.

## 4. Landing page

Target: about four screens. Hero; how it works, with the three endings; trust; for reviewers; questions; closing.

### 4.1 Hero

- Eyebrow: **Live on Arc mainnet** (shown only once the mainnet site is published; it links to the contract on the explorer)
- Heading: **Put money behind your promise.**
- Lead: **Lock USDC or Bitcoin-backed cirBTC against something you said you would do. A friend you choose confirms whether you kept it. Kept, and your money comes back. Missed, or no answer by the deadline, and it goes to the person you named.**
- Primary button: **Make a promise**. Secondary link: **See a live promise**.
- Under the buttons, one line: **You need a browser wallet on Arc with a little USDC for network fees.** (links to the "What do I need" answer)
- Visual: a real promise card read live from mainnet (seeded pledge #4): the promise in quotes, the stake, the countdown, and the three people labelled **Made it**, **Judges it**, **Gets it if missed**. The product is its own hero image.

The North Star's one sentence ("Lock Bitcoin against a promise. Keep it and you get your sats back. Miss it and they go to someone else.") stays the project's tagline in the README and the submission. Moving it off the landing heading is a North Star decision (section 9).

### 4.2 How it works

One example runs through all three steps, then the three endings, then what to know before starting.

1. **Promise and lock.** Alex promises: *I'll run three times this week.* Alex locks $20 in USDC, picks Sunday 9 pm as the deadline, and names a brother, Jo, to receive it if the promise is missed.
2. **Share and judge.** Alex sends the promise's link to Sam, the referee. SatStake sends no messages; the link is how Sam finds it. Before Sunday 9 pm, Sam marks it kept or broken. Only Sam can mark it, and once marked it is final.
3. **The money moves.** Anyone can then send the stake where the rules say:

| Kept | Broken | No answer by the deadline |
|---|---|---|
| Back to Alex | To Jo | To Jo |

Under the table: **Silence counts as broken, so make sure your referee answers in time.** (P3, P4)

One line of uses under it: *People use it for habits, friendly bets, work deadlines, or a donation to a cause if they miss.*

**Before you start:** a promise cannot be cancelled or changed once made, and every promise is public.

### 4.3 Why you can trust it

- **Rules, not people, move the money.** After a promise is made, the stake can only go back to you or to the person you named, by the rules above. (P1)
- **No owner, no fees, no admin.** Not even the builder can touch a promise. (P2)
- **Anyone can check.** Every promise is public and readable without a wallet, and the source code is verified. (P6)
- **What it cannot do, said plainly:** your referee is trusted by you and could judge you unfairly. Circle, which issues USDC and cirBTC, can pause a token or block an address, which can hold a payout until it is lifted. It is tested, not audited. (NS 7, P7; the full list on About)
- Live figures: promises made (`pledgeCount`), and the amount locked now, each token on its own line (`totalLocked`).

### 4.4 For reviewers

One compact strip, lower on the page:

- **Why Arc**, the North Star sentence unchanged: "SatStake uses cirBTC as the stake, USDC as gas so a $5 promise costs cents to make, and Arc's deterministic finality so a forfeit is final the moment it lands."
- The contract address with copy, verified on Sourcify and the explorer.
- The four example promises on mainnet, one in each ending, labelled **examples made by the builder** so they do not read as users.
- The GitHub repository: "built test first, every requirement traced to its test".
- The demo video.

### 4.5 Questions

- **What do I need?** A browser wallet with the Arc network added, and some USDC on Arc: fees are paid in USDC and cost cents. Links: the official Arc page for adding the network, and Circle's page for getting USDC (the builder picks the exact pages from docs.arc.io and circle.com before publishing).
- **What if my referee does not answer?** After the deadline the referee can no longer answer, and the stake goes to the person you named. Pick someone who will reply.
- **Can I cancel or change a promise?** No. Only the referee's verdict or the deadline decides it.
- **Does SatStake charge anything?** No. Only Arc's network fee, a few cents in USDC.
- **Who can see my promise?** Anyone. Promises are public on the blockchain, with or without the link. Do not write anything private in one.

### 4.6 Closing and footer

"Ready to put something on it?" with **Make a promise**. Footer: About and limits, GitHub, the contract on the explorer, "Built on Arc".

## 5. The pledge page, explaining itself

A banner above the promise, chosen by who is looking and by the state. Each viewer has at most one role: the contract refuses a staker who names themselves as referee or beneficiary, and a referee who is also the beneficiary (D-08). `0x12ab…9f` stands for the shortened address shown.

**While the promise is open (before the deadline, no verdict):**

| Viewer | Banner |
|---|---|
| Not connected, or connected with no role | "This is a promise made with SatStake. `0x12ab…9f` locked $20 and promised to *run three times this week*. A friend judges it by *Sunday 9 pm*. Kept, the money goes back; otherwise it goes to `0x34cd…77`." Link: **What is SatStake?** |
| Referee | "`0x12ab…9f` named you the referee. By *Sunday 9 pm*, decide: was this promise kept? Your answer is final. The stake never passes through you. Silence counts as broken. Answering needs a wallet on Arc with a few cents of USDC for the network fee." |
| Staker | "Your promise. Send this link to your referee, `0x56ef…10`: they answer here, and SatStake does not notify them. Silence counts as broken, so make sure they answer before the deadline." With a copy-link button. |
| Beneficiary | "You were named to receive this stake if the promise is broken or not confirmed by *Sunday 9 pm*. If it is kept, it goes back to the maker. You do not need to do anything now." |

**After a verdict, or once the deadline has passed:**

| State | Banner, for everyone, with the role's addition |
|---|---|
| Kept, not yet sent | "Kept. The stake goes back to `0x12ab…9f`; anyone can send it now." Staker: "Withdraw it when you like." |
| Broken, not yet sent | "Marked broken. The stake goes to `0x34cd…77`; anyone can send it now." Beneficiary: "You can send it to yourself now." |
| Deadline passed, no verdict | "The deadline passed with no answer, so this promise counts as broken. The stake goes to `0x34cd…77`; anyone can send it now." Referee: "The deadline has passed, so a verdict can no longer be given." |
| Settled | "Done. The stake went to `0x…`." with the transaction link. |

Then:

- The promise, large, in quotes.
- The stake, in dollars or sats as section 3 says.
- A three-step timeline: **Made**, **Judged**, **Paid out**, with the current step marked and the countdown under it.
- The three people, each with the plain role ("Made it", "Judges it", "Gets it if missed") and copy and explorer controls.
- The one action this viewer can take, if any, as a single clear button.

## 6. My promises (`#/mine`), the app's home

- A summary in counts only: "3 open, 2 kept, 1 broken". No money total, since USDC and cirBTC cannot be added.
- **Needs you** first: promises where this account can act now. As referee, awaiting a verdict, with the countdown and the two buttons inline. As staker, kept and ready to withdraw. As the named receiver, broken or expired and ready to send on. The verb matches the pledge page.
- **In progress**: open promises waiting on someone else, each with its countdown and who it waits on.
- **Finished**: settled promises, with where the stake went.
- Each card: the promise, the amount per its token, your role, the state, and one action if there is one.
- Empty state: "You have not made a promise or been named in one yet." With **Make a promise**, and: "If a friend named you, open the link they sent."

Every figure comes from reads the app already makes (`pledgeIdsOf`, `getPledge`, `stateOf`); nothing needs an indexer.

## 7. New promise (`#/create`)

The form stays; three changes:

- Beside the beneficiary field, the North Star warning as visible text: "This address receives your stake if you miss. If nobody controls it, the stake is lost for good." (NS 7)
- After creation, lead with sharing: "Done. Now send this link to your referee, `0x56ef…10`. SatStake does not notify them." With the link in full and a copy button.
- Optional, cut first if time is short: a live preview of the share card beside the form.

## 8. Not proposed, and why

- **Notifications** (email, push): a non-goal (NS 8). The share link is the only channel, and the page says so.
- **Dollar values for cirBTC, or money totals across tokens**: need a price feed (NS 8 non-goal).
- **Accounts, profiles, names**: non-goal; the wallet is the identity.
- **Testimonials or user counts**: the product is new, and invented proof would be dishonest. The live counters and the labelled example promises are the honest equivalent.

## 9. What this changes upstream, before any code

| Change | Where |
|---|---|
| Landing heading "Put money behind your promise." in place of the one sentence on the home page; the one sentence stays the tagline elsewhere | NS section 1 and 12 (a North Star decision), LLR-FE-070 |
| Landing sections 4.2 to 4.6, including the honest limits beside the trust claims | LLR-FE-070, LLR-FE-071 |
| Landing and app headers; "Open the app" | LLR-FE-013 |
| User-facing word "promise" for "pledge" | 05 section 2.2 messages, LLR-FE-040, LLR-FE-050, every view's copy |
| Pledge page banners by role and state, and the timeline | LLR-FE-040, LLR-FE-041 |
| My promises grouped by "Needs you", counts summary | LLR-FE-050 |
| Beneficiary warning on the form, share-first confirmation | LLR-FE-034, LLR-FE-037 |
| README hero and submission text, to match | LLR-SB-001, LLR-SB-002 |

Scope and time: about one frontend group with its review round, roughly a day and a half. The walkthrough moves to about October 8 or 9, inside the October 10 limit; the hackathon deadline is October 14.
