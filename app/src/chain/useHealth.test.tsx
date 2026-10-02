import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError, createPublicClient } from "viem";
import { selectNetwork } from "../config/networks";
import { FakeChain } from "../test/fakeChain";
import { useHealth } from "./useHealth";

const network = selectNetwork("testnet");

let visibility: "visible" | "hidden" = "visible";
const setVisibility = (next: "visible" | "hidden") =>
  act(async () => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
// Waits one interval and then a few milliseconds more, which is how long a read's answer takes to reach React.
const interval = async () => {
  await advance(30_000);
  await advance(50);
};

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

function mount(chain: FakeChain, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const client = createPublicClient({ transport: chain.transport });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useHealth(client, network), { wrapper });
}

function freshChain(): FakeChain {
  const chain = new FakeChain(network.contract);
  chain.chainId = network.chainId;
  for (const t of network.tokens) chain.addToken(t.address, { decimals: t.decimals, symbol: t.symbol });
  return chain;
}

describe("LLR-FE-005 and LLR-FE-006 checks run on load", () => {
  it("is still checking, with writes off and creation off, before the answers arrive", () => {
    const { result } = mount(freshChain());
    expect(result.current.network).toEqual({ status: "checking" });
    expect(result.current.tokens).toBeNull();
    for (const t of network.tokens) expect(result.current.creationEnabled(t.address), t.symbol).toBe(false);
  });

  it("passes the chain check and enables each token that matches its configuration", async () => {
    const chain = freshChain();
    const { result } = mount(chain);
    await waitFor(() => expect(result.current.network).toEqual({ status: "ok" }));
    await waitFor(() => expect(result.current.tokens).not.toBeNull());
    expect(result.current.tokens?.map((t) => t.creationEnabled)).toEqual(network.tokens.map(() => true));
    for (const t of network.tokens) expect(result.current.creationEnabled(t.address), t.symbol).toBe(true);
    expect(result.current.creationEnabled("0x0000000000000000000000000000000000000001")).toBe(false);
    for (const t of network.tokens) {
      expect(result.current.creationEnabled(t.address.toLowerCase() as typeof t.address), t.symbol).toBe(true);
    }
  });

  it("disables creation in a token that reports other decimals, and flags the wrong chain", async () => {
    const chain = freshChain();
    chain.chainId = 1;
    const usdc = network.tokens.find((t) => t.symbol === "USDC");
    if (!usdc) throw new Error("USDC missing from configuration");
    chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" });
    const { result } = mount(chain);
    await waitFor(() => expect(result.current.network.status).toBe("mismatch"));
    await waitFor(() => expect(result.current.tokens).not.toBeNull());
    const bySymbol = Object.fromEntries((result.current.tokens ?? []).map((t) => [t.token.symbol, t.creationEnabled]));
    expect(bySymbol).toEqual({ USDC: false, cirBTC: true });
  });

  it("does not ask again when the same session mounts it a second time at once", async () => {
    const chain = freshChain();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const first = mount(chain, queryClient);
    await waitFor(() => expect(first.result.current.tokens).not.toBeNull());
    first.unmount();
    const second = mount(chain, queryClient);
    expect(second.result.current.network).toEqual({ status: "ok" });
    await waitFor(() => expect(second.result.current.tokens).not.toBeNull());
    expect(chain.count("eth_chainId")).toBe(1);
    expect(chain.requests.filter((r) => r.functionName === "decimals")).toHaveLength(network.tokens.length);
  });
});

