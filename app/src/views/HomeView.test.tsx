import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "viem";
import { formatAmount } from "../format";
import { createPublicClient } from "viem";
import { createReads } from "../chain/reads";
import { freshChain, mountApp, mountUi, network, teardownWallets } from "../test/walletHarness";
import { HomeView } from "./HomeView";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  teardownWallets();
});

const home = (chain = freshChain()) => mountApp({ hash: "#/", chain });
const linkTo = (href: string) => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === href);

// The words and layout of the landing page are Liam's (05 v1.27): these tests find things by what they do,
// not by what they say.
describe("LLR-FE-070 the calls to action", () => {
  it("links to whichever pledge the network configures as its example", () => {
    const chain = freshChain();
    const reads = createReads(createPublicClient({ transport: chain.transport }), network.contract);
    mountUi(<HomeView reads={reads} network={{ ...network, examplePledgeId: 7n }} />, { chain });
    expect(linkTo("#/p/7")).toBeTruthy();
    expect(linkTo("#/p/1")).toBeFalsy();
  });

  it("links to the create form and to the configured example pledge", () => {
    home();
    expect(linkTo("#/create")).toBeTruthy();
    expect(linkTo(`#/p/${network.examplePledgeId}`)).toBeTruthy();
  });
});

describe("LLR-FE-070 the evidence that it is live", () => {
  it("names the network and its chain", () => {
    home();
    expect(document.body.textContent).toContain(network.name);
    expect(document.body.textContent).toContain(String(network.chainId));
  });

  it("shows the whole contract address with a copy control and an explorer link", () => {
    home();
    const address = [...document.querySelectorAll("code")].find((c) => c.textContent === network.contract);
    expect(address).toBeTruthy();
    const holder = address!.closest("dd, li, div, p") as HTMLElement;
    expect(within(holder).getAllByRole("button").length).toBeGreaterThan(0);
    expect(linkTo(`${network.explorerUrl}/address/${network.contract}`)).toBeTruthy();
  });

  it("links to the verified source on Sourcify", () => {
    home();
    expect(linkTo(`https://repo.sourcify.dev/${network.chainId}/${network.contract}`)).toBeTruthy();
  });

  it("shows the live pledge count after saying it is reading", async () => {
    const chain = freshChain();
    chain.addPledge(2n);
    let open = () => {};
    chain.gate = new Promise<void>((resolve) => (open = resolve));
    home(chain);
    expect((await screen.findAllByText("Reading")).length).toBeGreaterThan(0);
    expect(screen.getByText("Promises made")).toBeTruthy();
    await act(async () => open());
    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.queryByText("Reading")).toBeNull();
    // The card of recent promises and the proof strip ask for the count together, and it is read once.
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
    expect((await screen.findAllByText("Not available right now")).length).toBeGreaterThan(0);
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

const heading = (name: string | RegExp) => screen.getByRole("heading", { name });

describe("LLR-FE-070 what SatStake does, for a visitor without a wallet", () => {
  it("leads with the promise and says how the stake is kept or lost", () => {
    home();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Put money behind your promise.");
    expect(document.body.textContent).toContain("Kept, and your money comes back.");
    expect(document.body.textContent).toContain("no answer by the deadline");
    expect(screen.getByText(/You need a browser wallet on Arc/)).toBeTruthy();
    expect(document.title).toBe("SatStake");
  });

  it("offers the create call to action in the hero and again at the close", () => {
    home();
    const toCreate = [...document.querySelectorAll("a")].filter((a) => a.getAttribute("href") === "#/create");
    expect(toCreate.some((a) => a.textContent?.startsWith("Make a promise"))).toBe(true);
    expect(toCreate.length).toBeGreaterThanOrEqual(3); // header, hero, close
    expect(heading(/^Ready to put something on it\?$/)).toBeTruthy();
  });

  it("explains the three steps with the worked example and the three endings", () => {
    home();
    expect(heading("How it works")).toBeTruthy();
    expect(screen.getByText(/Alex promises/)).toBeTruthy();
    for (const [ending, outcome] of [
      ["Kept", "Back to Alex"],
      ["Broken", "To Jo"],
      ["No answer by the deadline", "To Jo"],
    ]) {
      const term = screen.getAllByText(ending as string, { selector: "dt" })[0]!;
      expect(term.parentElement!.textContent).toContain(outcome);
    }
    expect(screen.getByText("Silence counts as broken, so make sure your referee answers in time.")).toBeTruthy();
    expect(screen.getByText(/a promise cannot be cancelled or changed once made, and every promise is public/)).toBeTruthy();
  });

  it("says plainly what it cannot do beside the claims it makes", () => {
    home();
    expect(heading("Why you can trust it")).toBeTruthy();
    expect(screen.getByText(/your referee is trusted by you and could judge you unfairly/)).toBeTruthy();
    expect(screen.getByText(/can pause a token or block an address/)).toBeTruthy();
    expect(screen.getByText(/tested, not audited/)).toBeTruthy();
  });

  it("answers the five questions without sending the visitor elsewhere", () => {
    home();
    const section = heading("Questions").closest("section")!;
    const questions = [...section.querySelectorAll("dt")].map((q) => q.textContent);
    expect(questions).toEqual([
      "What do I need?",
      "What if my referee does not answer?",
      "Can I cancel or change a promise?",
      "Does SatStake charge anything?",
      "Who can see my promise?",
    ]);
    expect(section.querySelectorAll("a").length).toBe(0);
  });

  it("links to nothing inside the page, since a hash link would change the route", () => {
    home();
    for (const a of document.querySelectorAll("a[href^='#']")) expect(a.getAttribute("href"), a.textContent ?? "").toMatch(/^#\//);
  });
});

describe("LLR-FE-070 the evidence for reviewers", () => {
  it("names the network, its chain, and why Arc", () => {
    home();
    const section = heading("For reviewers").closest("section")!;
    expect(section.textContent).toContain(`${network.name}, chain ${network.chainId}`);
    expect(section.textContent).toContain(
      "SatStake uses cirBTC as the stake, USDC as gas so a $5 promise costs cents to make, and Arc's deterministic finality so a forfeit is final the moment it lands.",
    );
  });

  it("links to the repository, to the verified source, and to the contract on the explorer from the hero", () => {
    home();
    expect(linkTo("https://github.com/Vasqq/satstake")).toBeTruthy();
    const eyebrow = screen.getByRole("link", { name: `Live on ${network.name}` });
    expect(eyebrow.getAttribute("href")).toBe(`${network.explorerUrl}/address/${network.contract}`);
    expect(screen.getByRole("link", { name: "Verified on Sourcify" })).toBeTruthy();
  });

  it("shows the whole address once, in the reviewer section", () => {
    home();
    const full = [...document.querySelectorAll("code")].filter((c) => c.textContent === network.contract);
    expect(full.length).toBe(1);
    expect(heading("For reviewers").closest("section")!.contains(full[0]!)).toBe(true);
  });
});

describe("LLR-FE-070 the live figures", () => {
  it("shows what is locked now for each token on its own line, and never a sum", async () => {
    const chain = freshChain();
    home(chain);
    await screen.findByText("1");
    for (const token of network.tokens) {
      const line = (await screen.findByText(`Locked now in ${token.symbol}`)).parentElement!;
      expect(line.textContent).toContain(formatAmount(network, token.address, 0n));
    }
    expect(chain.count("eth_call", "totalLocked")).toBe(network.tokens.length);
    expect(screen.getAllByText(/^Locked now in /).length).toBe(network.tokens.length);
  });

  it("says it is not available when the reads fail, for the count and for each token", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chain = freshChain();
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    home(chain);
    const unavailable = await screen.findAllByText("Not available right now");
    expect(unavailable.length).toBe(1 + network.tokens.length);
  });

  it("reads pledge data only through the contract's views", async () => {
    const chain = freshChain();
    home(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    const allowed = new Set(["pledgeCount", "getPledge", "stateOf", "totalLocked"]);
    const used = chain.requests.filter((r) => r.method === "eth_call" && r.to?.toLowerCase() === network.contract.toLowerCase()).map((r) => r.functionName!);
    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(allowed.has(name), name).toBe(true);
    expect(chain.count("eth_getLogs")).toBe(0);
  });

  it("shows the newest promise from the contract in the card", async () => {
    home();
    const card = await screen.findByRole("region", { name: `Recent promises on ${network.name}` });
    expect(within(card).getByText(/Run 5 km before Friday/)).toBeTruthy();
  });

  it("shows no card, and no invented promise, on a contract that holds none", async () => {
    const chain = freshChain();
    chain.pledges.clear();
    home(chain);
    await screen.findByText("0");
    expect(screen.queryByRole("region", { name: /Recent promises/ })).toBeNull();
    expect(document.body.textContent).not.toContain("Run 5 km");
  });
});
