export interface InkPoint {
  x: number;
  y: number;
  t: number;
  w: number;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/**
 * Velocity-weighted, variable-width strokes on a canvas. It is fed by `satStakeSignature` only: the application
 * takes no drawing input, so nothing here listens to a pointer.
 */
export class Ink {
  strokes: InkPoint[][] = [];
  w = 1;
  h = 1;
  private cur: InkPoint[] | null = null;
  private readonly maxW = 4.6;
  private readonly minW = 0.8;

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
    // A slow pen lays down ink and a fast one barely touches, and the width follows at once rather than easing back.
    const target = clamp(this.maxW - v * 1.6, this.minW, this.maxW);
    return prev.w * 0.35 + target * 0.65;
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

/** One stroke of the signature: where the pen lands, then cubic curves given as two controls and an end. */
interface SignatureStroke {
  from: readonly [number, number];
  curves: readonly (readonly [number, number, number, number, number, number])[];
}

// The word SatStake as a person writes it, drawn upright on a 600 by 200 sheet whose writing line is y = 140.
// The slant is applied afterwards, so each letter is easier to read here than it would be once leaned over.
const SHEET_WIDTH = 600;
const WRITING_LINE = 140;
const SLANT = 0.35;

// "Sat" is one stroke and "Stake" is one. The second S is its own shape, so the two capitals are not a copy of each
// other slid along the line, which is what made the word look printed.
const SAT: SignatureStroke = {
  from: [78, 64],
  curves: [
    [74, 44, 52, 32, 34, 44],
    [18, 56, 34, 78, 54, 92],
    [76, 108, 78, 138, 50, 142],
    [30, 146, 16, 136, 18, 122],
    [48, 112, 96, 92, 140, 98],
    [124, 88, 100, 96, 98, 118],
    [96, 138, 120, 146, 138, 128],
    [144, 120, 146, 106, 146, 96],
    [146, 112, 146, 128, 148, 138],
    [150, 146, 164, 142, 172, 120],
    [178, 96, 184, 70, 186, 58],
    [184, 76, 182, 110, 184, 130],
    [186, 142, 200, 146, 212, 128],
  ],
};
const STAKE: SignatureStroke = {
  from: [292, 52],
  curves: [
    [288, 30, 262, 20, 246, 36],
    [230, 52, 248, 74, 270, 88],
    [294, 104, 296, 136, 266, 140],
    [244, 144, 228, 132, 232, 118],
    [250, 108, 286, 78, 308, 60],
    [306, 84, 304, 112, 308, 130],
    [310, 144, 326, 146, 338, 126],
    [344, 114, 352, 100, 366, 98],
    [352, 92, 338, 104, 340, 122],
    [342, 144, 366, 146, 376, 124],
    [380, 114, 380, 104, 380, 96],
    [380, 112, 380, 130, 384, 140],
    [388, 148, 400, 142, 404, 124],
    [406, 108, 410, 76, 414, 54],
    [412, 80, 410, 118, 412, 140],
    [412, 130, 412, 120, 412, 112],
    [418, 104, 432, 98, 440, 94],
    [430, 102, 418, 112, 414, 118],
    [424, 120, 434, 128, 442, 140],
    [448, 146, 458, 140, 462, 126],
    [468, 112, 474, 98, 486, 96],
    [498, 96, 500, 112, 484, 116],
    [470, 120, 466, 132, 474, 140],
    [480, 148, 496, 148, 506, 134],
  ],
};
const SATSTAKE: readonly SignatureStroke[] = [
  SAT,
  STAKE,
  // The crossbars of the two t's, each its own lift of the pen.
  { from: [170, 88], curves: [[184, 84, 198, 82, 208, 80]] },
  { from: [292, 90], curves: [[306, 86, 320, 84, 330, 82]] },
];

/** The length, in pixels, between two points the pen is shown at. */
const SPACING = 2.2;

/**
 * The signature the pad writes once a promise exists: the word SatStake in connected cursive, with a slant and a
 * line under it, sized to sit on the pad's signature line. It is the same drawing every time for a given size and
 * is not made from anything the visitor does. Each point carries the time the pen reaches it, slow at the start
 * and end of a stroke and quick in the middle, which is what gives the ink its changing width.
 */
export function satStakeSignature(w: number, h: number): { x: number; y: number; t: number }[][] {
  // The pad's rule and its × start at 6% of the width, so the name begins just after the × on every width
  // instead of sitting in the middle of a wide pad.
  const left = w * 0.06 + 28;
  const scale = Math.min(Math.max(0, w * 0.94 - left) / SHEET_WIDTH, h / 230);
  const top = h * 0.68 - 3 - WRITING_LINE * scale;
  const place = (x: number, y: number) => ({
    x: left + (x + (WRITING_LINE - y) * SLANT) * scale,
    // The line of writing rises a little as it goes, the way a signature does.
    y: top + (y - (x / SHEET_WIDTH) * 10) * scale,
  });

  const drawn = SATSTAKE.map((stroke) => {
    const dense: { x: number; y: number }[] = [place(...stroke.from)];
    let [x0, y0] = stroke.from;
    for (const [c1x, c1y, c2x, c2y, x1, y1] of stroke.curves) {
      for (let i = 1; i <= 32; i++) {
        const u = i / 32;
        const v = 1 - u;
        dense.push(
          place(
            v * v * v * x0 + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * x1,
            v * v * v * y0 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y1,
          ),
        );
      }
      [x0, y0] = [x1, y1];
    }
    const length = dense.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - (dense[i] as { x: number }).x, p.y - (dense[i] as { y: number }).y), 0);
    const points: { x: number; y: number; t: number }[] = [{ ...(dense[0] as { x: number; y: number }), t: 0 }];
    let walked = 0;
    let next = SPACING;
    let t = 0;
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1] as { x: number; y: number };
      const b = dense[i] as { x: number; y: number };
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      while (next <= walked + span && span > 0) {
        const f = (next - walked) / span;
        // Slow at the ends of a stroke, where the pen turns, and quick through the middle.
        const speed = 0.25 + 2.4 * Math.sin(Math.PI * (next / Math.max(length, 1)));
        t += SPACING / speed;
        points.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t });
        next += SPACING;
      }
      walked += span;
    }
    return { points, length };
  });

  // The line under the name is drawn on the pad's rule, in the pad's own coordinates. Sending it through `place`
  // makes it rise with the writing and cross the rule on a wide pad.
  const ruleY = h * 0.68;
  const xStart = w * 0.06 + 20;
  const nameRight = Math.max(...drawn.flatMap((stroke) => stroke.points.map((p) => p.x)));
  const xEnd = Math.min(nameRight + 16, w * 0.94);
  const spanX = Math.max(SPACING, xEnd - xStart);
  const steps = Math.max(2, Math.ceil(spanX / SPACING));
  const underline: { x: number; y: number; t: number }[] = [];
  let pen = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = xStart + spanX * u;
    const y = ruleY + Math.sin(u * Math.PI) * 1.2;
    if (i > 0) pen += Math.hypot(x - (underline[i - 1] as { x: number }).x, y - (underline[i - 1] as { y: number }).y);
    underline.push({ x, y, t: pen });
  }
  drawn.push({ points: underline, length: spanX });

  // The two words take most of the time, the crossbars and the line are flicks, and the pen lifts between strokes.
  const WORD_MS = 1040;
  const wordLength = (drawn[0]?.length ?? 0) + (drawn[1]?.length ?? 0);
  let clock = 0;
  return drawn.map(({ points, length }, index) => {
    const budget = index < 2 ? WORD_MS * (length / Math.max(wordLength, 1)) : index === drawn.length - 1 ? 140 : 35;
    const span = points[points.length - 1]?.t ?? 1;
    const timed = points.map((p) => ({ ...p, t: clock + (span === 0 ? 0 : (p.t / span) * budget) }));
    clock += budget + 55;
    return timed;
  });
}
