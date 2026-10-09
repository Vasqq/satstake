import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReads } from "../../chain/reads";
import { selectNetwork } from "../../config/networks";
import { FakeChain, samplePledge } from "../../test/fakeChain";
import { createPublicClient } from "viem";
import { ROLE_LABELS } from "../roles";
import { STATE_NAMES } from "../stateLabels";
import { PromiseRotator } from "./PromiseRotator";

// Not the shared wallet harness: it mounts the whole application, and the card needs only a query client.
const network = selectNetwork("testnet");
const ROTATE_MS = 8_000;
const region = () => screen.queryByRole("region", { name: `Recent promises on ${network.name}` });
const idLink = () => within(region()!).getByRole("link", { name: /^Open promise #\d+: / });
const idNow = () => /^Promise #(\d+)/.exec(region()!.querySelector("[data-current] .label")?.textContent ?? "")?.[1];
const pauseButton = () => within(region()!).getByRole("button", { name: /the rotation$/ });

function chainWith(count: number, make: (id: number) => Partial<typeof samplePledge> = () => ({})): FakeChain {
  const chain = new FakeChain(network.contract);
  chain.chainId = network.chainId;
  chain.blockTimestamp = 1_789_500_000n;
  for (let id = 1; id <= count; id++) chain.addPledge(BigInt(id), { ...samplePledge, promiseText: `Promise text ${id}`, ...make(id) }, 0);
  return chain;
}

function show(chain: FakeChain) {
  const reads = createReads(createPublicClient({ transport: chain.transport }), network.contract);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PromiseRotator reads={reads} network={network} />
    </QueryClientProvider>,
  );
}

const settle = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  cleanup();
});

describe("LLR-FE-070 the rotating card reads only from the contract's views", () => {
  it("calls only pledgeCount, getPledge and stateOf for pledge data, and never reads logs", async () => {
    const chain = chainWith(3);
    show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    const functions = new Set(chain.requests.filter((r) => r.method === "eth_call").map((r) => r.functionName));
    expect([...functions].sort()).toEqual(["getPledge", "pledgeCount", "stateOf"]);
    expect(chain.count("eth_getLogs")).toBe(0);
  });

  it("reads at most eight pledges and shows them newest first", async () => {
    const chain = chainWith(12);
    show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(chain.count("eth_call", "getPledge")).toBe(8);
    expect(chain.count("eth_call", "stateOf")).toBe(8);
    const seen = [idNow()];
    for (let i = 0; i < 7; i++) {
      await settle(ROTATE_MS + 100);
      seen.push(idNow());
    }
    expect(seen).toEqual(["12", "11", "10", "9", "8", "7", "6", "5"]);
    await settle(ROTATE_MS + 100);
    expect(idNow()).toBe("12");
  });

  it("reads every pledge when there are fewer than eight, down to the first", async () => {
    const chain = chainWith(3);
    show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(chain.count("eth_call", "getPledge")).toBe(3);
    expect(idNow()).toBe("3");
  });

  it("shows nothing while the count is unknown", async () => {
    const chain = chainWith(3);
    chain.gate = new Promise<void>(() => {});
    show(chain);
    await settle(50);
    expect(region()).toBeNull();
  });

  it("shows nothing when there are no promises", async () => {
    const chain = chainWith(0);
    show(chain);
    await settle(200);
    expect(chain.count("eth_call", "pledgeCount")).toBe(1);
    expect(region()).toBeNull();
    expect(chain.count("eth_call", "getPledge")).toBe(0);
    expect(chain.count("eth_getBlockByNumber")).toBe(0);
  });

  it("skips a promise whose read fails, and invents none in its place", async () => {
    const chain = chainWith(3);
    chain.states.delete(3n);
    show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(idNow()).toBe("2");
    expect(screen.queryByText(/Promise text 3/)).toBeNull();
    expect(within(region()!).getByText("01 / 02")).toBeTruthy();
  });

  it("shows no card when every read fails", async () => {
    const chain = chainWith(2);
    chain.states.clear();
    show(chain);
    await settle(200);
    expect(region()).toBeNull();
  });
});

