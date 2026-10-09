import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Seal } from "./Seal";

afterEach(cleanup);

const bytesOf = (seed: number) => Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + seed) & 255);

function paint(bytes: Uint8Array, label = "SEALED") {
  const view = render(<Seal bytes={bytes} label={label} on />);
  const svg = view.container.querySelector("svg") as SVGSVGElement;
  const marks = [...svg.querySelectorAll("path.d, circle.dot")].map((n) => n.outerHTML);
  view.unmount();
  return marks;
}

describe("LLR-FE-037 the seal is drawn only from the 32 bytes it is given", () => {
  it("draws the same marks for the same bytes, and different marks for different bytes", () => {
    expect(paint(bytesOf(1))).toEqual(paint(bytesOf(1)));
    expect(paint(bytesOf(1))).not.toEqual(paint(bytesOf(2)));
  });

  it("does not let the label change the marks, so the picture comes from the hash alone", () => {
    expect(paint(bytesOf(3), "ONE")).toEqual(paint(bytesOf(3), "TWO"));
  });

  it("draws 64 ticks, nine arcs and ten dots", () => {
    const { container } = render(<Seal bytes={bytesOf(5)} label="X" on />);
    expect(container.querySelectorAll("path.d").length).toBe(64 + 9);
    expect(container.querySelectorAll("circle.dot").length).toBe(10);
  });

  it("reads a set bit as a longer tick than a clear one", () => {
    const clear = render(<Seal bytes={new Uint8Array(32)} label="X" on />);
    const clearTicks = [...clear.container.querySelectorAll("path.d")].slice(0, 64).map((p) => p.getAttribute("d"));
    cleanup();
    const set = render(<Seal bytes={new Uint8Array(32).fill(255)} label="X" on />);
    const setTicks = [...set.container.querySelectorAll("path.d")].slice(0, 64).map((p) => p.getAttribute("d"));
    expect(new Set(clearTicks).size).toBe(64);
    expect(setTicks).not.toEqual(clearTicks);
  });

  it("refuses bytes that are not a 32-byte hash, rather than drawing a seal that no hash made", () => {
    expect(() => render(<Seal bytes={new Uint8Array(31)} label="X" on />)).toThrow(RangeError);
    expect(() => render(<Seal bytes={new Uint8Array(33)} label="X" on />)).toThrow(RangeError);
  });

  it("is named for assistive technology and shows its label along the ring", () => {
    const { container } = render(<Seal bytes={bytesOf(7)} label="PROMISE 7" on />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toMatch(/seal/i);
    expect(svg.querySelector("textPath")?.textContent).toBe("PROMISE 7");
  });

  it("gives two seals on one page different path ids", () => {
    const { container } = render(
      <>
        <Seal bytes={bytesOf(9)} label="A" on />
        <Seal bytes={bytesOf(9)} label="A" on />
      </>,
    );
    const ids = [...container.querySelectorAll("defs path")].map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("draws itself in once after it mounts unless told it is already on", async () => {
    const { container } = render(<Seal bytes={bytesOf(4)} label="X" />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.classList.contains("on")).toBe(false);
    await waitFor(() => expect(svg.classList.contains("on")).toBe(true));
  });
});
