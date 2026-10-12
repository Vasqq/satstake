import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ink, satStakeSignature } from "./ink";
import { SignaturePad } from "./SignaturePad";

const calls: string[] = [];
const context = {
  arc: () => calls.push("arc"),
  beginPath: () => {},
  fill: () => {},
  clearRect: () => calls.push("clear"),
  setTransform: () => {},
  drawImage: () => {},
  fillStyle: "",
  globalAlpha: 1,
};

const dots = () => calls.filter((c) => c === "arc").length;
const area = () => document.querySelector(".pad-area") as HTMLElement;

function motion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
}

const useTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  // jsdom has no layout, so the pad is given the size it has on a desktop.
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 800, height: 240 } as DOMRect);
  motion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LLR-FE-037 the signature is a fixed drawing of the word SatStake", () => {
  it("is the same strokes every time for the same size, inside the pad, and reads as connected cursive strokes", () => {
    const a = satStakeSignature(800, 240);
    expect(satStakeSignature(800, 240)).toEqual(a);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.length).toBeLessThanOrEqual(8);
    // The two long strokes are the words themselves, each written without lifting the pen.
    const words = a.filter((stroke) => stroke.length > 80);
    expect(words.length).toBeGreaterThanOrEqual(2);
    expect(words.length).toBeLessThanOrEqual(3);
    for (const stroke of a) expect(stroke.length).toBeGreaterThan(10);
    for (const p of a.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(800);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(240);
    }
  });

  it("spans most of the width of the pad and keeps inside it at a phone width and a wide one", () => {
    for (const [w, h] of [
      [320, 240],
      [800, 240],
      [1400, 240],
    ] as const) {
      const xs = satStakeSignature(w, h)
        .flat()
        .map((p) => p.x);
      expect(Math.min(...xs), `${w} left`).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs), `${w} right`).toBeLessThanOrEqual(w);
      if (w <= 800) expect(Math.max(...xs) - Math.min(...xs), `${w} span`).toBeGreaterThan(w * 0.55);
      // The × sits at 6% of the width, so on a wide pad the name starts beside it and not in the middle.
      if (w >= 1400) {
        expect(Math.min(...xs), `${w} starts after the mark`).toBeLessThan(w * 0.16);
        expect(Math.min(...xs), `${w} clears the mark`).toBeGreaterThan(w * 0.05);
      }
    }
  });

  it("takes its time from the stroke alone: every point moves forward in time, and the pen stays down inside a stroke", () => {
    const strokes = satStakeSignature(800, 240);
    for (const stroke of strokes) {
      for (let i = 1; i < stroke.length; i++) expect(stroke[i]!.t).toBeGreaterThan(stroke[i - 1]!.t);
    }
    for (let i = 1; i < strokes.length; i++) {
      const gap = strokes[i]![0]!.t - strokes[i - 1]![strokes[i - 1]!.length - 1]!.t;
      expect(gap, `lift before stroke ${i}`).toBeGreaterThan(40);
    }
    expect(strokes[strokes.length - 1]!.at(-1)!.t).toBeGreaterThan(1000);
    expect(strokes[strokes.length - 1]!.at(-1)!.t).toBeLessThan(1600);
  });

  it("draws the line under the name on the pad's rule, on a phone width and a wide one", () => {
    for (const [w, h] of [
      [360, 220],
      [900, 280],
      [1400, 240],
    ] as const) {
      const line = satStakeSignature(w, h).at(-1)!;
      const rule = h * 0.68;
      for (const p of line) expect(Math.abs(p.y - rule), `${w} wide`).toBeLessThan(2);
      expect(line[0]!.x, `${w} start`).toBeGreaterThan(w * 0.06);
      expect(line[0]!.x, `${w} start`).toBeLessThan(w * 0.06 + 36);
    }
  });
});

