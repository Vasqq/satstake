import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalTime } from "../../format";
import {
  BENEFICIARY,
  REFEREE,
  STAKER,
  advance,
  cirbtc,
  fact,
  openPledge,
  statusLine,
  statusRegion,
  usdc,
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
/** The promise's title element. It is the page's loaded marker, so a test waits on it before reading the rest. */
const promiseTitle = () => main().findByText(/^“/, { selector: "p" });
const stakeAmount = () => document.querySelector(".stake-amount") as HTMLElement;
const deadlineText = () => (document.querySelector(".pledge-deadline time") as HTMLElement).textContent;
/** The accessible words of the countdown, without their "Time left: " lead, and the visible note while the clock is unsynced. */
const timeLeft = () => document.querySelector(".clock-words")!.textContent!.replace(/^Time left: /, "");
const banner = () => screen.getByRole("note");

describe("LLR-FE-040 the pledge page shows the pledge", () => {
  it("shows the heading and only the reading message until the pledge is read", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "getPledge" ? new Promise<void>(() => {}) : undefined);
      },
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Promise #1");
    expect(statusLine().textContent).toContain("Reading the pledge");
    expect(stakeAmount()).toBeNull();
    expect(document.querySelector(".pledge-promise")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("titles the document Promise #id | SatStake", async () => {
    await openPledge();
    await promiseTitle();
    expect(document.title).toBe("Promise #1 | SatStake");
  });

  it("shows the promise large, in quotes, after the heading", async () => {
    await openPledge({ promise: "Run 5 km every week until December." });
    const promise = await promiseTitle();
    expect(promise.textContent).toBe("“Run 5 km every week until December.”");
    expect(promise.className).toContain("pledge-promise");
    expect(promise.className).toContain("ptitle");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.compareDocumentPosition(promise) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("labels the three parties by what they did, in the order made, judges, gets", async () => {
    await openPledge();
    await promiseTitle();
    const labels = [...document.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(labels).toEqual(["Made it", "Judges it", "Gets it if missed"]);
  });

  it("shows the stake with its token's symbol", async () => {
    await openPledge({ token: usdc.address, amount: 5_000_000n });
    await promiseTitle();
    expect(stakeAmount().textContent).toBe("$5 in USDC");
    expect(document.querySelector(".stake small")).toBeNull();
  });

  it("shows a cirBTC stake with its value in sats as well, and says what a sat is", async () => {
    await openPledge({ token: cirbtc.address, amount: 10_000n });
    await promiseTitle();
    expect(stakeAmount().textContent).toBe("10,000 sats, 0.0001 cirBTC");
    expect(document.querySelector(".stake small")?.textContent).toBe("a sat is the smallest unit of Bitcoin");
  });

  it("says in words what the number is, for a reader who hears it without the layout", async () => {
    await openPledge({ token: usdc.address, amount: 5_000_000n });
    await promiseTitle();
    expect(document.querySelector(".stake")?.textContent).toContain("Stake: $5 in USDC");
  });

  it("copes with the largest and the smallest amounts in both tokens", async () => {
    const huge = 2n ** 128n;
    await openPledge({ token: usdc.address, amount: huge });
    await promiseTitle();
    expect(stakeAmount().textContent).toMatch(/^\$[\d,]+(\.\d+)? in USDC$/);
    teardownWallets();
    await openPledge({ token: cirbtc.address, amount: 1n });
    await promiseTitle();
    expect(stakeAmount().textContent).toBe("1 sat, 0.00000001 cirBTC");
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
      ["Made it", "staker", STAKER],
      ["Judges it", "referee", REFEREE],
      ["Gets it if missed", "beneficiary", BENEFICIARY],
    ] as const) {
      const row = within(fact(label));
      expect(row.getByText(shortOf(address)).getAttribute("title")).toBe(address);
      expect(row.getByRole("button", { name: `Copy the ${noun}'s address` })).toBeTruthy();
      const link = row.getByRole("link", { name: `View on explorer, the ${noun}` });
      expect(link.getAttribute("href")).toBe(`${network.explorerUrl}/address/${address}`);
    }
  });

  it("shows the state as a badge carrying its plain name, and the meaning in the status line", async () => {
    await openPledge({ state: 4 });
    await promiseTitle();
    const badge = document.querySelector(".state-badge") as HTMLElement;
    expect(badge.textContent).toBe("Paid back");
    expect(badge.getAttribute("data-state")).toBe("SettledToStaker");
    expect(statusLine().textContent).toBe("Paid back. The stake went back to the staker.");
  });

  it("shows no state badge before the state is read", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "stateOf" ? new Promise<void>(() => {}) : undefined);
      },
    });
    await promiseTitle();
    expect(document.querySelector(".state-badge")).toBeNull();
  });

  it("says the deadline has passed, not that a verdict is awaited, when chain time is past it and the poll still says Active", async () => {
    await openPledge({ secondsLeft: -5n });
    await screen.findByText("The deadline has passed. Updating the status from the network.");
    expect(statusLine().textContent).not.toContain("Waiting for the referee");
    expect(document.querySelector(".state-badge")).toBeNull();
  });

  it("shows the Open badge while the deadline has not passed", async () => {
    await openPledge({ secondsLeft: 500_000n });
    await promiseTitle();
    expect(document.querySelector(".state-badge")?.textContent).toBe("Open");
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
      expect(document.querySelector(".clock-words") !== null).toBe(shown);
      expect(document.querySelector(".clock") !== null).toBe(shown);
      teardownWallets();
    }
  });

  it("reads Deadline passed for an Expired pledge whatever the clock says, with an all-zero face", async () => {
    await openPledge({ state: 1, secondsLeft: 500_000n });
    await promiseTitle();
    expect(timeLeft()).toBe("Deadline passed");
    expect(document.querySelector(".clock")?.textContent).toBe("00d00h00m00s");
  });
});

