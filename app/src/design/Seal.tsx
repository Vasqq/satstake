import { useEffect, useId, useState, type CSSProperties } from "react";

function arcPath(r: number, a0: number, a1: number): string {
  const point = (a: number): [number, number] => [Math.cos(((a - 90) * Math.PI) / 180) * r, Math.sin(((a - 90) * Math.PI) / 180) * r];
  const [x0, y0] = point(a0);
  const [x1, y1] = point(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const byteAt = (bytes: Uint8Array, i: number): number => bytes[i] ?? 0;

interface Marks {
  ticks: string[];
  arcs: { d: string; sw: number; delay: number }[];
  dots: { x: number; y: number; s: number; d: number }[];
}

/** Every mark comes from the bytes alone: 64 ticks from their bits, nine arcs and ten dots from their values. */
function marksOf(bytes: Uint8Array): Marks {
  const ticks: string[] = [];
  for (let i = 0; i < 64; i++) {
    const bit = (byteAt(bytes, i >> 3) >> (i & 7)) & 1;
    const a = (i / 64) * Math.PI * 2;
    const r0 = 72;
    const r1 = bit ? 63 : 68;
    ticks.push(`M${(Math.cos(a) * r0).toFixed(2)} ${(Math.sin(a) * r0).toFixed(2)}L${(Math.cos(a) * r1).toFixed(2)} ${(Math.sin(a) * r1).toFixed(2)}`);
  }
  const arcs: Marks["arcs"] = [];
  (
    [
      [54, 2.6],
      [44, 1.8],
      [35, 1.3],
    ] as const
  ).forEach(([r, sw], k) => {
    for (let j = 0; j < 3; j++) {
      const b1 = byteAt(bytes, 8 + k * 6 + j * 2);
      const b2 = byteAt(bytes, 9 + k * 6 + j * 2);
      const a0 = (b1 / 256) * 360 + j * 120;
      const len = 18 + (b2 / 256) * 80;
      arcs.push({ d: arcPath(r, a0, a0 + len), sw, delay: 0.25 + k * 0.12 + j * 0.05 });
    }
  });
  const dots: Marks["dots"] = [];
  for (let i = 0; i < 10; i++) {
    const b = byteAt(bytes, 26 + (i % 6)) ^ (i * 37);
    const a = (i / 10) * Math.PI * 2 + b / 256;
    const r = 24 + (b % 5);
    dots.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, s: 1.2 + (b % 3) * 0.7, d: 0.5 + i * 0.04 });
  }
  return { ticks, arcs, dots };
}

const delay = (s: number): CSSProperties => ({ transitionDelay: `${s}s` });

/**
 * The seal of a promise, drawn from the 32 bytes of a transaction hash and nothing else. `label` runs along
 * the ring as text and never changes a mark. Without `on` it draws itself in once after it mounts.
 *
 * @trace LLR-FE-037
 */
export function Seal({ bytes, label, on }: { bytes: Uint8Array; label: string; on?: boolean }) {
  if (bytes.length !== 32) throw new RangeError("A seal is drawn from exactly 32 bytes"); // LLR-FE-037
  const pathId = useId();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (on !== undefined) return;
    // Two frames, so the browser paints the undrawn state first and the transition has something to run from.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setDrawn(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [on]);
  const shown = on ?? drawn;
  const { ticks, arcs, dots } = marksOf(bytes);
  return (
    <svg className={"seal-svg" + (shown ? " on" : "")} viewBox="-110 -110 220 220" role="img" aria-label="Seal generated from the promise’s transaction hash">
      <defs>
        <path id={pathId} d="M0,-86 A86,86 0 1,1 -0.01,-86" />
      </defs>
      <circle className="d" r="100" pathLength="1" style={{ strokeWidth: 1.6 }} />
      <circle className="d" r="78" pathLength="1" style={{ strokeWidth: 0.7, ...delay(0.1) }} />
      <text>
        <textPath href={`#${pathId}`}>{label}</textPath>
      </text>
      {ticks.map((d, i) => (
        <path key={`t${i}`} className="d" d={d} pathLength="1" style={{ strokeWidth: 1, ...delay(0.15 + i * 0.006) }} />
      ))}
      {arcs.map((a, i) => (
        <path key={`a${i}`} className="d" d={a.d} pathLength="1" style={{ strokeWidth: a.sw, ...delay(a.delay) }} />
      ))}
      {dots.map((d, i) => (
        <circle key={`p${i}`} className="dot" cx={d.x} cy={d.y} r={d.s} style={delay(d.d)} />
      ))}
      <circle className="d" r="15" pathLength="1" style={{ strokeWidth: 1, ...delay(0.45) }} />
      <circle className="core" r="9" />
    </svg>
  );
}
