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

describe("LLR-FE-040 the pledge page shows the pledge", () => {
  it("shows the heading and only the reading message until the pledge is read", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "getPledge" ? new Promise<void>(() => {}) : undefined);
      },
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pledge #1");
    expect(statusLine().textContent).toContain("Reading the pledge");
    expect(main().queryByText("Stake", { selector: "dt" })).toBeNull();
    expect(document.querySelector(".pledge-promise")).toBeNull();
  });

  it("shows the promise as the main text after the heading", async () => {
    await openPledge({ promise: "Run 5 km every week until December." });
    const promise = await main().findByText("Run 5 km every week until December.");
    expect(promise.className).toContain("pledge-promise");
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.compareDocumentPosition(promise) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the promise as plain text, never as markup", async () => {
    await openPledge({ promise: "<b>bold</b> <img src=x onerror=alert(1)>" });
    const promise = await main().findByText("<b>bold</b> <img src=x onerror=alert(1)>");
    expect(promise.querySelector("b, img")).toBeNull();
  });

  it("labels the six facts as the brief does", async () => {
    await openPledge();
    await main().findByText("Stake", { selector: "dt" });
    const labels = [...document.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(labels).toEqual(["Stake", "Deadline", "Time left", "Staker", "Referee", "Beneficiary"]);
  });

  it("shows the stake with its token's symbol", async () => {
    await openPledge({ token: usdc.address, amount: 5_000_000n });
    await main().findByText("Stake", { selector: "dt" });
    expect(fact("Stake").textContent).toBe("5 USDC");
  });

  it("shows a cirBTC stake with its value in sats as well", async () => {
    await openPledge({ token: cirbtc.address, amount: 10_000n });
    await main().findByText("Stake", { selector: "dt" });
    expect(fact("Stake").textContent).toBe("0.0001 cirBTC (10,000 sats)");
  });

  it("shows the deadline in the visitor's local time", async () => {
    const { pledge } = await openPledge();
    await main().findByText("Stake", { selector: "dt" });
    expect(fact("Deadline").textContent).toBe(formatLocalTime(pledge.deadline));
  });

  it("shows each party shortened, with a copy control and an explorer link that name whose they are", async () => {
    await openPledge();
    await main().findByText("Stake", { selector: "dt" });
    for (const [label, noun, address] of [
      ["Staker", "staker", STAKER],
      ["Referee", "referee", REFEREE],
      ["Beneficiary", "beneficiary", BENEFICIARY],
    ] as const) {
      const row = within(fact(label));
      expect(row.getByText(shortOf(address)).getAttribute("title")).toBe(address);
      expect(row.getByRole("button", { name: `Copy the ${noun}'s address` })).toBeTruthy();
      const link = row.getByRole("link", { name: `View the ${noun} on the explorer` });
      expect(link.getAttribute("href")).toBe(`${network.explorerUrl}/address/${address}`);
    }
  });

  it("shows the state as a badge carrying its name, and the meaning in the status line", async () => {
    await openPledge({ state: 4 });
    await main().findByText("Stake", { selector: "dt" });
    const badge = document.querySelector(".state-badge") as HTMLElement;
    expect(badge.textContent).toBe("Settled to staker");
    expect(badge.getAttribute("data-state")).toBe("SettledToStaker");
    expect(statusLine().textContent).toBe("Settled. The stake was returned to the staker.");
  });

  it("shows no state badge before the state is read", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "stateOf" ? new Promise<void>(() => {}) : undefined);
      },
    });
    await main().findByText("Stake", { selector: "dt" });
    expect(document.querySelector(".state-badge")).toBeNull();
  });

  it("says the deadline has passed, not that a verdict is awaited, when chain time is past it and the poll still says Active", async () => {
    await openPledge({ secondsLeft: -5n });
    await screen.findByText("The deadline has passed. Updating the status from the network.");
    expect(statusLine().textContent).not.toContain("Waiting for the referee");
    expect(document.querySelector(".state-badge")?.textContent).toBe("Active");
  });

  it("shows the Time left row for Active and Expired pledges only", async () => {
    for (const [state, shown] of [[0, true], [1, true], [2, false], [3, false], [4, false], [5, false]] as const) {
      await openPledge({ state, secondsLeft: state === 1 ? -10n : 500_000n });
      await main().findByText("Deadline", { selector: "dt" });
      expect(main().queryByText("Time left", { selector: "dt" }) !== null).toBe(shown);
      teardownWallets();
    }
  });

  it("reads Deadline passed for an Expired pledge whatever the clock says", async () => {
    await openPledge({ state: 1, secondsLeft: 500_000n });
    await main().findByText("Time left", { selector: "dt" });
    expect(fact("Time left").textContent).toBe("Deadline passed");
  });
});

