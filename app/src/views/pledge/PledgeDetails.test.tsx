import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalTime } from "../../format";
import { ROLE_STATEMENTS } from "../roles";
import { STATE_NAMES } from "../stateLabels";
import {
  BENEFICIARY,
  REFEREE,
  STAKER,
  advance,
  cirbtc,
  openPledge,
  statusLine,
  statusRegion,
  usdc,
  signature,
  warningArea,
} from "../../test/pledgeHarness";
import { ACCOUNT, network, shortOf, teardownWallets } from "../../test/walletHarness";
import { REFEREE_WARNING, STAKER_WARNING } from "./warning";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
  teardownWallets();
});

const main = () => within(screen.getByRole("main"));
/** The promise inside the heading. It is the page's loaded marker, so a test waits on it before reading the rest. */
const promiseTitle = () => main().findByText(/^“/, { selector: ".ptitle" });
/** The stake as the agreement's first line gives it. */
const stakeAmount = () => document.querySelector(".doc ol li strong") as HTMLElement;
const deadlineText = () => (document.querySelector(".pledge-deadline time") as HTMLElement).textContent;
/** The clock's own words for the time left, without their lead, and its note while chain time is unknown. */
const dayLine = () => document.querySelector(".clock-card .day") as HTMLElement | null;
const timeLeft = () => dayLine()!.textContent!.replace(/^Deadline in /, "");
const clockHeading = () => document.querySelector(".clock-card .state h3")!.textContent;
const banner = () => screen.getByRole("note");