describe("LLR-FE-070 what a slide says", () => {
  it("shows the promise as written, the stake, and the three parties by short address", async () => {
    const chain = chainWith(1, () => ({ promiseText: "Run 5 km before Friday" }));
    show(chain);
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(card).getByText(/Run 5 km before Friday/)).toBeTruthy();
    expect(within(card).getByText(/\$2\.50 in USDC/)).toBeTruthy();
    for (const [label, address] of [
      [ROLE_LABELS.staker, samplePledge.staker],
      [ROLE_LABELS.referee, samplePledge.referee],
      [ROLE_LABELS.beneficiary, samplePledge.beneficiary],
    ] as const) {
      const term = within(card).getByText(label);
      expect(term.parentElement!.textContent).toContain(`${address.slice(0, 6)}…${address.slice(-4)}`);
    }
  });

  it("links the slide to its promise page", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(idLink().getAttribute("href")).toBe("#/p/3");
  });

  it("gives an open promise a clock whose name says the time left in words, from chain time", async () => {
    // 1_790_000_000 - 1_789_500_000 = 500_000 s = 5 days 18 hours 53 minutes.
    show(chainWith(1));
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    const clock = within(card).getByRole("img", { name: "Time left: 5 days 18 hours" });
    expect(clock.textContent).toMatch(/^05d\s*18h\s*53m\s*\d\ds$/);
    expect(within(card).getByText(/^Deadline /)).toBeTruthy();
    expect(within(card).getByText("Open")).toBeTruthy();
  });

  it("counts down with the chain's time, not the device's", async () => {
    const chain = chainWith(1, () => ({ deadline: 1_789_500_000n + 65n }));
    show(chain);
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(card).getByRole("img").textContent).toMatch(/00d\s*00h\s*01m\s*0[0-5]s/);
    await settle(10_000);
    expect(within(card).getByRole("img").textContent).toMatch(/00d\s*00h\s*00m\s*[45]\ds/);
  });

  it("says the deadline has passed at the second it names, not one second later", async () => {
    show(chainWith(1, () => ({ deadline: 1_789_500_000n })));
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(card).getByRole("img", { name: "Deadline passed" })).toBeTruthy();
    expect(within(card).getByText("Deadline passed", { selector: "span" })).toBeTruthy();
  });

  it("says the deadline has passed when chain time is past an open promise's deadline", async () => {
    show(chainWith(1, () => ({ deadline: 1_789_500_000n - 5n })));
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(card).getByRole("img", { name: "Deadline passed" })).toBeTruthy();
  });

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  it.each([
    [2, STATE_NAMES.Kept, "Kept", "goes back to", samplePledge.staker],
    [3, STATE_NAMES.Broken, "Broken", "goes to", samplePledge.beneficiary],
    [1, STATE_NAMES.Expired, "No answer", "goes to", samplePledge.beneficiary],
    [4, STATE_NAMES.SettledToStaker, "Paid back", "went back to", samplePledge.staker],
    [5, STATE_NAMES.SettledToBeneficiary, "Paid out", "went to", samplePledge.beneficiary],
  ] as const)("shows state %i under the page's name for it, %s, with the outcome word %s and where the stake goes", async (state, word, big, phrase, who) => {
    const chain = chainWith(1);
    chain.states.set(1n, state);
    show(chain);
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(card).getAllByText(word).length).toBeGreaterThan(0);
    expect(within(card).getByText(big, { selector: "p" })).toBeTruthy();
    expect(within(card).queryByRole("img")).toBeNull();
    const where = within(card).getByText(new RegExp(`stake ${phrase}`));
    expect(where.textContent).toContain(short(who));
    expect(within(card).queryByText(/^Deadline /)).toBeNull();
    // Silence counts as broken is said only where silence is what happened.
    expect(within(card).queryAllByText(/Silence counts as broken/).length).toBe(state === 1 ? 1 : 0);
  });
});

