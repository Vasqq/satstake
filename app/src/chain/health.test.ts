import { beforeEach, describe, expect, it } from "vitest";
import { HttpRequestError, createPublicClient } from "viem";
import { selectNetwork } from "../config/networks";
import { FakeChain } from "../test/fakeChain";
import { checkNetwork, checkTokens, writeActionsEnabled } from "./health";

const network = selectNetwork("testnet");
let chain: FakeChain;
const client = () => createPublicClient({ transport: chain.transport });

beforeEach(() => {
  chain = new FakeChain(network.contract);
  for (const t of network.tokens) chain.addToken(t.address, { decimals: t.decimals, symbol: t.symbol });
});

describe("LLR-FE-005 chain id check", () => {
  it("passes when eth_chainId equals the configured chain id", async () => {
    chain.chainId = network.chainId;
    await expect(checkNetwork(client(), network.chainId)).resolves.toEqual({ status: "ok" });
    expect(chain.count("eth_chainId")).toBe(1);
  });

  it("reports both ids when the RPC answers with another chain", async () => {
    chain.chainId = 5042;
    await expect(checkNetwork(client(), network.chainId)).resolves.toEqual({
      status: "mismatch",
      expected: 5042002,
      actual: 5042,
    });
  });

  it("is a mismatch for an id one away in either direction", async () => {
    for (const actual of [5042001, 5042003]) {
      chain.chainId = actual;
      expect((await checkNetwork(client(), network.chainId)).status).toBe("mismatch");
    }
  });

  it("reports unreachable, not ok, when the RPC cannot be asked", async () => {
    chain.failures.push(new HttpRequestError({ url: "https://rpc.example", cause: new TypeError("fetch failed") }));
    await expect(checkNetwork(client(), network.chainId)).resolves.toEqual({ status: "unreachable" });
  });

  it("disables write actions on every result except a pass", () => {
    expect(writeActionsEnabled({ status: "ok" })).toBe(true);
    expect(writeActionsEnabled({ status: "mismatch", expected: 5042002, actual: 5042 })).toBe(false);
    expect(writeActionsEnabled({ status: "unreachable" })).toBe(false);
    expect(writeActionsEnabled({ status: "checking" })).toBe(false);
  });
});

describe("LLR-FE-006 token decimals and symbol check", () => {
  const bySymbol = (results: Awaited<ReturnType<typeof checkTokens>>, symbol: string) => {
    const hit = results.find((r) => r.token.symbol === symbol);
    if (!hit) throw new Error(`no result for ${symbol}`);
    return hit;
  };

  it("reads decimals() and symbol() from each configured token address", async () => {
    await checkTokens(client(), network.tokens);
    for (const token of network.tokens) {
      const calls = chain.requests.filter((r) => r.to === token.address.toLowerCase()).map((r) => r.functionName);
      expect(calls.sort(), token.symbol).toEqual(["decimals", "symbol"]);
    }
  });

  it("enables pledge creation in a token whose values match the configuration", async () => {
    const results = await checkTokens(client(), network.tokens);
    expect(results).toHaveLength(network.tokens.length);
    for (const r of results) expect(r).toMatchObject({ status: "ok", creationEnabled: true });
  });

  it("disables creation in a token whose decimals differ, and only that token", async () => {
    const usdc = network.tokens.find((t) => t.symbol === "USDC");
    if (!usdc) throw new Error("USDC missing from configuration");
    chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" });
    const results = await checkTokens(client(), network.tokens);
    expect(bySymbol(results, "USDC")).toMatchObject({
      status: "mismatch",
      creationEnabled: false,
      actual: { decimals: 18, symbol: "USDC" },
    });
    expect(bySymbol(results, "cirBTC").creationEnabled).toBe(true);
  });

  it("disables creation in a token with fewer decimals than configured, not only more", async () => {
    const usdc = network.tokens.find((t) => t.symbol === "USDC");
    if (!usdc) throw new Error("USDC missing from configuration");
    for (const decimals of [usdc.decimals - 1, usdc.decimals + 1, 0]) {
      chain.addToken(usdc.address, { decimals, symbol: "USDC" });
      const results = await checkTokens(client(), network.tokens);
      expect(bySymbol(results, "USDC"), String(decimals)).toMatchObject({ status: "mismatch", creationEnabled: false });
    }
  });

  it("compares the symbol exactly, so a change of case alone disables creation", async () => {
    const usdc = network.tokens.find((t) => t.symbol === "USDC");
    if (!usdc) throw new Error("USDC missing from configuration");
    for (const symbol of ["usdc", "Usdc", "USDC ", " USDC"]) {
      chain.addToken(usdc.address, { decimals: usdc.decimals, symbol });
      const results = await checkTokens(client(), network.tokens);
      expect(bySymbol(results, "USDC"), symbol).toMatchObject({ status: "mismatch", creationEnabled: false });
    }
  });

  it("disables creation in a token whose symbol differs", async () => {
    const cirBtc = network.tokens.find((t) => t.symbol === "cirBTC");
    if (!cirBtc) throw new Error("cirBTC missing from configuration");
    chain.addToken(cirBtc.address, { decimals: 8, symbol: "WBTC" });
    const results = await checkTokens(client(), network.tokens);
    expect(bySymbol(results, "cirBTC")).toMatchObject({ status: "mismatch", creationEnabled: false });
    expect(bySymbol(results, "USDC").creationEnabled).toBe(true);
  });

  it.each(["decimals", "symbol"])("disables creation when only %s() cannot be read, though the other read matches", async (failing) => {
    const usdc = network.tokens.find((t) => t.symbol === "USDC");
    if (!usdc) throw new Error("USDC missing from configuration");
    chain.latency = (r) =>
      r.to === usdc.address.toLowerCase() && r.functionName === failing
        ? Promise.reject(new HttpRequestError({ url: "https://rpc.example" }))
        : undefined;
    const results = await checkTokens(client(), network.tokens);
    expect(bySymbol(results, "USDC")).toMatchObject({ status: "unavailable", creationEnabled: false });
    expect(bySymbol(results, "cirBTC").creationEnabled).toBe(true);
  });

  it("treats a token that cannot be read as not confirmed and disables it", async () => {
    chain.tokens.clear();
    const results = await checkTokens(client(), network.tokens);
    for (const r of results) expect(r).toMatchObject({ status: "unavailable", creationEnabled: false });
  });
});