describe("LLR-FE-040 the pledge page shows the pledge", () => {
  it("shows the heading and only the reading message until the pledge is read", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "getPledge" ? new Promise<void>(() => {}) : undefined);
      },
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Promise #1");
    expect(statusLine().textContent).toContain("Reading the promise");
    expect(stakeAmount()).toBeNull();
    expect(document.querySelector(".ptitle")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("titles the document Promise #id | SatStake", async () => {
    await openPledge();
    await promiseTitle();
    expect(document.title).toBe("Promise #1 | SatStake");
  });

  it("puts the promise in quotes inside the one heading, so heading navigation reads the promise", async () => {
    await openPledge({ promise: "Run 5 km every week until December." });
    const promise = await promiseTitle();
    expect(promise.textContent).toBe("“Run 5 km every week until December.”");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.contains(promise)).toBe(true);
    expect(heading.textContent).toMatch(/^Promise #1/);
    expect(screen.getByRole("heading", { level: 1, name: /^Promise #1/ })).toBe(heading);
    expect(heading.textContent).toContain("Run 5 km every week until December.");
  });

  it("shows the promise as plain text, never as markup", async () => {
    await openPledge({ promise: "<b>bold</b> <img src=x onerror=alert(1)>" });
    const promise = await promiseTitle();
    expect(promise.textContent).toBe("“<b>bold</b> <img src=x onerror=alert(1)>”");
    expect(promise.querySelector("b, img")).toBeNull();
  });

  it("keeps a one-word promise and a 280-byte promise with no spaces whole, in one element", async () => {
    const long = "x".repeat(280);
    await openPledge({ promise: long });
    expect((await promiseTitle()).textContent).toBe(`“${long}”`);
    teardownWallets();
    await openPledge({ promise: "Run" });
    expect((await promiseTitle()).textContent).toBe("“Run”");
  });

  it("gives the three parties a signature line each, labelled differently", async () => {
    await openPledge();
    await promiseTitle();
    const labels = [...document.querySelectorAll(".sig b")].map((b) => b.textContent);
    expect(labels).toEqual(["Staker", "Referee", "Beneficiary"]);
    expect(document.querySelectorAll(".sig")).toHaveLength(3);
  });

  it("shows the stake with its token's symbol", async () => {
    await openPledge({ token: usdc.address, amount: 5_000_000n });
    await promiseTitle();
    expect(stakeAmount().textContent).toContain("USDC");
    expect(stakeAmount().textContent).toContain("5");
    expect(main().queryByText(/smallest unit of Bitcoin/)).toBeNull();
  });

  it("shows a cirBTC stake with its value in sats as well, and says what a sat is", async () => {
    await openPledge({ token: cirbtc.address, amount: 10_000n });
    await promiseTitle();
    expect(stakeAmount().textContent).toMatch(/^10,000 sats\b/);
    expect(stakeAmount().textContent).toContain("cirBTC");
    expect(stakeAmount().textContent).not.toContain("$");
    expect(main().getByText(/A sat is the smallest unit of Bitcoin/)).toBeTruthy();
  });

  it("says in words what the number is, in the agreement's first line", async () => {
    await openPledge({ token: usdc.address, amount: 5_000_000n });
    await promiseTitle();
    expect(document.querySelector(".doc ol li")?.textContent).toMatch(/locks \$5 in USDC in the contract/);
  });

  it("copes with the largest and the smallest amounts in both tokens", async () => {
    const huge = 2n ** 128n;
    await openPledge({ token: usdc.address, amount: huge });
    await promiseTitle();
    expect(stakeAmount().textContent).toMatch(/^\$[\d,]+(\.\d+)? in USDC$/);
    teardownWallets();
    await openPledge({ token: cirbtc.address, amount: 1n });
    await promiseTitle();
    expect(stakeAmount().textContent).toMatch(/^1 sat, 0\.00000001/);
  });

  it("shows the deadline in the visitor's local time", async () => {
    const { pledge } = await openPledge();
    await promiseTitle();
    expect(deadlineText()).toBe(formatLocalTime(pledge.deadline));
    expect(document.querySelector(".pledge-deadline time")?.getAttribute("datetime")).toBe(
      new Date(Number(pledge.deadline) * 1000).toISOString(),
    );
  });

  it("shows each party shortened, with a copy control and an explorer link that name whose they are", async () => {
    await openPledge();
    await promiseTitle();
    for (const [label, noun, address] of [
      ["Staker", "staker", STAKER],
      ["Referee", "referee", REFEREE],
      ["Beneficiary", "beneficiary", BENEFICIARY],
    ] as const) {
      const row = within(signature(label));
      expect(row.getByText(shortOf(address)).getAttribute("title")).toBe(address);
      expect(row.getByRole("button", { name: `Copy the ${noun}'s address` })).toBeTruthy();
      const link = row.getByRole("link", { name: `View on explorer, the ${noun}` });
      expect(link.getAttribute("href")).toBe(`${network.explorerUrl}/address/${address}`);
    }
  });

  it("states the outcome in the banner and the timeline, with no separate state badge", async () => {
    for (const state of [0, 1, 2, 3, 4, 5]) {
      await openPledge({ state, secondsLeft: state === 1 ? -10n : 500_000n });
      await promiseTitle();
      expect(document.querySelector(".state-badge")).toBeNull();
      teardownWallets();
    }
  });

  it("keeps the status sentence in the page for assistive technology, starting with the state name, and hides it from view while the banner is shown", async () => {
    await openPledge({ state: 4 });
    await promiseTitle();
    expect(statusLine().textContent!.startsWith(STATE_NAMES.SettledToStaker.split(" ")[0]!)).toBe(true);
    expect(statusRegion().className).toContain("visually-hidden");
    expect(statusRegion().getAttribute("role")).toBe("status");
  });

  it("shows the status sentence while the promise is still being read, since no banner explains the page yet", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "stateOf" ? new Promise<void>(() => {}) : undefined);
      },
    });
    await promiseTitle();
    expect(statusRegion().className).not.toContain("visually-hidden");
    expect(statusLine().textContent).toContain("Reading the promise");
  });

  it("does not name the parties by their contract role in the status sentence", async () => {
    for (const state of [0, 1, 2, 3, 4, 5]) {
      await openPledge({ state, secondsLeft: state === 1 ? -10n : 500_000n });
      await promiseTitle();
      expect(statusLine().textContent).not.toMatch(/staker|referee|beneficiary/i);
      teardownWallets();
    }
  });

  it("says the deadline has passed, not that a verdict is awaited, when chain time is past it and the poll still says Active", async () => {
    await openPledge({ secondsLeft: -5n });
    await screen.findByText(/The deadline has passed/, { selector: "[role=status] p" });
    expect(statusLine().textContent).not.toContain("Waiting for the");
  });

  it("keeps the live status region apart from the text that takes focus", async () => {
    await openPledge();
    await promiseTitle();
    expect(statusRegion().getAttribute("tabindex")).toBeNull();
    expect(statusLine().getAttribute("tabindex")).toBe("-1");
    expect(statusLine().getAttribute("role")).toBeNull();
    expect(statusLine().parentElement).toBe(statusRegion());
  });

  it("shows the countdown for Active and Expired pledges only", async () => {
    for (const [state, shown] of [[0, true], [1, true], [2, false], [3, false], [4, false], [5, false]] as const) {
      await openPledge({ state, secondsLeft: state === 1 ? -10n : 500_000n });
      await promiseTitle();
      expect(dayLine() !== null).toBe(shown);
      teardownWallets();
    }
  });

  it("reads Deadline passed for an Expired pledge whatever the clock says, with an all-zero face", async () => {
    await openPledge({ state: 1, secondsLeft: 500_000n });
    await promiseTitle();
    expect(timeLeft()).toBe("Deadline passed");
  });
});

