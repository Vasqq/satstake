import { afterEach, describe, expect, it, vi } from "vitest";
import { ChainClock } from "./clock";

afterEach(() => vi.useRealTimers());

describe("LLR-FE-012 chain time", () => {
  const fake = (start: number) => {
    let t = start;
    return { monotonic: () => t, advance: (ms: number) => void (t += ms) };
  };

  it("is unknown until the first block has been read", () => {
    expect(new ChainClock(fake(0).monotonic).now()).toBeNull();
  });

  it("is the block timestamp at the moment the block was fetched", () => {
    const m = fake(5_000);
    const clock = new ChainClock(m.monotonic);
    clock.sync(1_000n);
    expect(clock.now()).toBe(1_000n);
  });

  it("adds the whole seconds elapsed locally since the block was fetched", () => {
    const m = fake(5_000);
    const clock = new ChainClock(m.monotonic);
    clock.sync(1_000n);
    m.advance(999);
    expect(clock.now()).toBe(1_000n);
    m.advance(1);
    expect(clock.now()).toBe(1_001n);
    m.advance(59_000);
    expect(clock.now()).toBe(1_060n);
  });

  it("counts from the reading taken when the block arrived, not from the later call to sync", () => {
    const m = fake(0);
    const clock = new ChainClock(m.monotonic);
    const arrived = clock.mark();
    m.advance(3_000);
    clock.sync(1_000n, arrived);
    expect(clock.now()).toBe(1_003n);
  });

  it("starts again from each new block, not from the sum of earlier ones", () => {
    const m = fake(0);
    const clock = new ChainClock(m.monotonic);
    clock.sync(1_000n);
    m.advance(4_000);
    expect(clock.now()).toBe(1_004n);
    clock.sync(1_003n);
    expect(clock.now()).toBe(1_003n);
    m.advance(1_500);
    expect(clock.now()).toBe(1_004n);
  });

  it("can move backwards when a lagging RPC returns an older block, because the latest block is authoritative", () => {
    const m = fake(0);
    const clock = new ChainClock(m.monotonic);
    clock.sync(1_000n);
    m.advance(10_000);
    clock.sync(1_002n);
    expect(clock.now()).toBe(1_002n);
  });

  it("never subtracts when the local monotonic reading moves backwards", () => {
    const m = fake(10_000);
    const clock = new ChainClock(m.monotonic);
    clock.sync(1_000n);
    m.advance(-5_000);
    expect(clock.now()).toBe(1_000n);
  });

  it("stays on the monotonic reading, so a device clock set wrongly changes nothing", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const clock = new ChainClock();
    clock.sync(1_000n);
    vi.setSystemTime(new Date("2031-01-01T00:00:00Z"));
    expect(clock.now()).toBe(1_000n);
  });

  it("treats a deadline as reached exactly when chain time equals it", () => {
    const m = fake(0);
    const clock = new ChainClock(m.monotonic);
    clock.sync(1_990n);
    const deadline = 2_000n;
    m.advance(9_999);
    expect((clock.now() ?? 0n) >= deadline).toBe(false);
    m.advance(1);
    expect((clock.now() ?? 0n) >= deadline).toBe(true);
  });
});
