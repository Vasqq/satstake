import { act, cleanup, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "viem";
import { freshChain, mountApp, network, teardownWallets } from "../test/walletHarness";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  teardownWallets();
});

// The sentence is read from the North Star so the page cannot drift from it. [D] marks it as a decision.
const northStar = readFileSync(resolve(import.meta.dirname, "../../../docs/02_NORTH_STAR.md"), "utf8");
const SENTENCES = /^## 1\. The one sentence\s+(.+?)\s*\[D\]\s*$/m.exec(northStar)![1]!.split(/(?<=\.) /);

const home = (chain = freshChain()) => mountApp({ hash: "#/", chain });
const section = (name: string) => screen.getByRole("heading", { level: 2, name }).parentElement!;

describe("LLR-FE-070 the one sentence", () => {
  it("quotes NS section 1 as three sentences", () => {
    expect(SENTENCES).toEqual([
      "Lock Bitcoin against a promise.",
      "Keep it and you get your sats back.",
      "Miss it and they go to someone else.",
    ]);
  });

  it("shows the three sentences verbatim and in order, the first as the heading", () => {
    home();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(SENTENCES[0]);
    const lead = screen.getByText(`${SENTENCES[1]} ${SENTENCES[2]}`);
    expect(lead.tagName).toBe("P");
    expect(lead.previousElementSibling).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("sets the document title to SatStake", () => {
    home();
    expect(document.title).toBe("SatStake");
  });
});

describe("LLR-FE-070 the calls to action", () => {
  it("links the create call to #/create and the example to the configured pledge", () => {
    home();
    expect(screen.getByRole("link", { name: "Create a pledge" }).getAttribute("href")).toBe("#/create");
    expect(screen.getByRole("link", { name: "See an example pledge" }).getAttribute("href")).toBe(`#/p/${network.examplePledgeId}`);
  });

  it("puts the create call before the example link", () => {
    home();
    const links = screen.getAllByRole("link").map((l) => l.textContent);
    expect(links.indexOf("Create a pledge")).toBeLessThan(links.indexOf("See an example pledge"));
  });
});

describe("LLR-FE-070 the three steps", () => {
  it("explains how it works in three steps with the brief's words", () => {
    home();
    const steps = within(section("How it works")).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]!.textContent).toBe(
      "Write a promise and lock a stake.Choose cirBTC (Circle's Bitcoin-backed token on Arc) or USDC, name a referee you trust, and pick a deadline.",
    );
    expect(steps[1]!.textContent).toBe("Your referee decides.Before the deadline, they mark the promise kept or broken. No one else can.");
    expect(steps[2]!.textContent).toBe(
      "Anyone sends the stake on.Once the referee rules or the deadline passes, anyone can send it: back to you if kept, to the beneficiary you named if broken or not confirmed in time.",
    );
    expect(section("How it works").querySelector("ol")).not.toBeNull();
  });
});

describe("LLR-FE-070 the proof panel", () => {
  it("names the network and its chain", () => {
    home();
    expect(screen.getByRole("heading", { level: 2, name: `Live on ${network.name}` })).toBeTruthy();
    expect(screen.getByText(`${network.name}, chain ${network.chainId}`)).toBeTruthy();
  });

  it("shows the whole contract address with a copy control and an explorer link", () => {
    home();
    const panel = section(`Live on ${network.name}`);
    const address = within(panel).getByText(network.contract);
    expect(address.tagName).toBe("CODE");
    expect(within(panel).getByRole("button", { name: "Copy the contract address" })).toBeTruthy();
    const link = within(panel).getByRole("link", { name: "View on explorer, the contract" });
    expect(link.getAttribute("href")).toBe(`${network.explorerUrl}/address/${network.contract}`);
  });

  it("links to the verified source on Sourcify", () => {
    home();
    const link = screen.getByRole("link", { name: "Verified on Sourcify" });
    expect(link.getAttribute("href")).toBe(`https://repo.sourcify.dev/${network.chainId}/${network.contract}`);
    expect(screen.getByText("Source code")).toBeTruthy();
  });

  it("states what Arc and the fee mean, in the brief's words", () => {
    home();
    expect(
      screen.getByText("Arc settles each transaction with deterministic, sub-second finality. Network fees are paid in USDC. SatStake charges none."),
    ).toBeTruthy();
  });

  it("shows the live pledge count after saying it is reading", async () => {
    const chain = freshChain();
    chain.addPledge(2n);
    let open = () => {};
    chain.gate = new Promise<void>((resolve) => (open = resolve));
    home(chain);
    expect(await screen.findByText("Reading")).toBeTruthy();
    expect(screen.getByText("Pledges created")).toBeTruthy();
    await act(async () => open());
    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.queryByText("Reading")).toBeNull();
    expect(chain.count("eth_call", "pledgeCount")).toBe(1);
  });

  it("shows a count of zero as 0, not as still reading", async () => {
    const chain = freshChain();
    chain.pledges.clear();
    home(chain);
    expect(await screen.findByText("0")).toBeTruthy();
    expect(screen.queryByText("Reading")).toBeNull();
  });

  it("says the count is not available when the read fails, and tries again every 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chain = freshChain();
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    home(chain);
    expect(await screen.findByText("Not available right now")).toBeTruthy();
    // A failed call is never decoded, so it is counted by method, not by function name.
    const before = chain.count("eth_call");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(chain.count("eth_call")).toBe(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(chain.count("eth_call")).toBeGreaterThan(before);
    chain.callError = undefined;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(await screen.findByText("1")).toBeTruthy();
    expect(screen.queryByText("Not available right now")).toBeNull();
  });

  it("stops asking once the count is known", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chain = freshChain();
    home(chain);
    await screen.findByText("1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(chain.count("eth_call", "pledgeCount")).toBe(1);
  });

  it("reads no logs", async () => {
    const chain = freshChain();
    home(chain);
    await screen.findByText("1");
    expect(chain.count("eth_getLogs")).toBe(0);
  });
});