describe("LLR-FE-037 the pad shows no signature until it is told the promise exists", () => {
  it("shows the empty signature line, writes no ink however long it waits, and says nothing is signed", async () => {
    useTimers();
    render(<SignaturePad head={<span>head</span>} foot={<span>foot</span>} />);
    await advance(10_000);
    expect(dots()).toBe(0);
    expect(document.querySelector(".baseline")).not.toBeNull();
    expect(document.querySelector(".baseline")?.textContent).toBe("");
    expect(area().getAttribute("role")).toBeNull();
    expect(area().getAttribute("aria-label")).toBeNull();
    expect(area().textContent).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
    expect(document.body.textContent).not.toMatch(/signed|example/i);
  });

  it("holds the head and the foot it is given", () => {
    render(<SignaturePad head={<b>the head</b>} foot={<i>the foot</i>} />);
    expect(screen.getByText("the head")).toBeTruthy();
    expect(screen.getByText("the foot")).toBeTruthy();
  });

  it("holds the empty line on a pad with no canvas to write on, and does not call it signed", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    const onSigned = vi.fn();
    render(<SignaturePad head={null} foot={null} onSigned={onSigned} />);
    expect(onSigned).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("LLR-FE-037 once it is told, the pad writes one signature and keeps it", () => {
  it("writes the signature in about a second and a half, tells its owner once when it is done, and stays drawn", async () => {
    useTimers();
    const onSigned = vi.fn();
    const view = render(<SignaturePad head={null} foot={null} onSigned={onSigned} />);
    view.rerender(<SignaturePad head={null} foot={null} signed onSigned={onSigned} />);
    await advance(500);
    expect(onSigned).not.toHaveBeenCalled();
    expect(dots()).toBeGreaterThan(20);
    await advance(1500);
    expect(onSigned).toHaveBeenCalledTimes(1);
    expect(dots()).toBeGreaterThan(300);
    const written = dots();
    const clears = calls.filter((c) => c === "clear").length;
    await advance(10_000);
    expect(dots()).toBe(written);
    expect(calls.filter((c) => c === "clear").length).toBe(clears);
    expect(onSigned).toHaveBeenCalledTimes(1);
  });

  it("does not finish in under about a second, since it is meant to be seen written", async () => {
    useTimers();
    const onSigned = vi.fn();
    const view = render(<SignaturePad head={null} foot={null} onSigned={onSigned} />);
    view.rerender(<SignaturePad head={null} foot={null} signed onSigned={onSigned} />);
    await advance(800);
    expect(onSigned).not.toHaveBeenCalled();
  });

  it("writes it at once when the visitor asked for less motion, and not a moment before", () => {
    motion(true);
    const onSigned = vi.fn();
    const view = render(<SignaturePad head={null} foot={null} onSigned={onSigned} />);
    expect(onSigned).not.toHaveBeenCalled();
    expect(dots()).toBe(0);
    expect(screen.queryByRole("img", { name: "Signed: SatStake" })).toBeNull();
    view.rerender(<SignaturePad head={null} foot={null} signed onSigned={onSigned} />);
    expect(onSigned).toHaveBeenCalledTimes(1);
    expect(dots()).toBeGreaterThan(300);
    expect(screen.getByRole("img", { name: "Signed: SatStake" })).toBe(area());
  });

  it("clears the ink and drops the signed name when the promise is gone", () => {
    motion(true);
    const view = render(<SignaturePad head={null} foot={null} signed />);
    expect(dots()).toBeGreaterThan(300);
    view.rerender(<SignaturePad head={null} foot={null} />);
    const sinceClear = calls.slice(calls.lastIndexOf("clear") + 1);
    expect(sinceClear.filter((c) => c === "arc")).toEqual([]);
    expect(screen.queryByRole("img", { name: "Signed: SatStake" })).toBeNull();
  });

  it("is named as signed only from the moment it is told, and by the word it carries", () => {
    useTimers();
    const view = render(<SignaturePad head={null} foot={null} />);
    expect(screen.queryByRole("img")).toBeNull();
    view.rerender(<SignaturePad head={null} foot={null} signed />);
    expect(screen.getByRole("img", { name: "Signed: SatStake" })).toBe(area());
  });

  it("writes once even when its owner renders it again and again with new callbacks", async () => {
    useTimers();
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<SignaturePad head={null} foot={null} signed onSigned={first} />);
    await advance(300);
    view.rerender(<SignaturePad head={<b>x</b>} foot={null} signed onSigned={second} />);
    await advance(3000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    const written = dots();
    view.rerender(<SignaturePad head={<b>y</b>} foot={null} signed onSigned={second} />);
    await advance(3000);
    expect(dots()).toBe(written);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("tells its owner the wait is over when nothing can be drawn, and does not name the pad signed", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    const onSigned = vi.fn();
    const view = render(<SignaturePad head={null} foot={null} onSigned={onSigned} />);
    view.rerender(<SignaturePad head={null} foot={null} signed onSigned={onSigned} />);
    expect(onSigned).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img", { name: "Signed: SatStake" })).toBeNull();
  });

  it("keeps the pen in the size it started, and refits only once the signature is written", async () => {
    useTimers();
    let notify = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const resize = vi.spyOn(Ink.prototype, "resize");
    const view = render(<SignaturePad head={null} foot={null} />);
    view.rerender(<SignaturePad head={null} foot={null} signed />);
    await advance(200);
    const during = resize.mock.calls.length;
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 120 } as DOMRect);
    act(() => notify());
    expect(resize.mock.calls.length).toBe(during);
    await advance(3000);
    expect(resize).toHaveBeenCalledWith(400, 120);
  });
});

describe("LLR-FE-037 the pad takes no drawing input", () => {
  it("holds the points it was given, widening where it moves slowly", () => {
    const ink = new Ink(context as unknown as CanvasRenderingContext2D);
    ink.begin(10, 10, 0);
    ink.add(12, 10, 10);
    ink.add(40, 10, 11);
    expect(ink.strokes.flat().length).toBe(3);
    ink.clear();
    expect(ink.strokes.flat().length).toBe(0);
  });

  it("leaves the canvas as it was when pointer events arrive, before and after the signature", async () => {
    useTimers();
    const view = render(<SignaturePad head={null} foot={null} />);
    const touch = () => {
      fireEvent.pointerDown(area(), { clientX: 10, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(area(), { clientX: 50, clientY: 50, pointerId: 1 });
      fireEvent.mouseDown(area());
      fireEvent.touchStart(area());
    };
    touch();
    expect(dots()).toBe(0);
    view.rerender(<SignaturePad head={null} foot={null} signed />);
    await advance(3000);
    const before = calls.length;
    touch();
    expect(calls.length).toBe(before);
  });

  it("registers no pointer, mouse or touch handler for the pad in its source", () => {
    for (const file of ["SignaturePad.tsx", "ink.ts"]) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(source, file).not.toMatch(/onPointer|onMouse|onTouch|addEventListener\(\s*["'](pointer|mouse|touch)/i);
    }
  });

  it("does not claim to be a place to draw", () => {
    render(<SignaturePad head={null} foot={null} signed />);
    expect(area().getAttribute("aria-label")).not.toMatch(/draw your/i);
  });
});
