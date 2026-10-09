import { type ReactNode, useEffect, useRef, useState } from "react";
import { Ink, demoSignature } from "./ink";
import { clamp, ease, prefersReducedMotion } from "./motion";
import { Seal } from "./Seal";

const inkColor = () => getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#14213d";

export interface SignaturePadProps {
  /** The strip above the signature: a label, or the parties. */
  head: ReactNode;
  /** The strip below it: a note and the buttons, or the sealed facts. */
  foot: ReactNode;
  /** When set, the seal is drawn in place of the signature. Exactly 32 bytes. */
  sealBytes?: Uint8Array | null;
  /** The text that runs round the ring of the seal. */
  sealLabel?: string;
  /** While true the signature collapses into a ring; `onCollapsed` follows. Use it just before showing the seal. */
  collapsing?: boolean;
  onCollapsed?: () => void;
  /** Called once when the demonstration signature has been written. */
  onDemoDone?: () => void;
}

/**
 * The pad. A signature writes itself on mount and that is the only ink: the pad takes no drawing input from a
 * pointer, mouse or touch, so nothing on this page is signed by hand and scrolling is never locked.
 *
 * @trace LLR-FE-037
 */
export function SignaturePad({ head, foot, sealBytes, sealLabel = "", collapsing = false, onCollapsed, onDemoDone }: SignaturePadProps) {
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ink = useRef<Ink | null>(null);
  const [signed, setSigned] = useState(false);
  // The owner's callbacks are read when they are needed, so a new function never restarts the animation.
  const callbacks = useRef({ onDemoDone, onCollapsed });
  useEffect(() => {
    callbacks.current = { onDemoDone, onCollapsed };
  });

  useEffect(() => {
    const cv = canvas.current;
    const host = area.current;
    const g = cv?.getContext("2d");
    if (!cv || !host || !g) {
      // No canvas to write on (a browser without one): the pad is simply already signed.
      setSigned(true);
      callbacks.current.onDemoDone?.();
      return;
    }
    const k = new Ink(g, inkColor);
    ink.current = k;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = r.width * d;
      cv.height = r.height * d;
      g.setTransform(d, 0, 0, d, 0, 0);
      k.resize(r.width, r.height);
    };
    fit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    observer?.observe(host);
    const scheme = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const recolour = () => k.redraw();
    scheme?.addEventListener("change", recolour);

    const all = demoSignature(k.w, k.h).flatMap((s, si) => s.map((p) => ({ ...p, si })));
    const reduced = prefersReducedMotion();
    let idx = 0;
    let t = 0;
    let current = -1;
    let frame = 0;
    let last = 0;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const per = reduced ? all.length : Math.max(1, Math.round(dt / (1900 / all.length)));
      for (let n = 0; n < per && idx < all.length; n++, idx++) {
        const p = all[idx] as (typeof all)[number];
        t += 4.5;
        if (p.si !== current) {
          current = p.si;
          k.begin(p.x, p.y, t);
        } else k.add(p.x, p.y, t);
      }
      if (idx < all.length) frame = requestAnimationFrame(step);
      else {
        k.end();
        setSigned(true);
        callbacks.current.onDemoDone?.();
      }
    };
    const start = setTimeout(() => {
      frame = requestAnimationFrame((now) => {
        last = now;
        step(now);
      });
    }, 700);
    return () => {
      clearTimeout(start);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      scheme?.removeEventListener("change", recolour);
    };
  }, []);

  useEffect(() => {
    if (!collapsing) return;
    const k = ink.current;
    const pts = k?.points() ?? [];
    if (!k || pts.length === 0) {
      callbacks.current.onCollapsed?.();
      return;
    }
    // The ink flies onto the ring the seal then draws over.
    const N = Math.min(700, pts.length);
    const src = Array.from({ length: N }, (_, i) => pts[Math.floor((i / N) * pts.length)] as (typeof pts)[number]);
    const cx = k.w / 2;
    const cy = k.h / 2;
    const R = 91;
    const g = k.g;
    const duration = prefersReducedMotion() ? 1 : 1250;
    const target = src.map((_, i) => {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
    });
    let frame = 0;
    let begun = 0;
    const draw = (now: number) => {
      if (begun === 0) begun = now;
      const t = clamp((now - begun) / duration);
      g.clearRect(0, 0, k.w, k.h);
      g.fillStyle = inkColor();
      src.forEach((p, i) => {
        const tg = target[i] as (typeof target)[number];
        const e = ease(clamp((t - (i / N) * 0.35) / (1 - 0.35)));
        const sway = Math.sin(e * Math.PI) * 40;
        const a = Math.atan2(tg.y - cy, tg.x - cx);
        const x = p.x + (tg.x - p.x) * e + Math.cos(a + Math.PI / 2) * sway;
        const y = p.y + (tg.y - p.y) * e + Math.sin(a + Math.PI / 2) * sway;
        g.globalAlpha = 1 - Math.max(0, (t - 0.8) / 0.2);
        g.beginPath();
        g.arc(x, y, Math.max(0.8, p.w * (1 - e * 0.6)) / 2, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
      if (t < 1) frame = requestAnimationFrame(draw);
      else {
        g.clearRect(0, 0, k.w, k.h);
        callbacks.current.onCollapsed?.();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [collapsing]);

  const hasSeal = sealBytes !== null && sealBytes !== undefined;
  return (
    <div className="pad">
      <div className="pad-head">{head}</div>
      <div
        className="pad-area"
        ref={area}
        role={hasSeal ? undefined : "img"}
        aria-label={hasSeal ? undefined : "A signature writing itself, as a demonstration"}
      >
        {!hasSeal && !collapsing && (
          <div className="baseline">
            <span>{signed ? "SIGNED" : "SIGNING…"}</span>
          </div>
        )}
        <canvas ref={canvas} aria-hidden="true" />
        {hasSeal && <Seal bytes={sealBytes} label={sealLabel} />}
      </div>
      {foot}
    </div>
  );
}