describe("LLR-FE-041 the connected account's role is marked", () => {
  it.each([
    ["staker", "You are the staker", "Staker"],
    ["referee", "You are the referee", "Referee"],
    ["beneficiary", "You are the beneficiary", "Beneficiary"],
  ] as const)("marks the %s with a badge by the heading and (you) on their row", async (who, badge, label) => {
    await openPledge({ who });
    await main().findByText("Stake", { selector: "dt" });
    expect(main().getByText(badge).className).toContain("role-badge");
    expect(fact(label).textContent).toContain("(you)");
    for (const other of ["Staker", "Referee", "Beneficiary"]) {
      if (other !== label) expect(fact(other).textContent).not.toContain("(you)");
    }
    expect(within(fact(label)).getByText(shortOf(ACCOUNT))).toBeTruthy();
  });

  it("marks nothing for an account with no part in the pledge", async () => {
    await openPledge({ who: "other" });
    await main().findByText("Stake", { selector: "dt" });
    expect(main().queryByText(/You are the/)).toBeNull();
    expect(document.body.textContent).not.toContain("(you)");
  });

  it("marks nothing when no wallet is connected", async () => {
    await openPledge({ who: "none" });
    await main().findByText("Stake", { selector: "dt" });
    expect(main().queryByText(/You are the/)).toBeNull();
    expect(document.body.textContent).not.toContain("(you)");
  });
});

describe("LLR-FE-012 the countdown follows chain time and ticks every second", () => {
  it("shows the time left as days and hours, in the visitor's reading", async () => {
    await openPledge({ secondsLeft: 2n * 86_400n + 4n * 3600n + 5n });
    await main().findByText("2 days 4 hours");
  });

  it("counts down once a second from the chain's latest block, with no further reading needed", async () => {
    vi.useFakeTimers();
    const { chain } = await openPledge({ secondsLeft: 125n, fakeTimers: true });
    await advance(0);
    expect(fact("Time left").textContent).toBe("2 minutes 5 seconds");
    const reads = chain.count("eth_getBlockByNumber");
    await advance(1000);
    expect(fact("Time left").textContent).toBe("2 minutes 4 seconds");
    await advance(2000);
    expect(fact("Time left").textContent).toBe("2 minutes 2 seconds");
    expect(chain.count("eth_getBlockByNumber")).toBe(reads);
  });

  it("switches to hours and minutes, then seconds, then Deadline passed as the time runs out", async () => {
    vi.useFakeTimers();
    await openPledge({ secondsLeft: 3601n, fakeTimers: true });
    await advance(0);
    expect(fact("Time left").textContent).toBe("1 hour 0 minutes");
    await advance(2000);
    expect(fact("Time left").textContent).toBe("59 minutes 59 seconds");
  });

  it("reads Deadline passed when the countdown reaches zero, and the pledge shows the deadline message", async () => {
    vi.useFakeTimers();
    await openPledge({ secondsLeft: 3n, fakeTimers: true });
    await advance(0);
    expect(fact("Time left").textContent).toBe("3 seconds");
    await advance(3000);
    expect(fact("Time left").textContent).toBe("Deadline passed");
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
    expect(fact("Time left").textContent).toBe("Reading the time from the network");
    await advance(5000);
    expect(fact("Time left").textContent).not.toBe("Reading the time from the network");
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
    await main().findByText("Stake", { selector: "dt" });
    await main().findByText("10 minutes 0 seconds");
    expect(warningText()).toBe("");
  });

  it("does not warn the beneficiary, another account, or a visitor", async () => {
    for (const who of ["beneficiary", "other", "none"] as const) {
      await openPledge({ who, secondsLeft: 100n });
      await main().findByText("Stake", { selector: "dt" });
      expect(warningText()).toBe("");
      teardownWallets();
    }
  });

  it("does not warn once the deadline has passed", async () => {
    await openPledge({ who: "referee", secondsLeft: -1n });
    await main().findByText("Stake", { selector: "dt" });
    expect(warningText()).toBe("");
  });

  it("does not warn for a pledge that is not Active", async () => {
    await openPledge({ who: "referee", state: 2, secondsLeft: 100n });
    await main().findByText("Stake", { selector: "dt" });
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