describe("LLR-FE-040 the three-step timeline", () => {
  const steps = () => [...document.querySelectorAll(".timeline li")];

  it("lists Made, Judged and Paid out with the current step marked while open", async () => {
    await openPledge();
    await promiseTitle();
    expect(steps().map((li) => li.textContent)).toEqual(["Made", "Judged", "Paid out"]);
    expect(steps().map((li) => li.getAttribute("aria-current"))).toEqual([null, "step", null]);
    expect(steps().map((li) => li.classList.contains("done"))).toEqual([true, false, false]);
  });

  it("moves the current step to Paid out once there is a verdict or the deadline passed", async () => {
    for (const state of [1, 2, 3]) {
      await openPledge({ state, secondsLeft: state === 1 ? -10n : 500_000n });
      await promiseTitle();
      expect(steps().map((li) => li.getAttribute("aria-current"))).toEqual([null, null, "step"]);
      expect(steps().map((li) => li.classList.contains("done"))).toEqual([true, true, false]);
      teardownWallets();
    }
  });

  it("marks all three done once the stake has been paid out", async () => {
    await openPledge({ state: 5 });
    await promiseTitle();
    expect(steps().map((li) => li.classList.contains("done"))).toEqual([true, true, true]);
    expect(steps().map((li) => li.getAttribute("aria-current"))).toEqual([null, null, "step"]);
  });
});

