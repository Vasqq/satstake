import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POLL_INTERVAL_MS, createPoller } from "./poller";

let visibility: "visible" | "hidden" = "visible";
const setVisibility = (next: "visible" | "hidden") => {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("LLR-FE-011 polling while the page is visible", () => {
  it("polls every 4 seconds", () => {
    expect(POLL_INTERVAL_MS).toBe(4_000);
  });

  it("reads once at once, then once per 4 seconds, not a millisecond early", async () => {
    const poll = vi.fn();
    const poller = createPoller(poll);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(poll).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it("stops polling while the page is hidden", async () => {
    const poll = vi.fn();
    const poller = createPoller(poll);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(poll).toHaveBeenCalledTimes(2);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(poll).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("reads again as soon as the page is visible, then returns to every 4 seconds", async () => {
    const poll = vi.fn();
    const poller = createPoller(poll);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(poll).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it("does not read at all when it starts on a hidden page, until the page is shown", async () => {
    visibility = "hidden";
    const poll = vi.fn();
    const poller = createPoller(poll);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(poll).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(poll).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("runs one timer at a time when visibility flips repeatedly", async () => {
    const poll = vi.fn();
    const poller = createPoller(poll);
    setVisibility("hidden");
    setVisibility("visible");
    setVisibility("hidden");
    setVisibility("visible");
    expect(poll).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(poll).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it("stops for good, and stops listening, when told to stop", async () => {
    const poll = vi.fn();
    const poller = createPoller(poll);
    poller.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    setVisibility("hidden");
    setVisibility("visible");
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("keeps polling after a read fails", async () => {
    const poll = vi.fn().mockRejectedValue(new Error("rpc down"));
    const poller = createPoller(poll);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(poll).toHaveBeenCalledTimes(3);
    poller.stop();
  });
});