describe("LLR-FE-040 the clock section names the state and the stages the promise went through", () => {
  const stages = () => [...document.querySelectorAll(".clock-card .chain span")].map((span) => span.textContent);
  const current = () => [...document.querySelectorAll(".clock-card .chain span.on")].map((span) => span.textContent);

  it("names each derived state in the words of the design", async () => {
    const expected = [
      [0, "Open"],
      [1, "No answer"],
      [2, "Kept"],
      [3, "Broken"],
      [4, "Paid back"],
      [5, "Paid out"],
    ] as const;
    for (const [state, name] of expected) {
      await openPledge({ state, secondsLeft: state === 1 ? -10n : 500_000n });
      await promiseTitle();
      expect(clockHeading(), `state ${state}`).toBe(name);
      teardownWallets();
    }
  });

  it("lists Open alone while open, with it marked as the current stage", async () => {
    await openPledge();
    await promiseTitle();
    expect(stages()).toEqual(["Open"]);
    expect(current()).toEqual(["Open"]);
  });

  it("goes on to the verdict, or to no answer, once there is one, and marks it as the current stage", async () => {
    for (const [state, last] of [[1, "No answer"], [2, "Kept"], [3, "Broken"]] as const) {
      await openPledge({ state, secondsLeft: state === 1 ? -10n : 500_000n });
      await promiseTitle();
      expect(stages(), `state ${state}`).toEqual(["Open", last]);
      expect(current()).toEqual([last]);
      teardownWallets();
    }
  });

  it("marks the payout as where it ended, and does not claim a verdict after a payout to the beneficiary", async () => {
    await openPledge({ state: 5 });
    await promiseTitle();
    expect(stages()).toEqual(["Open", "Paid out"]);
    expect(current()).toEqual(["Paid out"]);
    expect(document.querySelector(".clock-card .bubble")).toBeNull();
    teardownWallets();
    await openPledge({ state: 4 });
    await promiseTitle();
    expect(stages()).toEqual(["Open", "Kept", "Paid back"]);
  });

  it("marks only the deadline on the timeline, since the contract records no verdict or payout day", async () => {
    await openPledge({ state: 2 });
    await promiseTitle();
    expect([...document.querySelectorAll(".clock-card .mk")].map((m) => m.textContent)).toEqual(["deadline"]);
  });

  it("says it is checking, and not that there was no answer, when chain time is past the deadline and the poll still says Active", async () => {
    await openPledge({ secondsLeft: -5n });
    await screen.findByText("Deadline passed", { selector: ".clock-card .day" });
    expect(clockHeading()).toBe("Checking");
    expect(document.querySelector(".clock-card .state")!.textContent).not.toMatch(/No answer|Silence counts/);
    expect(document.querySelector(".clock-card .state")!.textContent).toContain("Checking the network for the outcome");
  });

  it("does not say it is checking while the deadline is ahead, or once the state has been read as Expired", async () => {
    await openPledge({ secondsLeft: 500_000n });
    await promiseTitle();
    expect(clockHeading()).toBe("Open");
    teardownWallets();
    await openPledge({ state: 1, secondsLeft: -10n });
    await promiseTitle();
    expect(clockHeading()).toBe("No answer");
  });

  it("gives the stake and the three parties to the diagram, shortened, and names the money's place", async () => {
    await openPledge({ amount: 2_500_000n });
    await promiseTitle();
    const card = within(document.querySelector(".clock-card") as HTMLElement);
    expect(card.getByText("$2.50 in USDC")).toBeTruthy();
    for (const address of [STAKER, REFEREE, BENEFICIARY]) expect(card.getByText(shortOf(address))).toBeTruthy();
  });

  it("is a still picture: no scenarios, no slider, no example label", async () => {
    await openPledge();
    await promiseTitle();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /Says/ })).toBeNull();
    expect(document.querySelector(".clock-card")!.textContent).not.toMatch(/example/i);
  });
});