describe("LLR-FE-040 the banner says what this page means for whoever is looking", () => {
  const shortStaker = shortOf(STAKER);
  const shortReferee = shortOf(REFEREE);
  const shortBeneficiary = shortOf(BENEFICIARY);

  it("explains the promise to a visitor, with a link to what SatStake is", async () => {
    await openPledge({ who: "none", token: usdc.address, amount: 20_000_000n });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toContain("This is a promise made with SatStake.");
    expect(text).toContain(`${shortStaker} locked $20 in USDC`);
    expect(text).toContain(shortReferee);
    expect(text).toContain(`otherwise it goes to ${shortBeneficiary}`);
    const link = within(banner()).getByRole("link", { name: "What is SatStake?" });
    expect(link.getAttribute("href")).toBe("#/");
  });

  it("gives an account with no part in the pledge the visitor text too", async () => {
    await openPledge({ who: "other" });
    await promiseTitle();
    expect(banner().textContent).toContain("This is a promise made with SatStake.");
  });

  it("tells the referee to decide by the deadline, and what that costs and means", async () => {
    await openPledge({ who: "referee" });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toContain(`${shortStaker} named you the referee.`);
    expect(text).toContain("decide: was this promise kept?");
    expect(text).toContain("Your answer is final.");
    expect(text).toContain("The stake never passes through you.");
    expect(text).toContain("Silence counts as broken.");
    expect(text).toContain("a few cents of USDC");
    expect(banner().querySelector("em")?.textContent).toBe(deadlineText());
  });

  it("tells the staker to send the link to the referee, that nobody is notified, and offers the copy control", async () => {
    await openPledge({ who: "staker" });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toContain("Your promise.");
    expect(text).toContain(`Send this link to your referee, ${shortReferee}`);
    expect(text).toContain("SatStake does not notify them.");
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

  it("tells the beneficiary what they are named for and that nothing is asked of them yet", async () => {
    await openPledge({ who: "beneficiary" });
    await promiseTitle();
    const text = banner().textContent!;
    expect(text).toContain("You were named to receive this stake if the promise is broken or not confirmed by");
    expect(text).toContain(`If it is kept, it goes back to ${shortStaker}.`);
    expect(text).toContain("You do not need to do anything now.");
  });

  it("says where the stake goes once the promise is kept, with the staker's own addition", async () => {
    await openPledge({ state: 2, who: "none" });
    await promiseTitle();
    expect(banner().textContent).toBe(`Kept. The stake goes back to ${shortStaker}; anyone can send it now.`);
    teardownWallets();
    await openPledge({ state: 2, who: "staker" });
    await promiseTitle();
    expect(banner().textContent).toBe(
      `Kept. The stake goes back to ${shortOf(ACCOUNT)}; anyone can send it now. Withdraw it when you like.`,
    );
  });

  it("says where the stake goes once the promise is marked broken, with the beneficiary's own addition", async () => {
    await openPledge({ state: 3, who: "referee" });
    await promiseTitle();
    expect(banner().textContent).toBe(`Marked broken. The stake goes to ${shortBeneficiary}; anyone can send it now.`);
    teardownWallets();
    await openPledge({ state: 3, who: "beneficiary" });
    await promiseTitle();
    expect(banner().textContent).toBe(
      `Marked broken. The stake goes to ${shortOf(ACCOUNT)}; anyone can send it now. You can send it to yourself now.`,
    );
  });

  it("says there was no answer by the deadline, with the referee's own addition", async () => {
    await openPledge({ state: 1, secondsLeft: -10n, who: "none" });
    await promiseTitle();
    expect(banner().textContent).toBe(
      `The deadline passed with no answer, so this promise counts as broken. The stake goes to ${shortBeneficiary}; anyone can send it now.`,
    );
    teardownWallets();
    await openPledge({ state: 1, secondsLeft: -10n, who: "referee" });
    await promiseTitle();
    expect(banner().textContent).toContain("The deadline has passed, so a verdict can no longer be given.");
  });

  it("uses the no-answer text when chain time is past the deadline and the poll still says Active", async () => {
    await openPledge({ secondsLeft: -5n, who: "referee" });
    await screen.findByText(/The deadline passed with no answer/);
    expect(banner().textContent).not.toContain("decide: was this promise kept?");
  });

  it("says where the stake went once it is paid, naming the recipient and linking no transaction", async () => {
    await openPledge({ state: 4 });
    await promiseTitle();
    expect(banner().textContent).toBe(`Done. The stake went to ${shortStaker}.`);
    expect(within(banner()).queryByRole("link")).toBeNull();
    teardownWallets();
    await openPledge({ state: 5 });
    await promiseTitle();
    expect(banner().textContent).toBe(`Done. The stake went to ${shortBeneficiary}.`);
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
    ["staker", "You are the staker", "Made it"],
    ["referee", "You are the referee", "Judges it"],
    ["beneficiary", "You are the beneficiary", "Gets it if missed"],
  ] as const)("marks the %s with a badge and (you) on their column", async (who, badge, label) => {
    await openPledge({ who });
    await promiseTitle();
    expect(main().getByText(badge).className).toContain("role-badge");
    const term = (name: string) => main().getByText(name, { selector: "dt" });
    expect(term(label).textContent).toBe(`${label} (you)`);
    expect(fact(label).textContent).not.toContain("(you)");
    for (const other of ["Made it", "Judges it", "Gets it if missed"]) {
      if (other !== label) expect(term(other).textContent).toBe(other);
    }
    expect(within(fact(label)).getByText(shortOf(ACCOUNT))).toBeTruthy();
  });

  it("marks nothing for an account with no part in the pledge", async () => {
    await openPledge({ who: "other" });
    await promiseTitle();
    expect(main().queryByText(/You are the/)).toBeNull();
    expect(document.body.textContent).not.toContain("(you)");
  });

  it("marks nothing when no wallet is connected", async () => {
    await openPledge({ who: "none" });
    await promiseTitle();
    expect(main().queryByText(/You are the/)).toBeNull();
    expect(document.body.textContent).not.toContain("(you)");
  });
});

describe("LLR-FE-012 the countdown follows chain time and ticks every second", () => {
  it("shows the time left as days and hours, in the visitor's reading", async () => {
    await openPledge({ secondsLeft: 2n * 86_400n + 4n * 3600n + 5n });
    await main().findByText("Time left: 2 days 4 hours");
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

describe("LLR-FE-012 the countdown is a large clock with its time said in words", () => {
  it("shows four units as digits, hidden from assistive technology, with the words beside them", async () => {
    await openPledge({ secondsLeft: 2n * 86_400n + 4n * 3600n + 12n * 60n + 9n });
    await main().findByText("Time left: 2 days 4 hours");
    const clock = document.querySelector(".clock") as HTMLElement;
    expect(clock.getAttribute("aria-hidden")).toBe("true");
    expect(clock.textContent).toBe("02d04h12m09s");
    expect([...clock.children].map((c) => c.tagName)).toEqual(["SPAN", "SPAN", "SPAN", "SPAN"]);
  });

  it("is not in a live region, so it is not announced every second", async () => {
    await openPledge({ secondsLeft: 500n });
    await main().findByText(/^Time left: /);
    const words = document.querySelector(".clock-words") as HTMLElement;
    expect(words.closest("[aria-live], [role=status], [role=alert], [role=timer]")).toBeNull();
    expect(document.querySelector(".clock")!.closest("[aria-live], [role=status], [role=alert], [role=timer]")).toBeNull();
  });

  it("shows no digits, only a visible note, until the clock has synced", async () => {
    vi.useFakeTimers();
    await openPledge({
      fakeTimers: true,
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.method === "eth_getBlockByNumber" ? new Promise<void>((resolve) => setTimeout(resolve, 5000)) : undefined);
      },
    });
    await advance(100);
    expect(document.querySelector(".clock")).toBeNull();
    expect(document.querySelector(".clock-words")?.className).not.toContain("visually-hidden");
  });

  it("shows all zeros once the deadline has passed", async () => {
    await openPledge({ secondsLeft: -5n });
    await screen.findByText("Deadline passed");
    expect(document.querySelector(".clock")?.textContent).toBe("00d00h00m00s");
  });

  it("treats exactly zero seconds left as passed, with the ended face", async () => {
    await openPledge({ secondsLeft: 0n });
    await screen.findByText("Deadline passed");
    expect(document.querySelector(".clock")?.className).toContain("ended");
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
    expect(document.querySelector(".clock")?.textContent).toBe("00d00h00m00s");
  });

  it("keeps days uncapped, with as many digits as they need", async () => {
    await openPledge({ secondsLeft: 123n * 86_400n });
    await main().findByText("Time left: 123 days 0 hours");
    expect(document.querySelector(".clock")?.textContent).toBe("123d00h00m00s");
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
    await main().findByText("Time left: 10 minutes 0 seconds");
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
