import { getPublicClient } from "wagmi/actions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectNetwork } from "../config/networks";
import { createAppConfig } from "./wagmi";

afterEach(() => vi.unstubAllGlobals());

describe("LLR-FE-003 the application's client reads through the configured URLs in order", () => {
  it("sends a read to the first configured URL, and to the second when the first fails", async () => {
    const network = { ...selectNetwork("testnet"), rpcUrls: ["https://first.example", "https://second.example"] };
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(String(input).replace(/\/$/, ""));
      if (String(input).startsWith("https://first.example")) throw new TypeError("fetch failed");
      const { id } = JSON.parse(String(init?.body)) as { id: number };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: "0x4cecd2" }));
    });
    const config = createAppConfig(network);
    const client = getPublicClient(config);
    expect(client?.chain.id).toBe(network.chainId);
    await expect(client?.request({ method: "eth_chainId" })).resolves.toBe("0x4cecd2");
    expect(seen).toEqual(["https://first.example", "https://second.example"]);
  });

  it("describes the chain with the configured name, RPC list, and explorer", () => {
    const network = selectNetwork("testnet");
    const chain = getPublicClient(createAppConfig(network))?.chain;
    expect(chain?.id).toBe(5042002);
    expect(chain?.name).toBe(network.name);
    expect(chain?.rpcUrls.default.http).toEqual(network.rpcUrls);
    expect(chain?.blockExplorers?.default.url).toBe(network.explorerUrl);
  });
});

describe("LLR-FE-004 the application's own client retries, not only a transport built in a test", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // One URL, so a fallback to a second endpoint cannot stand in for the retry.
  const oneUrl = { ...selectNetwork("testnet"), rpcUrls: ["https://only.example"] };

  function stubFetch(answers: (call: number) => unknown) {
    let calls = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const answer = answers(calls++);
      if (answer instanceof Response) return answer;
      const { id } = JSON.parse(String(init?.body)) as { id: number };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, ...(answer as object) }));
    });
    return () => calls;
  }

  it("asks again after a -32014 answer, 250 ms later, through the client the app reads with", async () => {
    const calls = stubFetch((n) => (n === 0 ? { error: { code: -32014, message: "requested data not available" } } : { result: "0x4cecd2" }));
    const client = getPublicClient(createAppConfig(oneUrl));
    const result = client?.request({ method: "eth_chainId" });
    await vi.advanceTimersByTimeAsync(249);
    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe("0x4cecd2");
    expect(calls()).toBe(2);
  });

  it("asks again after a 429 or 503 that carries a JSON-RPC error body", async () => {
    for (const [status, code] of [
      [429, -32005],
      [503, -32603],
    ] as const) {
      const calls = stubFetch((n) =>
        n === 0
          ? new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code, message: "refused" } }), {
              status,
              headers: { "content-type": "application/json" },
            })
          : { result: "0x4cecd2" },
      );
      const client = getPublicClient(createAppConfig(oneUrl));
      const result = client?.request({ method: "eth_chainId" });
      await vi.advanceTimersByTimeAsync(250);
      await expect(result, String(status)).resolves.toBe("0x4cecd2");
      expect(calls()).toBe(2);
    }
  });

  it("asks again after a request that got no HTTP response", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (n++ === 0) throw new TypeError("fetch failed");
      const { id } = JSON.parse(String(init?.body)) as { id: number };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: "0x4cecd2" }));
    });
    const client = getPublicClient(createAppConfig(oneUrl));
    const result = client?.request({ method: "eth_chainId" });
    await vi.advanceTimersByTimeAsync(250);
    await expect(result).resolves.toBe("0x4cecd2");
    expect(n).toBe(2);
  });

  it("asks again after an HTTP 503, and gives up after the third retry", async () => {
    const calls = stubFetch(() => new Response("busy", { status: 503 }));
    const client = getPublicClient(createAppConfig(oneUrl));
    const settled = client?.request({ method: "eth_chainId" }).then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await settled).toBe("rejected");
    expect(calls()).toBe(4);
  });
});

describe("LLR-FE-073 the client makes no request the configuration does not name", () => {
  it("has CCIP Read turned off, so an offchain lookup URL from a contract is never fetched", () => {
    const client = getPublicClient(createAppConfig(selectNetwork("testnet")));
    expect(client?.ccipRead).toBe(false);
  });
});
