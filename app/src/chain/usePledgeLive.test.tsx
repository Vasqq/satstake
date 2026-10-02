import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError, createPublicClient } from "viem";
import { selectNetwork } from "../config/networks";
import { FakeChain } from "../test/fakeChain";
import { createReads } from "./reads";
import { usePledgeLive } from "./usePledgeLive";

const network = selectNetwork("testnet");
let chain: FakeChain;

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  chain = new FakeChain(network.contract);
  chain.addPledge(1n);
  chain.blockTimestamp = 1_000n;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = () => {
  const reads = createReads(createPublicClient({ transport: chain.transport }), network.contract);
  return renderHook(() => usePledgeLive(reads, 1n));
};

describe("LLR-FE-012 chain time follows the latest block on every poll", () => {
  it("has no chain time before the first poll has answered", () => {
    const { result } = mount();
    expect(result.current.clock.now()).toBeNull();
    expect(result.current.state).toBeNull();
  });

  it("synchronizes to the block read by the first poll and then counts local time", async () => {
    const { result } = mount();
    await advance(0);
    expect(result.current.state).toBe("Active");
    expect(result.current.clock.now()).toBe(1_000n);
    await advance(3_000);
    expect(result.current.clock.now()).toBe(1_003n);
  });

  it("re-synchronizes on each poll, taking the block's time over the local count", async () => {
    const { result } = mount();
    await advance(0);
    chain.blockTimestamp = 1_010n;
    await advance(4_000);
    expect(result.current.clock.now()).toBe(1_010n);
    chain.blockTimestamp = 1_012n;
    await advance(4_000);
    expect(result.current.clock.now()).toBe(1_012n);
  });

  it("keeps the last state when a poll fails, and recovers on the next", async () => {
    const { result } = mount();
    await advance(0);
    chain.blockTimestamp = 1_004n;
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    chain.states.set(1n, 3);
    await advance(4_000);
    expect(result.current.state).toBe("Active");
    expect(result.current.error).not.toBeNull();
    expect(result.current.clock.now()).toBe(1_004n);
    chain.callError = undefined;
    await advance(4_000);
    expect(result.current.state).toBe("Broken");
    expect(result.current.error).toBeNull();
  });
});

describe("LLR-FE-012 chain time is measured from when the block was fetched", () => {
  const after = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const slow = (functionName: string, ms: number) => {
    chain.latency = (r) => (r.functionName === functionName ? after(ms) : undefined);
  };

  it("counts from the block's arrival when stateOf is the slower answer", async () => {
    slow("stateOf", 3_000);
    const { result } = mount();
    await advance(0);
    expect(result.current.clock.now()).toBe(1_000n);
    expect(result.current.state).toBeNull();
    await advance(3_000);
    expect(result.current.state).toBe("Active");
    expect(result.current.clock.now()).toBe(1_003n);
  });

  it("counts from the block's arrival when the block is the slower answer", async () => {
    chain.latency = (r) => (r.method === "eth_getBlockByNumber" ? after(3_000) : undefined);
    const { result } = mount();
    await advance(2_999);
    expect(result.current.state).toBe("Active");
    expect(result.current.clock.now()).toBeNull();
    await advance(1);
    expect(result.current.clock.now()).toBe(1_000n);
    await advance(2_000);
    expect(result.current.clock.now()).toBe(1_002n);
  });

  it("still synchronizes to the block when stateOf fails, and reports the failure", async () => {
    chain.latency = (r) =>
      r.functionName === "stateOf" ? Promise.reject(new HttpRequestError({ url: "https://rpc.example" })) : undefined;
    const { result } = mount();
    await advance(0);
    expect(result.current.clock.now()).toBe(1_000n);
    expect(result.current.state).toBeNull();
    expect(result.current.error).not.toBeNull();
    chain.blockTimestamp = 1_020n;
    await advance(4_000);
    expect(result.current.clock.now()).toBe(1_020n);
  });

  it("still shows the state when the block read fails, and keeps the last clock", async () => {
    const { result } = mount();
    await advance(0);
    chain.latency = (r) =>
      r.method === "eth_getBlockByNumber" ? Promise.reject(new HttpRequestError({ url: "https://rpc.example" })) : undefined;
    chain.states.set(1n, 2);
    await advance(4_000);
    expect(result.current.state).toBe("Kept");
    expect(result.current.error).not.toBeNull();
    expect(result.current.clock.now()).toBe(1_004n);
  });
});

describe("LLR-FE-011 an older answer that arrives late never replaces a newer one", () => {
  const after = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it("keeps the newer state when the first poll's stateOf answers after the second poll's", async () => {
    let stateCalls = 0;
    chain.latency = (r) => (r.functionName === "stateOf" && stateCalls++ === 0 ? after(6_000) : undefined);
    const { result } = mount();
    await advance(0);
    chain.states.set(1n, 2);
    await advance(4_000);
    expect(result.current.state).toBe("Kept");
    await advance(2_000);
    expect(result.current.state).toBe("Kept");
  });

  it("keeps the newer chain time when the first poll's block answers after the second poll's", async () => {
    let blockCalls = 0;
    chain.latency = (r) => (r.method === "eth_getBlockByNumber" && blockCalls++ === 0 ? after(6_000) : undefined);
    const { result } = mount();
    await advance(0);
    chain.blockTimestamp = 1_004n;
    await advance(4_000);
    expect(result.current.clock.now()).toBe(1_004n);
    await advance(2_000);
    expect(result.current.clock.now()).toBe(1_006n);
  });

  it("does not report a block failure of the first poll that arrives after the second poll's block succeeded", async () => {
    let blockCalls = 0;
    chain.latency = (r) =>
      r.method === "eth_getBlockByNumber" && blockCalls++ === 0
        ? after(6_000).then(() => Promise.reject(new HttpRequestError({ url: "https://rpc.example" })))
        : undefined;
    const { result } = mount();
    await advance(4_000);
    expect(result.current.clock.now()).toBe(1_000n);
    await advance(2_000);
    expect(result.current.error).toBeNull();
    expect(result.current.clock.now()).toBe(1_002n);
  });

  it("still shows an answer when every read takes longer than the poll interval", async () => {
    chain.latency = () => after(5_000);
    const { result } = mount();
    await advance(5_000);
    expect(result.current.state).toBe("Active");
    expect(result.current.clock.now()).toBe(1_000n);
    chain.states.set(1n, 2);
    await advance(8_000);
    expect(result.current.state).toBe("Kept");
  });

  it("does not report a failure of the first poll that arrives after the second poll succeeded", async () => {
    let stateCalls = 0;
    chain.latency = (r) =>
      r.functionName === "stateOf" && stateCalls++ === 0
        ? after(6_000).then(() => Promise.reject(new HttpRequestError({ url: "https://rpc.example" })))
        : undefined;
    const { result } = mount();
    await advance(4_000);
    expect(result.current.state).toBe("Active");
    await advance(2_000);
    expect(result.current.error).toBeNull();
    expect(result.current.state).toBe("Active");
  });
});
