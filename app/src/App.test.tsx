import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "viem";
import { App } from "./App";
import { createAppConfig } from "./chain/wagmi";
import { selectNetwork } from "./config/networks";
import { parseRoute } from "./routes";
import { FakeChain, samplePledge } from "./test/fakeChain";

const network = selectNetwork("testnet");

function freshChain(): FakeChain {
  const chain = new FakeChain(network.contract);
  chain.chainId = network.chainId;
  for (const t of network.tokens) chain.addToken(t.address, { decimals: t.decimals, symbol: t.symbol });
  chain.addPledge(1n, samplePledge, 0);
  return chain;
}

function setup(hash: string, chain = freshChain()) {
  window.location.hash = hash;
  const config = createAppConfig(network, chain.transport);
  render(<App network={network} config={config} />);
  return chain;
}

// Lets timers and the promises they start settle, inside act, so React has rendered what they produced.
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let visibility: "visible" | "hidden" = "visible";
const setVisibility = (next: "visible" | "hidden") =>
  act(async () => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
  window.location.hash = "";
});

describe("LLR-FE-013 the shell shows the view for each route", () => {
  it("shows one view per documented route", async () => {
    const cases: [string, string][] = [
      ["#/", "Put money behind your promise."],
      ["#/create", "New promise"],
      ["#/mine", "My promises"],
      ["#/about", "About SatStake"],
      ["#/p/1", "Promise #1"],
    ];
    for (const [hash, heading] of cases) {
      setup(hash);
      expect((await screen.findByRole("heading", { level: 1 })).textContent, hash).toBe(heading);
      cleanup();
    }
  });

  it("shows the not-found view for an unknown route", async () => {
    setup("#/nowhere");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Page not found");
  });

  it("shows the not-found view for a pledge id the contract does not recognize, in the words of section 2.2", async () => {
    setup("#/p/99");
    expect((await screen.findByRole("heading", { name: "Promise not found" })).tagName).toBe("H1");
    expect(screen.getByText("This promise does not exist. Check the link.")).toBeTruthy();
    expect(screen.queryByText("Page not found")).toBeNull();
  });

  it("shows the not-found view for a malformed pledge id without reading any pledge", async () => {
    const chain = setup("#/p/abc");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Page not found");
    expect(chain.count("eth_call", "getPledge")).toBe(0);
    expect(chain.count("eth_call", "stateOf")).toBe(0);
  });

  it("does not take a failed read for a missing pledge", async () => {
    const chain = freshChain();
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    setup("#/p/1", chain);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Could not read this promise");
    expect(screen.queryByRole("heading", { name: "Page not found" })).toBeNull();
  });

  it("shows no state from an earlier pledge while the next one is being read", async () => {
    const chain = freshChain();
    chain.addPledge(2n, samplePledge, 2);
    setup("#/p/1", chain);
    await screen.findByText("Open. Waiting for the referee's verdict.");
    act(() => {
      window.location.hash = "#/p/2";
    });
    await screen.findByText("Kept. The referee confirmed it, and the stake can be sent back to the staker.");
    let release = () => {};
    chain.gate = new Promise<void>((resolve) => (release = resolve));
    act(() => {
      window.location.hash = "#/p/1";
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByText("Kept. The referee confirmed it, and the stake can be sent back to the staker.")).toBeNull();
    release();
    await screen.findByText("Open. Waiting for the referee's verdict.");
  });

  it("changes view when the hash changes", async () => {
    setup("#/");
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Put money behind your promise.");
    act(() => {
      window.location.hash = "#/about";
    });
    expect((await screen.findByRole("heading", { name: "About SatStake" })).tagName).toBe("H1");
    act(() => {
      window.location.hash = "#/p/99";
    });
    expect((await screen.findByRole("heading", { name: "Promise not found" })).tagName).toBe("H1");
  });
});

describe("LLR-FE-005 network error", () => {
  it("shows no network error when the RPC reports the configured chain", async () => {
    const chain = setup("#/");
    await screen.findByRole("heading", { level: 1 });
    await act(async () => {});
    expect(chain.count("eth_chainId")).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a network error naming both chain ids when they differ", async () => {
    const chain = freshChain();
    chain.chainId = 5042;
    setup("#/", chain);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
    expect(alert.textContent).toContain("5042");
    expect(alert.textContent).toContain(String(network.chainId));
  });

  it("shows a network error when the RPC cannot be asked", async () => {
    const chain = freshChain();
    chain.outage = new HttpRequestError({ url: "https://rpc.example" });
    setup("#/", chain);
    expect((await screen.findByRole("alert")).textContent).toContain("Network error");
  });
});

describe("LLR-FE-011 the pledge page re-reads state and the latest block every 4 seconds", () => {
  const settle = async () => {
    vi.useFakeTimers();
    const chain = setup("#/p/1");
    await advance(0);
    return chain;
  };

  it("reads stateOf and the latest block when the page opens, then every 4 seconds", async () => {
    const chain = await settle();
    expect(chain.count("eth_call", "stateOf")).toBe(1);
    expect(chain.count("eth_getBlockByNumber")).toBe(1);
    await advance(3_999);
    expect(chain.count("eth_call", "stateOf")).toBe(1);
    await advance(1);
    expect(chain.count("eth_call", "stateOf")).toBe(2);
    expect(chain.count("eth_getBlockByNumber")).toBe(2);
    await advance(8_000);
    expect(chain.count("eth_call", "stateOf")).toBe(4);
    expect(chain.count("eth_getBlockByNumber")).toBe(4);
  });

  it("shows the state a later poll finds", async () => {
    const chain = await settle();
    expect(screen.getByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
    chain.states.set(1n, 2);
    await advance(4_000);
    expect(screen.getByText("Kept. The referee confirmed it, and the stake can be sent back to the staker.")).toBeTruthy();
  });

  it("stops while the page is hidden and reads again when it is shown", async () => {
    const chain = await settle();
    await setVisibility("hidden");
    await advance(60_000);
    expect(chain.count("eth_call", "stateOf")).toBe(1);
    await setVisibility("visible");
    expect(chain.count("eth_call", "stateOf")).toBe(2);
    await advance(4_000);
    expect(chain.count("eth_call", "stateOf")).toBe(3);
  });

  it("stops when the pledge page is left", async () => {
    const chain = await settle();
    act(() => {
      window.location.hash = "#/about";
    });
    await advance(0);
    const before = chain.count("eth_call", "stateOf");
    await advance(60_000);
    expect(chain.count("eth_call", "stateOf")).toBe(before);
  });

  it("never asks the node for logs while doing any of this", async () => {
    const chain = await settle();
    await advance(20_000);
    expect(chain.requests.map((r) => r.method).filter((m) => /log|filter|subscribe/i.test(m))).toEqual([]);
  });
});

describe("LLR-FE-005 the network error follows the most recent check, in plain words", () => {
  const open = async (chain: FakeChain, hash = "#/") => {
    vi.useFakeTimers();
    setup(hash, chain);
    await advance(50);
  };
  const interval = async () => {
    await advance(30_000);
    await advance(50);
  };

  it("explains a chain mismatch without jargon, naming both chains and the consequence", async () => {
    const chain = freshChain();
    chain.chainId = 5042;
    await open(chain);
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("Network error");
    expect(text).toContain("5042");
    expect(text).toContain(`${network.name} (chain ${network.chainId})`);
    expect(text).toContain("transactions");
    expect(text).toContain("every 30 seconds");
    expect(text).not.toMatch(/\bRPC\b|endpoint|eth_chainId|JSON/i);
  });

  it("explains an unanswered check without jargon", async () => {
    const chain = freshChain();
    chain.outage = new HttpRequestError({ url: "https://rpc.example" });
    await open(chain);
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("Network error");
    expect(text).toContain("transactions");
    expect(text).toContain("every 30 seconds");
    expect(text).not.toMatch(/\bRPC\b|endpoint|eth_chainId|JSON/i);
  });

  it("raises the error when a later check finds another chain, and clears it when a later check matches", async () => {
    const chain = freshChain();
    await open(chain);
    expect(screen.queryByRole("alert")).toBeNull();
    chain.chainId = 5042;
    await interval();
    expect(screen.getByRole("alert").textContent).toContain("5042");
    chain.chainId = network.chainId;
    await interval();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("raises the error when a later check gets no answer, and clears it when the network answers again", async () => {
    const chain = freshChain();
    await open(chain);
    chain.outage = new HttpRequestError({ url: "https://rpc.example" });
    await interval();
    expect(screen.getByRole("alert").textContent).toContain("Network error");
    chain.outage = undefined;
    await interval();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("LLR-FE-006 a notice names a token whose creation is disabled", () => {
  const usdc = network.tokens.find((t) => t.symbol === "USDC");
  const cirBtc = network.tokens.find((t) => t.symbol === "cirBTC");
  if (!usdc || !cirBtc) throw new Error("tokens missing from configuration");
  const box = () => screen.getByRole("status", { name: "Token notices" });
  const notices = () => Array.from(box().querySelectorAll("p")).map((n) => n.textContent ?? "");

  const open = async (chain: FakeChain) => {
    vi.useFakeTimers();
    setup("#/", chain);
    await advance(50);
  };
  const interval = async () => {
    await advance(30_000);
    await advance(50);
  };

  it("shows no notice while every token matches its configuration", async () => {
    await open(freshChain());
    expect(notices()).toEqual([]);
  });

  it("names the token whose decimals differ, and only that token", async () => {
    const chain = freshChain();
    chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" });
    await open(chain);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toContain("USDC");
    expect(notices()[0]).not.toContain("cirBTC");
    expect(notices()[0]).toContain("new promises");
  });

  it("names the token whose symbol differs only in case", async () => {
    const chain = freshChain();
    chain.addToken(cirBtc.address, { decimals: cirBtc.decimals, symbol: "cirbtc" });
    await open(chain);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toContain("cirBTC");
  });

  it("names a token that could not be read, and clears the notice when a later read matches", async () => {
    const chain = freshChain();
    await open(chain);
    chain.tokens.delete(usdc.address.toLowerCase());
    await interval();
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toContain("USDC");
    chain.addToken(usdc.address, { decimals: usdc.decimals, symbol: usdc.symbol });
    await interval();
    expect(notices()).toEqual([]);
  });

  it.each(["decimals", "symbol"])("names the token when only %s() cannot be read", async (failing) => {
    const chain = freshChain();
    chain.latency = (r) =>
      r.to === usdc.address.toLowerCase() && r.functionName === failing
        ? Promise.reject(new HttpRequestError({ url: "https://rpc.example" }))
        : undefined;
    await open(chain);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toContain("USDC");
  });

  it("uses no jargon in the notice", async () => {
    const chain = freshChain();
    chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" });
    await open(chain);
    expect(notices()[0]).not.toMatch(/decimals\(\)|symbol\(\)|\bRPC\b|ERC-?20/i);
  });
});

const pledgeStatus = () => within(screen.getByRole("main")).getByRole("status", { name: "Pledge status" });
const RETRYING = "Could not read this promise. The site keeps trying while this page is open.";

describe("LLR-FE-011 the pledge page in plain words, and a failed first read is tried again", () => {
  const states: [number, string][] = [
    [0, "Open. Waiting for the referee's verdict."],
    [1, "No answer by the deadline. The promise counts as broken, and the stake can be sent to the beneficiary."],
    [2, "Kept. The referee confirmed it, and the stake can be sent back to the staker."],
    [3, "Broken. The referee marked it broken, and the stake can be sent to the beneficiary."],
    [4, "Paid back. The stake went back to the staker."],
    [5, "Paid out. The stake went to the beneficiary."],
  ];

  it.each(states)("shows state %i as %s", async (value, label) => {
    const chain = freshChain();
    chain.addPledge(1n, samplePledge, value);
    setup("#/p/1", chain);
    expect(await screen.findByText(label)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/SettledTo/);
  });

  it("says it is reading, not nothing, until the first state answer arrives", async () => {
    vi.useFakeTimers();
    const chain = freshChain();
    chain.latency = (r) => (r.functionName === "stateOf" ? new Promise<void>((resolve) => setTimeout(resolve, 3_000)) : undefined);
    setup("#/p/1", chain);
    await advance(100);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Promise #1");
    expect(pledgeStatus().textContent).toContain("Reading the pledge");
    await advance(3_000);
    expect(screen.queryByText(/Reading the pledge/)).toBeNull();
    expect(screen.getByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
  });

  it("says it is reading while the pledge itself has not been answered, with the heading and title already there", async () => {
    vi.useFakeTimers();
    const chain = freshChain();
    chain.latency = (r) => (r.functionName === "getPledge" ? new Promise<void>((resolve) => setTimeout(resolve, 3_000)) : undefined);
    document.title = "stale";
    setup("#/p/1", chain);
    await advance(100);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Promise #1");
    expect(document.title).toBe("Promise #1 | SatStake");
    expect(pledgeStatus().textContent).toContain("Reading the pledge");
    await advance(3_000);
    await advance(50);
    expect(screen.getByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
  });

  it("keeps trying when the first read of the pledge fails, and shows it when a later try succeeds", async () => {
    vi.useFakeTimers();
    const chain = freshChain();
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    setup("#/p/1", chain);
    await advance(50);
    expect(screen.getByRole("alert").textContent).toContain("Could not read this promise");
    expect(screen.getByRole("alert").textContent).not.toMatch(/reload/i);
    const tries = chain.count("eth_call");
    await advance(4_000);
    expect(chain.count("eth_call")).toBeGreaterThan(tries);
    chain.callError = undefined;
    await advance(4_000);
    await advance(50);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
  });

  it("reads no state for a pledge the contract says does not exist", async () => {
    vi.useFakeTimers();
    const chain = setup("#/p/99");
    await advance(50);
    await advance(8_000);
    expect(chain.count("eth_call", "stateOf")).toBe(0);
    expect(chain.count("eth_getBlockByNumber")).toBe(0);
  });

  it("does not keep asking for a pledge the contract says does not exist", async () => {
    vi.useFakeTimers();
    const chain = setup("#/p/99");
    await advance(50);
    const asked = chain.count("eth_call", "getPledge");
    await advance(60_000);
    expect(chain.count("eth_call", "getPledge")).toBe(asked);
  });
});

describe("LLR-FE-013 the header and footer", () => {
  const nameOf = (a: Element) => a.getAttribute("aria-label") ?? a.textContent;

  it("links the brand to the home page and the nav only to routes that exist", async () => {
    setup("#/about");
    const header = (await screen.findByRole("banner")) as HTMLElement;
    const links = Array.from(header.querySelectorAll("a")).map((a) => [nameOf(a), a.getAttribute("href")]);
    expect(links).toEqual([
      ["SatStake", "#/"],
      ["New promise", "#/create"],
      ["My promises", "#/mine"],
      ["About", "#/about"],
    ]);
    for (const [, href] of links) expect(parseRoute(href as string).name, String(href)).not.toBe("notFound");
  });

  it("writes the logo as Sat, an accented Stake, and a full stop, and names it SatStake to assistive technology", async () => {
    setup("#/about");
    const logo = await screen.findByRole("link", { name: "SatStake" });
    expect(logo.textContent).toBe("SatStake.");
    expect(logo.querySelector("span.accent")?.textContent).toBe("Stake");
  });

  it("keeps the nav in the header with the wallet control, and never hides the nav", async () => {
    setup("#/");
    const header = (await screen.findByRole("banner")) as HTMLElement;
    const nav = within(header).getByRole("navigation", { name: "Main" });
    expect(nav.hasAttribute("hidden")).toBe(false);
    expect(nav.getAttribute("aria-hidden")).toBeNull();
    expect(within(header).getByRole("region", { name: "Wallet" })).toBeTruthy();
    expect(header.contains(nav)).toBe(true);
  });

  it.each([
    ["#/", "SatStake"],
    ["#/create", "New promise"],
    ["#/mine", "My promises"],
    ["#/about", "About"],
  ])("on %s marks exactly the %s link as the current page", async (hash, label) => {
    setup(hash);
    const header = (await screen.findByRole("banner")) as HTMLElement;
    const current = Array.from(header.querySelectorAll("a")).filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map(nameOf)).toEqual([label]);
  });

  it("marks no link on a pledge page or an unknown route", async () => {
    for (const hash of ["#/p/1", "#/nowhere"]) {
      setup(hash);
      const header = (await screen.findByRole("banner")) as HTMLElement;
      expect(header.querySelectorAll('[aria-current="page"]').length, hash).toBe(0);
      cleanup();
    }
  });

  it("has a footer on every page that names the network", async () => {
    for (const hash of ["#/", "#/p/1", "#/nowhere"]) {
      setup(hash);
      const footer = await screen.findByRole("contentinfo");
      expect(footer.textContent, hash).toContain(`Runs on ${network.name}`);
      cleanup();
    }
  });

  it("links the about page, the source repository, and the contract on the explorer from the footer", async () => {
    setup("#/");
    const footer = await screen.findByRole("contentinfo");
    const hrefOf = (name: string) => within(footer).getByRole("link", { name }).getAttribute("href");
    expect(hrefOf("About and limits")).toBe("#/about");
    expect(hrefOf("GitHub")).toBe("https://github.com/Vasqq/satstake");
    expect(hrefOf("Contract on the explorer")).toBe(`${network.explorerUrl}/address/${network.contract}`);
    expect(footer.textContent).toContain("Built on Arc");
  });

  it("puts the footer links in the order About and limits, GitHub, Contract on the explorer", async () => {
    setup("#/");
    const footer = await screen.findByRole("contentinfo");
    expect(Array.from(footer.querySelectorAll("a")).map((a) => a.textContent)).toEqual([
      "About and limits",
      "GitHub",
      "Contract on the explorer",
    ]);
  });
});

describe("LLR-FE-072 each page sets the title and moves focus to its heading", () => {
  it("sets the document title for each route", async () => {
    const cases: [string, string][] = [
      ["#/", "SatStake"],
      ["#/create", "New promise | SatStake"],
      ["#/mine", "My promises | SatStake"],
      ["#/about", "About SatStake"],
      ["#/p/1", "Promise #1 | SatStake"],
      ["#/nowhere", "Page not found | SatStake"],
    ];
    for (const [hash, title] of cases) {
      document.title = "stale";
      setup(hash);
      await screen.findByRole("heading", { level: 1 });
      expect(document.title, hash).toBe(title);
      cleanup();
    }
  });

  it("titles a pledge that does not exist as not found", async () => {
    setup("#/p/99");
    await screen.findByRole("heading", { name: "Promise not found" });
    expect(document.title).toBe("Promise not found | SatStake");
  });

  it("moves the title and the focus when the route changes", async () => {
    setup("#/");
    await screen.findByRole("heading", { name: "Put money behind your promise.", level: 1 });
    act(() => {
      window.location.hash = "#/about";
    });
    const about = await screen.findByRole("heading", { name: "About SatStake" });
    expect(document.title).toBe("About SatStake");
    expect(document.activeElement).toBe(about);
    act(() => {
      window.location.hash = "#/create";
    });
    const create = await screen.findByRole("heading", { name: "New promise" });
    expect(document.title).toBe("New promise | SatStake");
    expect(document.activeElement).toBe(create);
  });

  it("moves the focus to the next pledge's heading when only the pledge changes", async () => {
    const chain = freshChain();
    chain.addPledge(2n);
    setup("#/p/1", chain);
    await screen.findByRole("heading", { name: "Promise #1" });
    act(() => {
      window.location.hash = "#/p/2";
    });
    const second = await screen.findByRole("heading", { name: "Promise #2" });
    expect(document.title).toBe("Promise #2 | SatStake");
    expect(document.activeElement).toBe(second);
  });
});

describe("LLR-FE-011 a failed poll shows an error beside the last state, and the reading message becomes the state", () => {
  const open = async (chain: FakeChain) => {
    vi.useFakeTimers();
    setup("#/p/1", chain);
    await advance(50);
  };

  it("keeps the last state on screen and shows the error while the most recent poll failed, then clears it", async () => {
    const chain = freshChain();
    await open(chain);
    expect(screen.getByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    await advance(4_000);
    await advance(50);
    expect(screen.getByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(RETRYING);
    chain.callError = undefined;
    await advance(4_000);
    await advance(50);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
  });

  it("shows the error beside the reading message while no state has been read", async () => {
    const chain = freshChain();
    chain.latency = (r) =>
      r.functionName === "stateOf" ? Promise.reject(new HttpRequestError({ url: "https://rpc.example" })) : undefined;
    await open(chain);
    expect(screen.getByRole("alert").textContent).toBe(RETRYING);
    expect(pledgeStatus().textContent).toContain("Reading the pledge");
  });

  it("shows the same message once, in one alert, beside the reading message, when the first read of the pledge itself failed", async () => {
    const chain = freshChain();
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    await open(chain);
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual([RETRYING]);
    expect(pledgeStatus().textContent).toContain("Reading the pledge");
  });

  it("shows both the reading message and the alert when the first read of the pledge fails with a 503", async () => {
    const chain = freshChain();
    chain.callError = new HttpRequestError({ url: "https://rpc.example", status: 503 });
    await open(chain);
    expect(pledgeStatus().textContent).toContain("Reading the pledge");
    expect(screen.getByRole("alert").textContent).toBe(RETRYING);
  });

  it("updates one status element from the reading message to the state, and on to the next state", async () => {
    const chain = freshChain();
    chain.latency = (r) => (r.functionName === "stateOf" ? new Promise<void>((resolve) => setTimeout(resolve, 3_000)) : undefined);
    vi.useFakeTimers();
    setup("#/p/1", chain);
    await advance(100);
    const status = pledgeStatus();
    expect(status.textContent).toContain("Reading the pledge");
    await advance(3_000);
    expect(pledgeStatus()).toBe(status);
    expect(status.textContent).toBe("Open. Waiting for the referee's verdict.");
    chain.latency = undefined;
    chain.states.set(1n, 2);
    await advance(4_000);
    expect(pledgeStatus()).toBe(status);
    expect(status.textContent).toBe("Kept. The referee confirmed it, and the stake can be sent back to the staker.");
  });
});

describe("LLR-FE-072 status changes are announced through containers that are already on the page", () => {
  it("keeps one token-notice status container mounted from the first render, and fills it when a notice appears", async () => {
    vi.useFakeTimers();
    const chain = freshChain();
    setup("#/", chain);
    const box = screen.getByRole("status", { name: "Token notices" });
    expect(box.textContent).toBe("");
    const usdc = network.tokens.find((t) => t.symbol === "USDC");
    if (!usdc) throw new Error("USDC missing from configuration");
    await advance(50);
    chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" });
    await advance(30_000);
    await advance(50);
    expect(screen.getByRole("status", { name: "Token notices" })).toBe(box);
    expect(box.textContent).toContain("USDC");
  });
});

describe("LLR-FE-072 focus and title on the first page load and on the swap to not found", () => {
  const titles: string[] = [];
  const focused: string[] = [];
  beforeEach(() => {
    titles.length = 0;
    focused.length = 0;
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "title");
    if (!descriptor?.get || !descriptor.set) throw new Error("document.title has no accessor");
    const { get, set } = descriptor;
    Object.defineProperty(document, "title", {
      configurable: true,
      get: () => get.call(document) as string,
      set: (value: string) => {
        titles.push(value);
        set.call(document, value);
      },
    });
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      focused.push(this.textContent ?? "");
      focus.call(this, options);
    });
  });
  afterEach(() => Reflect.deleteProperty(document, "title"));

  it("sets the title but leaves the focus alone on the first page load", async () => {
    setup("#/about");
    await screen.findByRole("heading", { name: "About SatStake" });
    expect(document.title).toBe("About SatStake");
    expect(focused).toEqual([]);
    expect(document.activeElement).not.toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("leaves the focus alone on the first page load of a pledge too, once its heading appears", async () => {
    setup("#/p/1");
    await screen.findByRole("heading", { name: "Promise #1" });
    expect(document.title).toBe("Promise #1 | SatStake");
    expect(focused).toEqual([]);
  });

  it("sets the title and the heading at once on a slow first read, right after a route change", async () => {
    vi.useFakeTimers();
    const chain = freshChain();
    chain.latency = (r) => (r.functionName === "getPledge" ? new Promise<void>((resolve) => setTimeout(resolve, 5_000)) : undefined);
    setup("#/about", chain);
    await advance(50);
    act(() => {
      window.location.hash = "#/p/1";
    });
    await advance(10);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Promise #1");
    expect(document.title).toBe("Promise #1 | SatStake");
    expect(document.activeElement).toBe(heading);
  });

  it("gives the title and focus to the not-found heading, after the pledge heading, when a pledge does not exist", async () => {
    setup("#/about");
    await screen.findByRole("heading", { name: "About SatStake" });
    titles.length = 0;
    act(() => {
      window.location.hash = "#/p/99";
    });
    await screen.findByRole("heading", { name: "Promise not found" });
    expect(titles).toEqual(["Promise #99 | SatStake", "Promise not found | SatStake"]);
    expect(focused).toEqual(["Promise #99", "Promise not found"]);
    expect(document.title).toBe("Promise not found | SatStake");
  });
});
