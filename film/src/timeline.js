// The film's one source of timing. The picture (film.js) and the sound (tools/audio.mjs) both read it, so a key
// click lands on the frame its letter appears and a pen sound follows the ink it belongs to.

export const DURATION = 91;

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// When each character of `str` appears, typed by a person: uneven gaps, a breath after a space, a longer one after
// punctuation. Element i is the time the (i + 1)th character lands.
export function typing(str, start, seed, base = 0.1) {
  const rand = mulberry32(seed);
  const times = [];
  let t = start;
  for (let i = 0; i < str.length; i++) {
    times.push(Math.round(t * 1000) / 1000);
    const c = str[i];
    let gap = base * (0.65 + 0.7 * rand());
    if (c === " ") gap += 0.05 + 0.06 * rand();
    if (c === "," || c === ".") gap += 0.12;
    t += gap;
  }
  return times;
}

// [start, end] of every shot, in order. Cuts sit on the half second.
export const SHOT = {
  hook: [0, 7],
  turn: [7, 11],
  write: [11, 18.5],
  stake: [18.5, 25],
  people: [25, 31.5],
  sign: [31.5, 39.5],
  locked: [39.5, 43],
  arc: [43, 47.5],
  proof: [47.5, 53.5],
  judge: [53.5, 60.5],
  bridge: [60.5, 63.5],
  pay1: [63.5, 71],
  pay3: [71, 78.5],
  recap: [78.5, 84.5],
  end: [84.5, DURATION],
};

export const HOOK = { l1: "I'll start running", l2: "on Monday." };
export const HOOK_TYPED = typing(HOOK.l1 + HOOK.l2, 0.5, 11, 0.088);

// The real typing captures hold the first n characters in frame n. Frame 0 shows the app's grey placeholder and
// frame 23 catches the line mid-wrap, so neither is shown: the film starts on frame 1, and the 23rd and 24th keys
// fall 45 ms apart, a quick pair, so frame 22 goes straight to frame 24.
export const WRITE_TEXT = "run three times this week.";
export const WRITE_TYPED = (() => {
  const t = typing(WRITE_TEXT, SHOT.write[0], 23, 0.105);
  t[23] = Math.round((t[22] + 0.045) * 1000) / 1000;
  for (let i = 24; i < t.length; i++) t[i] = Math.max(t[i], t[i - 1] + 0.06);
  return t;
})();

// A hand-drawn line from (x0, y0) to (x1, y1), with a slight rise and the pen slow at both ends. Points carry
// their time in ms, like the app's own ink.
export function handLine(x0, y0, x1, y1, ms, seed = 1) {
  const rand = mulberry32(seed);
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2.2);
  const wob = rand() * 2 - 1;
  const pts = [];
  let t = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const speed = 0.25 + 2.4 * Math.sin(Math.PI * u);
    if (i > 0) t += 1 / speed;
    pts.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * 3 * wob, t });
  }
  return [pts.map((p) => ({ ...p, t: (p.t / t) * ms }))];
}

// The pen's speed from 0 to 1 over a stroke set, sampled at 1001 points, so the pen sound is loud where the ink
// moves fast and silent where the pen is lifted. Without `norm`, the fastest moment is 1.
export function penSpeed(strokes, norm) {
  const total = strokes.at(-1).at(-1).t;
  const speed = new Float64Array(1001);
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      const v = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.01, b.t - a.t);
      for (let ms = Math.floor((a.t / total) * 1000); ms <= Math.ceil((b.t / total) * 1000); ms++) speed[ms] = Math.max(speed[ms], v);
    }
  }
  const top = norm ?? Math.max(...speed);
  return (u) => Math.min(1, speed[Math.min(1000, Math.round(u * 1000))] / top);
}

// Ink. The strike crosses out "Monday."; the signature writes "SatStake"; the underline sits under the URL.
export const STRIKE = { at: 5.0, ms: 380 };
export const SIGNATURE = { at: 7.0, ms: 1000 };
export const UNDERLINE = { at: SHOT.end[0] + 1.0, ms: 420 };

// Moments inside shots. At a swap the view changes state in place; the two payoff glides are the only camera moves,
// each a push from the money card into its verdict.
export const AT = {
  stakeGlide: 21.5,
  peopleGlide: 28,
  signTap: 33.0,
  signToSteps: 34.0,
  stepsToSigned: 36.5,
  judgeTap: 55.5,
  judgeToKept: 56.5,
  pay1Money: 66.5,
  pay1Glide: 68.0,
  pay3Money: 74.0,
  pay3Glide: 75.5,
  recap: [78.5, 80.5, 82.5],
};
export const GLIDE = 1.4; // seconds a payoff glide takes to settle, near enough