describe("LLR-FE-040 the banner says what this page means for whoever is looking", () => {
  const shortStaker = shortOf(STAKER);
  const shortReferee = shortOf(REFEREE);
  const shortBeneficiary = shortOf(BENEFICIARY);

  it("explains the promise to a visitor: who locked what, who judges it, where the money goes, and a link to what SatStake is", async () => {
    await openPledge({ who: "none", token: usdc.address, amount: 20_000_000n });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toContain("SatStake");
    expect(text).toContain(shortStaker);
    expect(text).toContain("USDC");
    expect(text).toContain(shortReferee);
    expect(text).toContain(shortBeneficiary);
    expect(banner().querySelector("em")?.textContent).toBe(deadlineText());
    expect(text).toMatch(new RegExp(`Kept, the money goes back to ${shortStaker}`));
    const link = within(banner()).getByRole("link", { name: "What is SatStake?" });
    expect(link.getAttribute("href")).toBe("#/");
  });

  it("gives an account with no part in the promise the visitor text too", async () => {
    await openPledge({ who: "other" });
    await promiseTitle();
    expect(banner().getAttribute("data-variant")).toBe("open-visitor");
  });

  it("tells the referee who asked, to decide by the deadline, that the answer is final and that silence counts as broken", async () => {
    await openPledge({ who: "referee" });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toContain(shortStaker);
    expect(text).toMatch(/final/i);
    expect(text).toMatch(/silence counts as broken/i);
    expect(text).toMatch(/fee/i);
    expect(text).not.toMatch(/the staker|the referee/i);
    expect(banner().querySelector("em")?.textContent).toBe(deadlineText());
  });

  it("tells the staker to send the link to the judge, that nobody is notified, and offers the copy control", async () => {
    await openPledge({ who: "staker" });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toContain(shortReferee);
    expect(text).toMatch(/notify/i);
    expect(banner().querySelector("em")?.textContent).toBe(deadlineText());
    expect(within(banner()).getByRole("button", { name: "Copy the link to this promise" })).toBeTruthy();
  });

  it("offers the copy control to the staker alone", async () => {
    for (const who of ["referee", "beneficiary", "other", "none"] as const) {
      await openPledge({ who });
      await promiseTitle();
      expect(screen.queryByRole("button", { name: "Copy the link to this promise" })).toBeNull();
      teardownWallets();
    }
  });

  it("tells the beneficiary what they are named for, with the deadline, and that nothing is asked of them yet", async () => {
    await openPledge({ who: "beneficiary" });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toMatch(/broken or there is no answer by/);
    expect(banner().querySelector("em")?.textContent).toBe(deadlineText());
    expect(text).toContain(shortStaker);
    expect(text).toMatch(/do not need to do anything/i);
  });

  it("says where the stake goes once the promise is kept, with an addition for the person who made it", async () => {
    await openPledge({ state: 2, who: "none" });
    await promiseTitle();
    expect(banner().textContent).toContain(shortStaker);
    expect(banner().textContent).not.toMatch(/withdraw/i);
    teardownWallets();
    await openPledge({ state: 2, who: "staker" });
    await promiseTitle();
    expect(banner().textContent).toContain(shortOf(ACCOUNT));
    expect(banner().textContent).toMatch(/withdraw/i);
  });

  it("says where the stake goes once the promise is marked broken, with an addition for the person who gets it", async () => {
    await openPledge({ state: 3, who: "referee" });
    await promiseTitle();
    expect(banner().textContent).toContain(shortBeneficiary);
    expect(banner().textContent).not.toMatch(/yourself/i);
    teardownWallets();
    await openPledge({ state: 3, who: "beneficiary" });
    await promiseTitle();
    expect(banner().textContent).toContain(shortOf(ACCOUNT));
    expect(banner().textContent).toMatch(/yourself/i);
  });

  it("says there was no answer by the deadline and who gets the stake, and tells the referee they can no longer give a verdict", async () => {
    await openPledge({ state: 1, secondsLeft: -10n, who: "none" });
    await promiseTitle();
    expect(banner().textContent).toMatch(/no answer/i);
    expect(banner().textContent).toContain(shortBeneficiary);
    expect(banner().textContent).not.toMatch(/no longer give a verdict/);
    teardownWallets();
    await openPledge({ state: 1, secondsLeft: -10n, who: "referee" });
    await promiseTitle();
    expect(banner().textContent).toContain("You can no longer give a verdict.");
  });

  it("claims neither an answer nor a recipient when chain time is past the deadline and the poll still says Active", async () => {
    await openPledge({ secondsLeft: -5n, who: "beneficiary" });
    await screen.findByText(/The deadline has passed/, { selector: ".pledge-banner p" });
    const text = banner().textContent ?? "";
    expect(text).not.toMatch(/no answer/i);
    expect(text).not.toContain(shortBeneficiary);
    expect(text).not.toContain(shortStaker);
    expect(text).not.toMatch(/send it/i);
    expect(text).not.toMatch(/decide/i);
  });

  it("says where the stake went once it is paid, naming the recipient and linking no transaction", async () => {
    await openPledge({ state: 4 });
    await promiseTitle();
    expect(banner().textContent).toContain(shortStaker);
    expect(banner().textContent).not.toContain(shortBeneficiary);
    expect(within(banner()).queryByRole("link")).toBeNull();
    teardownWallets();
    await openPledge({ state: 5 });
    await promiseTitle();
    expect(banner().textContent).toContain(shortBeneficiary);
    expect(banner().textContent).not.toContain(shortStaker);
  });

  // LLR-FE-072: focus lands on the heading after a route change or the skip link, and a screen reader reads on
  // from there, so the banner and the staker's copy control must come after it.
  it("comes after the page heading, where focus lands", async () => {
    await openPledge({ who: "staker" });
    const heading = await screen.findByRole("heading", { level: 1 });
    await promiseTitle();
    expect(heading.compareDocumentPosition(banner()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is not a live region, so the status line keeps that job", async () => {
    await openPledge({ who: "referee" });
    await promiseTitle();
    expect(banner().closest("[aria-live], [role=status], [role=alert]")).toBeNull();
    expect(banner().getAttribute("aria-live")).toBeNull();
  });

  it("shows no banner until the pledge is read", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "stateOf" ? new Promise<void>(() => {}) : undefined);
      },
    });
    await promiseTitle();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("LLR-FE-041 the connected account's role is marked", () => {
  it.each([
    ["staker", "Staker"],
    ["referee", "Referee"],
    ["beneficiary", "Beneficiary"],
  ] as const)("marks the %s with a badge in plain words and (you) on their signature line", async (who, label) => {
    await openPledge({ who });
    await promiseTitle();
    expect(main().getByText(ROLE_STATEMENTS[who]).className).toContain("role-badge");
    expect(within(signature(label)).getByText("(you)")).toBeTruthy();
    expect(document.body.textContent!.match(/\(you\)/g)).toHaveLength(1);
    expect(within(signature(label)).getByText(shortOf(ACCOUNT))).toBeTruthy();
    for (const other of ["Staker", "Referee", "Beneficiary"] as const) {
      if (other !== label) expect(signature(other).textContent).not.toContain("(you)");
    }
  });

  it("marks nothing for an account with no part in the promise", async () => {
    await openPledge({ who: "other" });
    await promiseTitle();
    for (const statement of Object.values(ROLE_STATEMENTS)) expect(main().queryByText(statement)).toBeNull();
    expect(document.querySelector(".role-badge")).toBeNull();
    expect(document.body.textContent).not.toContain("(you)");
  });

  it("marks nothing when no wallet is connected", async () => {
    await openPledge({ who: "none" });
    await promiseTitle();
    for (const statement of Object.values(ROLE_STATEMENTS)) expect(main().queryByText(statement)).toBeNull();
    expect(document.querySelector(".role-badge")).toBeNull();
    expect(document.body.textContent).not.toContain("(you)");
  });
});

describe("LLR-FE-012 the countdown follows chain time and ticks every second", () => {
  it("shows the time left as days and hours, in the visitor's reading", async () => {
    await openPledge({ secondsLeft: 2n * 86_400n + 4n * 3600n + 5n });
    await main().findByText("Deadline in 2 days 4 hours");
  });

  it("counts down once a second from the chain's latest block, with no further reading needed", async () => {
    vi.useFakeTimers();
    const { chain } = await openPledge({ secondsLeft: 125n, fakeTimers: true });
    await advance(0);
    expect(timeLeft()).toBe("2 minutes 5 seconds");
    const reads = chain.count("eth_getBlockByNumber");
    await advance(1000);
    expect(timeLeft()).toBe("2 minutes 4 seconds");
    await advance(2000);
    expect(timeLeft()).toBe("2 minutes 2 seconds");
    expect(chain.count("eth_getBlockByNumber")).toBe(reads);
  });

  it("switches to hours and minutes, then seconds, then Deadline passed as the time runs out", async () => {
    vi.useFakeTimers();
    await openPledge({ secondsLeft: 3601n, fakeTimers: true });
    await advance(0);
    expect(timeLeft()).toBe("1 hour 0 minutes");
    await advance(2000);
    expect(timeLeft()).toBe("59 minutes 59 seconds");
  });

  it("reads Deadline passed when the countdown reaches zero, and the pledge shows the deadline message", async () => {
    vi.useFakeTimers();
    await openPledge({ secondsLeft: 3n, fakeTimers: true });
    await advance(0);
    expect(timeLeft()).toBe("3 seconds");
    await advance(3000);
    expect(timeLeft()).toBe("Deadline passed");
    expect(statusLine().textContent).toBe("The deadline has passed. Updating the status from the network.");
  });

  it("says the time is being read until the clock has synced", async () => {
    vi.useFakeTimers();
    await openPledge({
      fakeTimers: true,
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.method === "eth_getBlockByNumber" ? new Promise<void>((resolve) => setTimeout(resolve, 5000)) : undefined);
      },
    });
    await advance(100);
    expect(timeLeft()).toBe("Reading the time from the network");
    await advance(5000);
    expect(timeLeft()).not.toBe("Reading the time from the network");
  });

  it("stops ticking when the page is left", async () => {
    vi.useFakeTimers();
    await openPledge({ secondsLeft: 125n, fakeTimers: true });
    await advance(0);
    const timers = vi.getTimerCount();
    window.location.hash = "#/about";
    await advance(0);
    expect(vi.getTimerCount()).toBeLessThan(timers);
  });
});

