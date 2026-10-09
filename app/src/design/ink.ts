export interface InkPoint {
  x: number;
  y: number;
  t: number;
  w: number;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/**
 * Velocity-weighted, variable-width strokes on a canvas. It is fed by `demoSignature` only: the application
 * takes no drawing input, so nothing here listens to a pointer.
 */
export class Ink {
  strokes: InkPoint[][] = [];
  w = 1;
  h = 1;
  private cur: InkPoint[] | null = null;
  private readonly maxW = 4.2;
  private readonly minW = 1.1;

  constructor(
    readonly g: CanvasRenderingContext2D,
    private readonly color: () => string = () => "#14213d",
  ) {}

  /** Keeps the strokes in proportion when the canvas changes size. */
  resize(w: number, h: number): void {
    const ow = this.w;
    const oh = this.h;
    this.w = w;
    this.h = h;
    if (ow > 1 && (ow !== w || oh !== h)) {
      const sx = w / ow;
      const sy = h / oh;
      for (const s of this.strokes) for (const p of s) {
        p.x *= sx;
        p.y *= sy;
      }
    }
    this.redraw();
  }

  private width(prev: InkPoint, p: InkPoint): number {
    const v = Math.hypot(p.x - prev.x, p.y - prev.y) / Math.max(1, p.t - prev.t);
    const target = clamp(this.maxW - v * 1.25, this.minW, this.maxW);
    return prev.w * 0.62 + target * 0.38;
  }

  begin(x: number, y: number, t: number): void {
    this.cur = [{ x, y, t, w: this.maxW * 0.55 }];
    this.strokes.push(this.cur);
    this.dot(x, y, (this.cur[0] as InkPoint).w);
  }

  add(x: number, y: number, t: number): void {
    const s = this.cur;
    if (!s) return;
    const prev = s[s.length - 1] as InkPoint;
    if (Math.hypot(x - prev.x, y - prev.y) < 1.2) return;
    const p: InkPoint = { x, y, t, w: 0 };
    p.w = this.width(prev, p);
    s.push(p);
    this.drawTail(s, s.length - 1);
  }

  end(): void {
    this.cur = null;
  }

  clear(): void {
    this.strokes = [];
    this.cur = null;
    this.g.clearRect(0, 0, this.w, this.h);
  }

  points(): InkPoint[] {
    return this.strokes.flat();
  }

  private dot(x: number, y: number, w: number): void {
    const g = this.g;
    g.fillStyle = this.color();
    g.beginPath();
    g.arc(x, y, w / 2, 0, Math.PI * 2);
    g.fill();
  }

  // A quadratic segment between midpoints, stamped as dots.
  private drawTail(s: InkPoint[], i: number): void {
    const g = this.g;
    g.fillStyle = this.color();
    const p0 = s[Math.max(0, i - 2)] as InkPoint;
    const p1 = s[i - 1] as InkPoint;
    const p2 = s[i] as InkPoint;
    const m0 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, w: (p0.w + p1.w) / 2 };
    const m1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, w: (p1.w + p2.w) / 2 };
    const len = Math.hypot(m1.x - m0.x, m1.y - m0.y) + Math.hypot(p1.x - m0.x, p1.y - m0.y);
    const n = Math.max(2, Math.ceil(len / 0.6));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const x = a * m0.x + b * p1.x + c * m1.x;
      const y = a * m0.y + b * p1.y + c * m1.y;
      const w = m0.w + (m1.w - m0.w) * t;
      g.beginPath();
      g.arc(x, y, w / 2, 0, Math.PI * 2);
      g.fill();
    }
  }

  redraw(): void {
    this.g.clearRect(0, 0, this.w, this.h);
    for (const s of this.strokes) {
      if (s.length === 1) this.dot((s[0] as InkPoint).x, (s[0] as InkPoint).y, (s[0] as InkPoint).w);
      for (let i = 1; i < s.length; i++) this.drawTail(s, i);
    }
  }
}

/** A generated signature: trochoid loops make convincing cursive. */
export function demoSignature(w: number, h: number): { x: number; y: number }[][] {
  const base = h * 0.62;
  const k = h / 240;
  const s1: { x: number; y: number }[] = [];
  const x0 = w * 0.17;
  const W = w * 0.42;
  const N = 420;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const om = Math.PI * 2 * 6.5;
    const r = (9 + 7 * Math.sin(t * Math.PI * 3.1)) * k * 1.25;
    const cap = -38 * k * Math.exp(-Math.pow((t - 0.06) / 0.045, 2));
    const y = base - 12 * k + r * 1.35 * Math.cos(om * t) * (1 - 0.35 * Math.sin(t * 9)) + cap - 6 * t * k;
    s1.push({ x: x0 + W * t - r * 0.95 * Math.sin(om * t) - (y - base) * 0.42, y });
  }
  const s2: { x: number; y: number }[] = [];
  const x1 = w * 0.14;
  const W2 = w * 0.64;
  for (let i = 0; i <= 220; i++) {
    const t = i / 220;
    s2.push({
      x: x1 + W2 * t + 18 * Math.sin(t * Math.PI) * (t > 0.85 ? 3 : 0),
      y: base + 24 * k + 9 * Math.sin(t * Math.PI * 1.15) * k - 30 * Math.pow(t, 4) * k,
    });
  }
  const s3: { x: number; y: number }[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    s3.push({ x: w * 0.62 + 16 * Math.sin(t * Math.PI * 2) * k, y: base - 34 * k + 12 * Math.cos(t * Math.PI * 2) * k });
  }
  return [s1, s2, s3];
}
