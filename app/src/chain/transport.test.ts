import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError, RpcRequestError, TimeoutError, custom } from "viem";
import { NoResponseError, RETRY_DELAYS_MS, isRetryable, retryRead } from "./retry";
import { createReadTransport, retryingTransport } from "./transport";

const rpcError = (code: number, message = "boom") =>
  new RpcRequestError({ body: {}, error: { code, message }, url: "https://rpc.example" });
// What the read transport raises when the request got no HTTP response: viem wraps the marker that its
// fetch wrapper threw.
const networkError = () =>
  new HttpRequestError({ url: "https://rpc.example", cause: new NoResponseError("no response", { cause: new TypeError("fetch failed") }) });

describe("LLR-FE-004 which failures are retried", () => {
  it("retries JSON-RPC error -32014", () => {
    expect(isRetryable(rpcError(-32014, "requested data not available"))).toBe(true);
  });

  it("retries a network error and a timeout", () => {
    expect(isRetryable(networkError())).toBe(true);
    expect(isRetryable(new TimeoutError({ body: {}, url: "https://rpc.example" }))).toBe(true);
  });

  it("finds the cause when the error is wrapped, as a contract read wraps it", () => {
    const wrapped = new Error("wrapper", { cause: rpcError(-32014) });
    expect(isRetryable(wrapped)).toBe(true);
    expect(isRetryable(new Error("wrapper", { cause: networkError() }))).toBe(true);
  });

  it("does not retry any other JSON-RPC error", () => {
    for (const code of [-32000, -32005, -32013, -32015, -32603, -32601, 3, 4001, 1, 0]) {
      expect(isRetryable(rpcError(code)), String(code)).toBe(false);
    }
  });

  it("retries an HTTP 429 and every HTTP 5xx status, and nothing just outside them", () => {
    const withStatus = (status: number) => new HttpRequestError({ url: "https://rpc.example", status });
    for (const status of [429, 500, 502, 503, 504, 599]) expect(isRetryable(withStatus(status)), String(status)).toBe(true);
    for (const status of [200, 400, 401, 403, 404, 428, 430, 499, 600, 601]) {
      expect(isRetryable(withStatus(status)), String(status)).toBe(false);
    }
  });

  it("finds an HTTP status on a wrapped error too", () => {
    const wrapped = new Error("wrapper", { cause: new HttpRequestError({ url: "https://rpc.example", status: 503 }) });
    expect(isRetryable(wrapped)).toBe(true);
  });

  it("does not retry a failure after an HTTP response arrived, such as an unparsable body, or one with no marker", () => {
    expect(isRetryable(new HttpRequestError({ url: "https://rpc.example", cause: new SyntaxError("Unexpected token") }))).toBe(false);
    expect(isRetryable(new HttpRequestError({ url: "https://rpc.example", cause: new TypeError("fetch failed") }))).toBe(false);
    expect(isRetryable(new HttpRequestError({ url: "https://rpc.example" }))).toBe(false);
  });

  it("does not retry an ordinary failure", () => {
    expect(isRetryable(new Error("fetch failed"))).toBe(false);
    expect(isRetryable("-32014")).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe("LLR-FE-004 retry schedule", () => {
  it("waits exactly 250, 500, and 1000 ms", () => {
    expect([...RETRY_DELAYS_MS]).toEqual([250, 500, 1000]);
  });

  it("retries a failing read three times and then raises the last error", async () => {
    const sleeps: number[] = [];
    const attempt = vi.fn().mockImplementation(() => Promise.reject(rpcError(-32014)));
    await expect(retryRead(attempt, async (ms) => void sleeps.push(ms))).rejects.toMatchObject({ code: -32014 });
    expect(attempt).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([250, 500, 1000]);
  });

  it("returns the result of the first attempt that succeeds, after only the delays it needed", async () => {
    const sleeps: number[] = [];
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(rpcError(-32014))
      .mockResolvedValueOnce("ok");
    await expect(retryRead(attempt, async (ms) => void sleeps.push(ms))).resolves.toBe("ok");
    expect(sleeps).toEqual([250, 500]);
  });

  it("succeeds on the third and final retry", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce("late");
    await expect(retryRead(attempt, async () => {})).resolves.toBe("late");
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it("raises a failure that is not retryable at once, without waiting", async () => {
    const sleeps: number[] = [];
    const attempt = vi.fn().mockRejectedValue(rpcError(-32000));
    await expect(retryRead(attempt, async (ms) => void sleeps.push(ms))).rejects.toMatchObject({ code: -32000 });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  describe("on a transport, with timers", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("sends the next attempt after 250 ms and not before", async () => {
      const request = vi.fn().mockRejectedValueOnce(rpcError(-32014)).mockResolvedValue("0x1");
      const transport = retryingTransport(custom({ request }))({});
      const result = transport.request({ method: "eth_chainId" });
      await vi.advanceTimersByTimeAsync(249);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(request).toHaveBeenCalledTimes(2);
      await expect(result).resolves.toBe("0x1");
    });

    it("spaces three retries by 250, 500, and 1000 ms and then gives up", async () => {
      const request = vi.fn().mockImplementation(() => Promise.reject(rpcError(-32014)));
      const transport = retryingTransport(custom({ request }))({});
      const result = transport.request({ method: "eth_chainId" });
      const settled = result.then(
        () => "resolved",
        () => "rejected",
      );
      const countsAfter = async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
        return request.mock.calls.length;
      };
      expect(await countsAfter(249)).toBe(1);
      expect(await countsAfter(1)).toBe(2); // 250
      expect(await countsAfter(499)).toBe(2);
      expect(await countsAfter(1)).toBe(3); // 750
      expect(await countsAfter(999)).toBe(3);
      expect(await countsAfter(1)).toBe(4); // 1750
      expect(await countsAfter(60_000)).toBe(4);
      expect(await settled).toBe("rejected");
    });
  });
});

describe("LLR-FE-003 reads go through a fallback transport over the configured URLs in order", () => {
  const urls = ["https://one.example", "https://two.example", "https://three.example"];

  // A fetch that answers JSON-RPC from a per-URL script and records the order of calls.
  function scriptedFetch(script: Record<string, () => unknown>) {
    const seen: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input).replace(/\/$/, "");
      seen.push(url);
      const body = JSON.parse(String(init?.body)) as { id: number };
      const answer = script[url]?.();
      if (answer instanceof Error) throw answer;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, ...(answer as object) }), {
        headers: { "content-type": "application/json" },
      });
    };
    return { seen, fetchFn };
  }

  it("is a viem fallback transport holding one http transport per URL, in order", () => {
    const transport = createReadTransport(urls)({});
    expect(transport.config.type).toBe("fallback");
    const inner = (transport.value as { transports: { value?: { url?: string } }[] }).transports;
    expect(inner.map((t) => t.value?.url)).toEqual(urls);
  });

  it("asks the first URL first and leaves the others alone while it answers", async () => {
    const { seen, fetchFn } = scriptedFetch({ [urls[0] as string]: () => ({ result: "0x13" }) });
    const transport = createReadTransport(urls, { fetchFn })({});
    await expect(transport.request({ method: "eth_chainId" })).resolves.toBe("0x13");
    expect(seen).toEqual([urls[0]]);
  });

  it("moves to the next URL in order when one fails", async () => {
    const { seen, fetchFn } = scriptedFetch({
      [urls[0] as string]: () => new TypeError("fetch failed"),
      [urls[1] as string]: () => ({ error: { code: -32014, message: "requested data not available" } }),
      [urls[2] as string]: () => ({ result: "0x13" }),
    });
    const transport = createReadTransport(urls, { fetchFn })({});
    await expect(transport.request({ method: "eth_chainId" })).resolves.toBe("0x13");
    expect(seen).toEqual(urls);
  });

  describe("an HTTP status from the endpoint, through the real http transport", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // Answers each call from a queue of HTTP statuses; a 200 carries a JSON-RPC result.
    function statusFetch(statuses: number[]) {
      let calls = 0;
      const fetchFn = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const status = statuses[Math.min(calls++, statuses.length - 1)] as number;
        const { id } = JSON.parse(String(init?.body)) as { id: number };
        if (status !== 200) return new Response("busy", { status });
        return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: "0x13" }));
      };
      return { fetchFn, calls: () => calls };
    }

    it.each([429, 500, 503, 599])("retries a %i answer after 250 ms and uses the next answer", async (status) => {
      const { fetchFn, calls } = statusFetch([status, 200]);
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const result = transport.request({ method: "eth_chainId" });
      await vi.advanceTimersByTimeAsync(249);
      expect(calls()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe("0x13");
      expect(calls()).toBe(2);
    });

    // A non-OK answer that carries a JSON-RPC error body, which viem returns as an RPC error and not as an HTTP one.
    function bodyFetch(status: number, code: number, then200 = true) {
      let calls = 0;
      const fetchFn = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const n = calls++;
        const { id } = JSON.parse(String(init?.body)) as { id: number };
        if (n === 0 || !then200) {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message: "refused" } }), {
            status,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: "0x13" }), { headers: { "content-type": "application/json" } });
      };
      return { fetchFn, calls: () => calls };
    }

    it.each([
      [429, -32005],
      [503, -32603],
      [500, -32000],
      [599, -32603],
    ])("retries a %i answer that carries the JSON-RPC error %i", async (status, code) => {
      const { fetchFn, calls } = bodyFetch(status, code);
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const result = transport.request({ method: "eth_chainId" });
      await vi.advanceTimersByTimeAsync(250);
      await expect(result).resolves.toBe("0x13");
      expect(calls()).toBe(2);
    });

    it.each([
      [400, -32602],
      [404, -32601],
      [499, -32000],
    ])("does not retry a %i answer that carries the JSON-RPC error %i", async (status, code) => {
      const { fetchFn, calls } = bodyFetch(status, code, false);
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const settled = transport.request({ method: "eth_chainId" }).then(
        () => "resolved",
        () => "rejected",
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await settled).toBe("rejected");
      expect(calls()).toBe(1);
    });

    it("does not retry an HTTP 200 whose body cannot be parsed, since a response arrived", async () => {
      let calls = 0;
      const fetchFn = async (): Promise<Response> => {
        calls++;
        return new Response("<html>not json</html>", { status: 200, headers: { "content-type": "application/json" } });
      };
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const settled = transport.request({ method: "eth_chainId" }).then(
        () => "resolved",
        () => "rejected",
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await settled).toBe("rejected");
      expect(calls).toBe(1);
    });

    it("retries a request that was aborted, which viem reports as a timeout and which got no response", async () => {
      let calls = 0;
      const fetchFn = async (): Promise<Response> => {
        calls++;
        throw new DOMException("The operation was aborted", "AbortError");
      };
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const settled = transport.request({ method: "eth_chainId" }).then(
        () => "resolved",
        () => "rejected",
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await settled).toBe("rejected");
      expect(calls).toBe(4);
    });

    it("retries a request that got no HTTP response at all, and uses the next answer", async () => {
      let calls = 0;
      const fetchFn = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (calls++ < 2) throw new TypeError("fetch failed");
        const { id } = JSON.parse(String(init?.body)) as { id: number };
        return new Response(JSON.stringify({ jsonrpc: "2.0", id, result: "0x13" }), { headers: { "content-type": "application/json" } });
      };
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const result = transport.request({ method: "eth_chainId" });
      await vi.advanceTimersByTimeAsync(250 + 500);
      await expect(result).resolves.toBe("0x13");
      expect(calls).toBe(3);
    });

    it.each([400, 404, 428, 499])("does not retry a %i answer", async (status) => {
      const { fetchFn, calls } = statusFetch([status, 200]);
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const settled = transport.request({ method: "eth_chainId" }).then(
        () => "resolved",
        () => "rejected",
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await settled).toBe("rejected");
      expect(calls()).toBe(1);
    });

    it("gives up after three retries of a persistent 503", async () => {
      const { fetchFn, calls } = statusFetch([503]);
      const transport = createReadTransport(["https://one.example"], { fetchFn })({});
      const settled = transport.request({ method: "eth_chainId" }).then(
        () => "resolved",
        () => "rejected",
      );
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await settled).toBe("rejected");
      expect(calls()).toBe(4);
    });
  });

  describe("when every URL fails", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("tries the whole list again after the retry delay, three times at most", async () => {
      const { seen, fetchFn } = scriptedFetch(
        Object.fromEntries(urls.map((u) => [u, () => ({ error: { code: -32014, message: "requested data not available" } })])),
      );
      const transport = createReadTransport(urls, { fetchFn })({});
      const settled = transport.request({ method: "eth_chainId" }).then(
        () => "resolved",
        () => "rejected",
      );
      await vi.advanceTimersByTimeAsync(249);
      expect(seen).toEqual(urls);
      await vi.advanceTimersByTimeAsync(1);
      expect(seen).toEqual([...urls, ...urls]);
      await vi.advanceTimersByTimeAsync(500 + 1000);
      expect(seen).toHaveLength(urls.length * 4);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(seen).toHaveLength(urls.length * 4);
      expect(await settled).toBe("rejected");
    });
  });
});