describe("LLR-FE-012 the countdown is the clock section's own line, said in words", () => {
  const LIVE = "[aria-live], [role=status], [role=alert], [role=timer]";

  it("reads the two largest units, with its lead", async () => {
    await openPledge({ secondsLeft: 2n * 86_400n + 4n * 3600n + 12n * 60n + 9n });
    await main().findByText("Deadline in 2 days 4 hours");
    expect(dayLine()!.textContent).toBe("Deadline in 2 days 4 hours");
  });

  it("is not in a live region, so it is not announced every second", async () => {
    await openPledge({ secondsLeft: 500n });
    await main().findByText(/^Deadline in /, { selector: ".day" });
    expect(dayLine()!.closest(LIVE)).toBeNull();
    expect(document.querySelector(".clock-card")!.closest(LIVE)).toBeNull();
    expect(document.querySelector(".clock-card [aria-live]")).toBeNull();
  });

  it("says the time is being read, and nothing else, until the clock has synced", async () => {
    vi.useFakeTimers();
    await openPledge({
      fakeTimers: true,
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.method === "eth_getBlockByNumber" ? new Promise<void>((resolve) => setTimeout(resolve, 5000)) : undefined);
      },
    });
    await advance(100);
    expect(dayLine()!.textContent).toBe("Reading the time from the network");
    expect(dayLine()!.className).not.toContain("visually-hidden");
  });

  it("reads Deadline passed once the deadline has passed", async () => {
    await openPledge({ secondsLeft: -5n });
    await screen.findByText("Deadline passed", { selector: ".day" });
  });

  it("treats exactly zero seconds left as passed", async () => {
    await openPledge({ secondsLeft: 0n });
    await screen.findByText("Deadline passed", { selector: ".day" });
  });

  it("shows an Expired pledge as passed before the clock has synced, since the state alone says so", async () => {
    vi.useFakeTimers();
    await openPledge({
      state: 1,
      fakeTimers: true,
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.method === "eth_getBlockByNumber" ? new Promise<void>((resolve) => setTimeout(resolve, 5000)) : undefined);
      },
    });
    await advance(100);
    expect(timeLeft()).toBe("Deadline passed");
  });

  it("shows an Expired pledge as passed whatever the clock says", async () => {
    await openPledge({ state: 1, secondsLeft: 500_000n });
    await promiseTitle();
    expect(timeLeft()).toBe("Deadline passed");
  });

  it("keeps days uncapped", async () => {
    await openPledge({ secondsLeft: 123n * 86_400n });
    await main().findByText("Deadline in 123 days 0 hours");
  });

  it("puts the knob where chain time is between creation and the deadline", async () => {
    await openPledge({ secondsLeft: 500_000n });
    await promiseTitle();
    const left = (document.querySelector(".clock-card .knob") as HTMLElement).style.left;
    expect(parseFloat(left)).toBeGreaterThan(0);
    expect(parseFloat(left)).toBeLessThan(70);
  });
});