describe("LLR-FE-070 the card is a carousel that is never announced and never moves the page", () => {
  it("is labelled as a carousel of recent promises on the network and holds no live region", async () => {
    show(chainWith(3));
    const card = await screen.findByRole("region", { name: `Recent promises on ${network.name}` });
    expect(card.getAttribute("aria-roledescription")).toBe("carousel");
    expect(card.querySelector("[aria-live], [role=status], [role=alert], [role=timer]")).toBeNull();
  });

  it("offers a pause control that starts unpressed and says what pressing does", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(pauseButton().getAttribute("aria-pressed")).toBe("false");
    expect(pauseButton().getAttribute("aria-label")).toBe("Pause the rotation");
    fireEvent.click(pauseButton());
    expect(pauseButton().getAttribute("aria-pressed")).toBe("true");
    expect(pauseButton().getAttribute("aria-label")).toBe("Resume the rotation");
  });

  it("has no pause control and does not rotate with one promise", async () => {
    show(chainWith(1));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(region()!).queryByRole("button")).toBeNull();
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("1");
  });

  it("runs no transition and no timer work for a single promise", async () => {
    const calls: unknown[] = [];
    HTMLElement.prototype.animate = function () {
      calls.push(1);
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    show(chainWith(1));
    await screen.findByRole("region", { name: /Recent promises/ });
    await settle(ROTATE_MS * 2);
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    expect(calls.length).toBe(0);
  });

  it("shows the position as a padded counter hidden from assistive technology", async () => {
    show(chainWith(4));
    await screen.findByRole("region", { name: /Recent promises/ });
    const counter = within(region()!).getByText("01 / 04");
    expect(counter.getAttribute("aria-hidden")).toBe("true");
    await settle(ROTATE_MS + 100);
    expect(within(region()!).getByText("02 / 04")).toBeTruthy();
  });
});

describe("LLR-FE-070 the rotation", () => {
  it("advances after eight seconds and not before", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    await settle(ROTATE_MS - 400);
    expect(idNow()).toBe("3");
    await settle(800);
    expect(idNow()).toBe("2");
  });

  it("does not advance while paused by the button, and carries on when resumed", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    fireEvent.click(pauseButton());
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
    fireEvent.click(pauseButton());
    await settle(ROTATE_MS + 200);
    expect(idNow()).toBe("2");
  });

  it("does not advance while the pointer is over the card", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    fireEvent.pointerEnter(region()!);
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
    fireEvent.pointerLeave(region()!);
    await settle(ROTATE_MS + 200);
    expect(idNow()).toBe("2");
  });

  it("does not advance while focus is inside the card", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    fireEvent.focusIn(pauseButton());
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
    fireEvent.focusOut(pauseButton(), { relatedTarget: document.body });
    await settle(ROTATE_MS + 200);
    expect(idNow()).toBe("2");
  });

  it("keeps waiting when focus moves from one control inside the card to another", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    fireEvent.focusIn(pauseButton());
    fireEvent.focusOut(pauseButton(), { relatedTarget: idLink() });
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
  });

  it("does not advance while the page is hidden", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await settle(ROTATE_MS + 200);
    expect(idNow()).toBe("2");
  });

  it("does not advance when the page was already hidden as the card appeared", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
  });

  it("does not advance while less than a quarter of the card is visible", async () => {
    const observers: { callback: IntersectionObserverCallback; options?: IntersectionObserverInit }[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          observers.push({ callback, options });
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(observers[0]?.options?.threshold).toBe(0.25);
    const report = (isIntersecting: boolean) =>
      act(() => observers[0]!.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
    report(false);
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
    report(true);
    await settle(ROTATE_MS + 200);
    expect(idNow()).toBe("2");
  });

  it("does not skip a slide when one tick arrives very late", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    vi.setSystemTime(Date.now() + 60_000);
    await settle(150);
    expect(idNow()).toBe("3");
  });

  it("keeps the time already waited when paused and resumed, rather than starting over", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    await settle(6_000);
    fireEvent.click(pauseButton());
    await settle(20_000);
    fireEvent.click(pauseButton());
    await settle(2_300);
    expect(idNow()).toBe("2");
  });
});