describe("LLR-FE-005 and LLR-FE-006 checks repeat every 30 seconds while the page is visible", () => {
  async function mountSettled(chain: FakeChain) {
    vi.useFakeTimers();
    const rendered = mount(chain);
    await advance(0);
    return rendered;
  }
  const decimalsCalls = (chain: FakeChain) => chain.requests.filter((r) => r.functionName === "decimals").length;
  const symbolCalls = (chain: FakeChain) => chain.requests.filter((r) => r.functionName === "symbol").length;

  it("asks both questions at load, then again at 30 seconds and at each 30 seconds after, not a millisecond early", async () => {
    const chain = freshChain();
    await mountSettled(chain);
    expect(chain.count("eth_chainId")).toBe(1);
    expect(decimalsCalls(chain)).toBe(network.tokens.length);
    await advance(29_999);
    expect(chain.count("eth_chainId")).toBe(1);
    expect(decimalsCalls(chain)).toBe(network.tokens.length);
    await advance(1);
    expect(chain.count("eth_chainId")).toBe(2);
    expect(decimalsCalls(chain)).toBe(2 * network.tokens.length);
    expect(symbolCalls(chain)).toBe(2 * network.tokens.length);
    await advance(30_000);
    expect(chain.count("eth_chainId")).toBe(3);
    expect(decimalsCalls(chain)).toBe(3 * network.tokens.length);
  });

  it("asks nothing while the page is hidden, and asks again once it is visible", async () => {
    const chain = freshChain();
    await mountSettled(chain);
    await setVisibility("hidden");
    await advance(120_000);
    expect(chain.count("eth_chainId")).toBe(1);
    expect(decimalsCalls(chain)).toBe(network.tokens.length);
    await setVisibility("visible");
    await advance(30_000);
    expect(chain.count("eth_chainId")).toBeGreaterThanOrEqual(2);
    expect(decimalsCalls(chain)).toBeGreaterThanOrEqual(2 * network.tokens.length);
  });

  it("turns writes off when a later answer is another chain, and back on when a later answer matches", async () => {
    const chain = freshChain();
    const { result } = await mountSettled(chain);
    expect(result.current.network).toEqual({ status: "ok" });
    chain.chainId = 5042;
    await interval();
    expect(result.current.network).toEqual({ status: "mismatch", expected: network.chainId, actual: 5042 });
    chain.chainId = network.chainId;
    await interval();
    expect(result.current.network).toEqual({ status: "ok" });
  });

  it("fails closed when a check gets no answer, and recovers when a later check is answered", async () => {
    const chain = freshChain();
    const { result } = await mountSettled(chain);
    chain.outage = new HttpRequestError({ url: "https://rpc.example" });
    await interval();
    expect(result.current.network).toEqual({ status: "unreachable" });
    for (const t of network.tokens) expect(result.current.creationEnabled(t.address), t.symbol).toBe(false);
    expect(result.current.tokens?.map((t) => t.status)).toEqual(network.tokens.map(() => "unavailable"));
    chain.outage = undefined;
    await interval();
    expect(result.current.network).toEqual({ status: "ok" });
    for (const t of network.tokens) expect(result.current.creationEnabled(t.address), t.symbol).toBe(true);
  });

  it("starts failed closed when the very first check gets no answer, and recovers on the next", async () => {
    const chain = freshChain();
    chain.outage = new HttpRequestError({ url: "https://rpc.example" });
    const { result } = await mountSettled(chain);
    expect(result.current.network).toEqual({ status: "unreachable" });
    chain.outage = undefined;
    await interval();
    expect(result.current.network).toEqual({ status: "ok" });
  });

  it("disables creation in one token when a later read differs, and enables it when a later read matches", async () => {
    const chain = freshChain();
    const { result } = await mountSettled(chain);
    const usdc = network.tokens.find((t) => t.symbol === "USDC");
    const cirBtc = network.tokens.find((t) => t.symbol === "cirBTC");
    if (!usdc || !cirBtc) throw new Error("tokens missing from configuration");
    chain.addToken(usdc.address, { decimals: usdc.decimals, symbol: "usdc" });
    await interval();
    expect(result.current.creationEnabled(usdc.address)).toBe(false);
    expect(result.current.creationEnabled(cirBtc.address)).toBe(true);
    chain.addToken(usdc.address, { decimals: usdc.decimals, symbol: usdc.symbol });
    await interval();
    expect(result.current.creationEnabled(usdc.address)).toBe(true);
  });
});