describe("LLR-FE-043 the warning under 10 minutes", () => {
  const warningText = () => warningArea().textContent;

  it("is in the page from the first render, empty, so it is announced when it fills", async () => {
    await openPledge({ who: "referee" });
    expect(warningText()).toBe("");
  });

  it("warns the referee under 10 minutes", async () => {
    await openPledge({ who: "referee", secondsLeft: 599n });
    await screen.findByText(REFEREE_WARNING);
    expect(warningArea().textContent).toBe(REFEREE_WARNING);
  });

  it("warns the staker under 10 minutes, in the staker's words", async () => {
    await openPledge({ who: "staker", secondsLeft: 599n });
    await screen.findByText(STAKER_WARNING);
  });

  it("does not warn at exactly 10 minutes", async () => {
    await openPledge({ who: "referee", secondsLeft: 600n });
    await promiseTitle();
    await main().findByText("Deadline in 10 minutes 0 seconds");
    expect(warningText()).toBe("");
  });

  it("does not warn the beneficiary, another account, or a visitor", async () => {
    for (const who of ["beneficiary", "other", "none"] as const) {
      await openPledge({ who, secondsLeft: 100n });
      await promiseTitle();
      expect(warningText()).toBe("");
      teardownWallets();
    }
  });

  it("does not warn once the deadline has passed", async () => {
    await openPledge({ who: "referee", secondsLeft: -1n });
    await promiseTitle();
    expect(warningText()).toBe("");
  });

  it("does not warn for a pledge that is not Active", async () => {
    await openPledge({ who: "referee", state: 2, secondsLeft: 100n });
    await promiseTitle();
    expect(warningText()).toBe("");
  });

  it("appears when the countdown crosses 10 minutes, with no new reading", async () => {
    vi.useFakeTimers();
    await openPledge({ who: "referee", secondsLeft: 601n, fakeTimers: true });
    await advance(0);
    expect(warningArea().textContent).toBe("");
    await advance(2000);
    expect(warningArea().textContent).toBe(REFEREE_WARNING);
  });

  it("is styled as a warning and not as an error", async () => {
    await openPledge({ who: "referee", secondsLeft: 100n });
    await screen.findByText(REFEREE_WARNING);
    const text = screen.getByText(REFEREE_WARNING);
    expect(text.className).toContain("pledge-warning");
    expect(text.className).not.toContain("notice-failure");
  });
});
