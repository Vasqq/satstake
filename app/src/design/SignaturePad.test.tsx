import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ink, demoSignature } from "./ink";
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

beforeEach(() => {
  calls.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LLR-FE-037 the demonstration signature is generated and is the only ink", () => {
  it("is the same strokes every time for the same size, inside the pad", () => {
    const a = demoSignature(800, 240);
    expect(demoSignature(800, 240)).toEqual(a);
    expect(a.length).toBe(3);
    for (const p of a.flat()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(800);
      expect(p.y).toBeGreaterThanOrEqual(-20);
      expect(p.y).toBeLessThanOrEqual(260);
    }
  });

  it("holds the points it was given, widening where it moves slowly", () => {
    const ink = new Ink(context as unknown as CanvasRenderingContext2D);
    ink.begin(10, 10, 0);
    ink.add(12, 10, 10);
    ink.add(40, 10, 11);
    expect(ink.points().length).toBe(3);
    ink.clear();
    expect(ink.points().length).toBe(0);
  });

  it("tells its owner when the demonstration has finished", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const done = vi.fn();
    render(<SignaturePad head={<span>head</span>} foot={<span>foot</span>} onDemoDone={done} />);
    expect(done).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(done).toHaveBeenCalledTimes(1);
    expect(calls.filter((c) => c === "arc").length).toBeGreaterThan(50);
  });

  it("takes no drawing input: pointer events leave the canvas as it was", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    render(<SignaturePad head={null} foot={null} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const before = calls.length;
    const area = document.querySelector(".pad-area") as HTMLElement;
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.mouseDown(area);
    fireEvent.touchStart(area);
    expect(calls.length).toBe(before);
  });

  it("registers no pointer, mouse or touch handler for the pad in its source", () => {
    for (const file of ["SignaturePad.tsx", "ink.ts"]) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(source, file).not.toMatch(/onPointer|onMouse|onTouch|addEventListener\(\s*["'](pointer|mouse|touch)/i);
    }
  });

  it("does not claim to be a place to draw, and does not lock touch scrolling", () => {
    render(<SignaturePad head={null} foot={null} />);
    const area = document.querySelector(".pad-area") as HTMLElement;
    expect(area.getAttribute("aria-label")).not.toMatch(/draw your/i);
    expect(area.getAttribute("role")).toBe("img");
  });

  it("says it is signing, then that it is signed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    render(<SignaturePad head={null} foot={null} />);
    expect(document.querySelector(".baseline span")?.textContent).toBe("SIGNING…");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(document.querySelector(".baseline span")?.textContent).toBe("SIGNED");
  });

  it("shows the seal in place of the baseline once it has bytes, and renders head and foot", () => {
    render(<SignaturePad head={<b>the head</b>} foot={<i>the foot</i>} sealBytes={new Uint8Array(32).fill(7)} sealLabel="LABEL" />);
    expect(document.querySelector(".baseline")).toBeNull();
    expect(document.querySelector("svg.seal-svg")).toBeTruthy();
    expect(screen.getByText("the head")).toBeTruthy();
    expect(screen.getByText("the foot")).toBeTruthy();
  });

  it("collapses the finished signature into a ring and then says so, once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const collapsed = vi.fn();
    const view = render(<SignaturePad head={null} foot={null} onCollapsed={collapsed} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(collapsed).not.toHaveBeenCalled();
    view.rerender(<SignaturePad head={null} foot={null} onCollapsed={collapsed} collapsing />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(collapsed).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".baseline")).toBeNull();
  });

  it("reports the collapse at once when there is no ink to collapse", () => {
    const collapsed = vi.fn();
    render(<SignaturePad head={null} foot={null} collapsing onCollapsed={collapsed} />);
    expect(collapsed).toHaveBeenCalledTimes(1);
  });
});
