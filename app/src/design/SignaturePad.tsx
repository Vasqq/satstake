import { type ReactNode, useEffect, useRef, useState } from "react";
import { Ink, satStakeSignature } from "./ink";
import { prefersReducedMotion } from "./motion";

const inkColor = () => getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#14213d";


export interface SignaturePadProps {
  /** The strip above the signature: a label, or the parties. */
  head: ReactNode;
  /** The strip below it: a note and the buttons, or the facts of the signed promise. */
  foot: ReactNode;
  /** False until the promise exists. The signature is written when this becomes true, once, and then stays. */
  signed?: boolean;
  /** Called once when the signature has been written. */
  onSigned?: () => void;
}

/**
 * The pad. It shows an empty signature line until it is told the promise exists, and then writes one fixed
 * signature on it. The pad takes no drawing input from a pointer, mouse or touch, so nothing on this page is
 * signed by hand and scrolling is never locked.
 *
 * @trace LLR-FE-037
 */
export function SignaturePad({ head, foot, signed = false, onSigned }: SignaturePadProps) {
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ink = useRef<Ink | null>(null);
  // True only once a canvas context exists, so the pad is never named signed when nothing can be drawn.
  const [drawable, setDrawable] = useState(false);
  // The owner's callback is read when it is needed, so a new function never restarts the writing.
  const callback = useRef(onSigned);
  const writing = useRef(false);
  const refit = useRef(false);
  const fit = useRef<() => void>(() => {});
  useEffect(() => {
    callback.current = onSigned;
  });

  useEffect(() => {
    const cv = canvas.current;
    const host = area.current;
    const g = cv?.getContext("2d");
    if (!cv || !host || !g) {
      setDrawable(false);
      return;
    }
    setDrawable(true);
    const k = new Ink(g, inkColor);
    ink.current = k;
    const apply = () => {
      const r = cv.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = r.width * d;
      cv.height = r.height * d;
      g.setTransform(d, 0, 0, d, 0, 0);
      k.resize(r.width, r.height);
    };
    // A resize while the pen is moving would scale ink already laid down and then add the rest at the old size.
    // The size change waits until the fixed drawing is finished, then the whole signature is fitted once.
    fit.current = () => {
      if (writing.current) {
        refit.current = true;
        return;
      }
      apply();
    };
    fit.current();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit.current()) : null;
    observer?.observe(host);
    const scheme = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const recolour = () => {
      if (writing.current) return;
      k.redraw();
    };
    scheme?.addEventListener("change", recolour);
    return () => {
      observer?.disconnect();
      scheme?.removeEventListener("change", recolour);
      ink.current = null;
      fit.current = () => {};
    };
  }, []);

  useEffect(() => {
    if (!signed) {
      writing.current = false;
      ink.current?.clear(); // LLR-FE-037
      return;
    }
    const k = ink.current;
    if (!k) {
      // Nothing can be drawn. The promise still exists, so the owner can show its number and link. The name stays off.
      callback.current?.();
      return;
    }
    writing.current = true;
    const all = satStakeSignature(k.w, k.h).flatMap((stroke, si) => stroke.map((p) => ({ ...p, si })));
    let drawn = 0;
    let current = -1;
    let frame = 0;
    let begun: number | null = null;
    const write = (upTo: number) => {
      for (; drawn < upTo; drawn++) {
        const p = all[drawn] as (typeof all)[number];
        if (p.si !== current) {
          if (current !== -1) k.end();
          current = p.si;
          k.begin(p.x, p.y, p.t);
        } else k.add(p.x, p.y, p.t);
      }
    };
    const finish = () => {
      k.end();
      writing.current = false;
      callback.current?.();
      if (refit.current) {
        refit.current = false;
        fit.current();
      }
    };
    if (prefersReducedMotion()) {
      write(all.length); // LLR-FE-037
      finish();
      return;
    }
    // Each point carries the time the pen reaches it, including the lifts between strokes, so a bar is a flick
    // and the pen actually pauses instead of every point taking an equal share of the time.
    const step = (now: number) => {
      begun ??= now;
      const elapsed = now - begun;
      let upTo = drawn;
      while (upTo < all.length && (all[upTo] as (typeof all)[number]).t <= elapsed) upTo++;
      write(upTo);
      if (upTo < all.length) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [signed]);

  return (
    <div className="pad">
      <div className="pad-head">{head}</div>
      {/* Before the promise exists the pad has no name, so nothing is said to be signed. */}
      <div
        className="pad-area"
        ref={area}
        role={signed && drawable ? "img" : undefined}
        aria-label={signed && drawable ? "Signed: SatStake" : undefined}
      >
        <div className="baseline" aria-hidden="true" />
        <canvas ref={canvas} aria-hidden="true" />
      </div>
      {foot}
    </div>
  );
}