describe("LLR-FE-072 the motion between slides", () => {
  function stubAnimate(reduced: boolean) {
    const calls: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} }));
    HTMLElement.prototype.animate = function (keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ keyframes, options });
      return { finished: Promise.resolve(), cancel() {} } as unknown as Animation;
    };
    return calls;
  }

  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it("fades and lifts out in 180 ms, then comes in over 420 ms with a 50 ms stagger", async () => {
    const calls = stubAnimate(false);
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    await settle(ROTATE_MS + 100);
    const out = calls.filter((c) => c.options.duration === 180);
    const into = calls.filter((c) => c.options.duration === 420);
    expect(out.length).toBeGreaterThan(1);
    expect(into.map((c) => c.options.delay)).toEqual(into.map((_, k) => k * 50));
    expect(into.length).toBe(out.length);
    expect(JSON.stringify(out[0]!.keyframes)).toContain("blur(4px)");
    expect(idNow()).toBe("2");
  });

  it("uses only a 200 ms opacity fade under reduced motion, once the visitor starts the rotation", async () => {
    const calls = stubAnimate(true);
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    fireEvent.click(pauseButton());
    await settle(ROTATE_MS + 100);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c.options.duration).toBe(200);
      for (const frame of c.keyframes) expect(Object.keys(frame)).toEqual(["opacity"]);
    }
    expect(idNow()).toBe("2");
  });
});

describe("LLR-FE-070 the card is as tall as its tallest slide and keeps the others out of reach", () => {
  const slides = () => [...region()!.querySelectorAll<HTMLElement>(".home-rot-slide")];

  it("renders every slide in the page, so the card takes the height of the tallest, and marks only the shown one as current", async () => {
    show(chainWith(3, (id) => ({ promiseText: id === 2 ? "A much longer promise ".repeat(8) : `Promise text ${id}` })));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(slides()).toHaveLength(3);
    expect(slides().filter((el) => el.getAttribute("aria-hidden") !== "true")).toHaveLength(1);
    expect(idNow()).toBe("3");
  });

  it("hides the other slides from assistive technology and takes their links out of the tab order", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    const hidden = slides().filter((el) => el.getAttribute("aria-hidden") === "true");
    expect(hidden).toHaveLength(2);
    for (const el of hidden) {
      expect(el.hasAttribute("inert")).toBe(true);
      expect(el.querySelector("a")).not.toBeNull();
    }
    const current = slides().find((el) => el.getAttribute("aria-hidden") !== "true")!;
    expect(current.hasAttribute("inert")).toBe(false);
    expect(within(region()!).getAllByRole("link")).toHaveLength(1);
  });

  it("moves the current mark to the next slide when the rotation advances", async () => {
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    await settle(ROTATE_MS + 100);
    const current = slides().filter((el) => !el.hasAttribute("inert"));
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toContain("Promise text 2");
    expect(slides().filter((el) => el.hasAttribute("inert"))).toHaveLength(2);
  });

  it("puts nothing in the page for a single promise but that slide, current", async () => {
    show(chainWith(1));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(slides()).toHaveLength(1);
    expect(slides()[0]!.hasAttribute("inert")).toBe(false);
    expect(slides()[0]!.getAttribute("aria-hidden")).not.toBe("true");
  });
});

describe("LLR-FE-072 under reduced motion the card starts paused", () => {
  const reduce = (reduced: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} }));

  it("shows the play state and does not rotate until the visitor starts it", async () => {
    reduce(true);
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(pauseButton().getAttribute("aria-pressed")).toBe("true");
    expect(pauseButton().getAttribute("aria-label")).toBe("Resume the rotation");
    await settle(ROTATE_MS * 3);
    expect(idNow()).toBe("3");
  });

  it("lets the visitor start it, and then it rotates", async () => {
    reduce(true);
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    fireEvent.click(pauseButton());
    expect(pauseButton().getAttribute("aria-pressed")).toBe("false");
    await settle(ROTATE_MS + 200);
    expect(idNow()).toBe("2");
  });

  it("starts running when the visitor has no reduced-motion preference", async () => {
    reduce(false);
    show(chainWith(3));
    await screen.findByRole("region", { name: /Recent promises/ });
    expect(pauseButton().getAttribute("aria-pressed")).toBe("false");
    await settle(ROTATE_MS + 200);
    expect(idNow()).toBe("2");
  });
});

describe("LLR-FE-070 the card is read again every 30 seconds while the page is visible", () => {
  const REFRESH_MS = 30_000;
  const counter = () => within(region()!).getByText(/^\d\d \/ \d\d$/).textContent;

  it("shows a new newest promise once the count has grown, and reads only the contract's views", async () => {
    const chain = chainWith(3);
    show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    fireEvent.click(pauseButton());
    expect(counter()).toBe("01 / 03");
    chain.addPledge(4n, { ...samplePledge, promiseText: "Promise text 4" }, 0);
    await settle(REFRESH_MS + 500);
    expect(counter()).toBe("02 / 04");
    expect(idNow()).toBe("3");
    const functions = new Set(chain.requests.filter((r) => r.method === "eth_call").map((r) => r.functionName));
    expect([...functions].sort()).toEqual(["getPledge", "pledgeCount", "stateOf"]);
    expect(chain.count("eth_getLogs")).toBe(0);
  });

  it("shows the state a later read finds for a promise already on the card", async () => {
    const chain = chainWith(1);
    show(chain);
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(card).getByText("Open")).toBeTruthy();
    chain.states.set(1n, 2);
    await settle(REFRESH_MS + 500);
    expect(within(card).getByText(STATE_NAMES.Kept, { selector: "span" })).toBeTruthy();
  });

  it("reads nothing between two refreshes, and nothing while the page is hidden", async () => {
    const chain = chainWith(2);
    show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    const before = chain.count("eth_call", "pledgeCount");
    await settle(REFRESH_MS - 2_000);
    expect(chain.count("eth_call", "pledgeCount")).toBe(before);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    await settle(REFRESH_MS * 3);
    expect(chain.count("eth_call", "pledgeCount")).toBe(before);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    await settle(REFRESH_MS + 500);
    expect(chain.count("eth_call", "pledgeCount")).toBeGreaterThan(before);
  });

  it("keeps the card when a refresh fails, rather than clearing it", async () => {
    const chain = chainWith(2);
    show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    chain.states.clear();
    await settle(REFRESH_MS + 500);
    expect(region()).not.toBeNull();
    expect(idNow()).toBeDefined();
  });

  it("tries the block time again after 30 seconds when the first read failed, instead of saying it is reading for good", async () => {
    const chain = chainWith(1);
    chain.blockError = new Error("block unavailable");
    show(chain);
    const card = await screen.findByRole("region", { name: /Recent promises/ });
    expect(within(card).getByText("Reading the time from the network")).toBeTruthy();
    expect(within(card).queryByRole("img")).toBeNull();
    chain.blockError = undefined;
    await settle(REFRESH_MS + 500);
    expect(within(card).queryByText("Reading the time from the network")).toBeNull();
    expect(within(card).getByRole("img", { name: /^Time left: / })).toBeTruthy();
  });

  it("stops reading when the card is left", async () => {
    const chain = chainWith(2);
    const view = show(chain);
    await screen.findByRole("region", { name: /Recent promises/ });
    view.unmount();
    const before = chain.requests.length;
    await settle(REFRESH_MS * 3);
    expect(chain.requests.length).toBe(before);
  });
});
