// Synthesizes the film's score and sound effects at 48 kHz, then masters them to -14 LUFS with ffmpeg loudnorm.
// Like the picture, the sound is a pure function of time: seeded noise, no samples, no randomness between runs.
//   node tools/audio.mjs        writes out/audio.wav and prints the hit list it placed on the 120 BPM grid
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { satStakeSignature } from "../src/ink.gen.js";
import { AT, DURATION, HOOK_TYPED, SHOT, SIGNATURE, STRIKE, UNDERLINE, WRITE_TYPED, handLine, mulberry32, penSpeed } from "../src/timeline.js";

const OUT = new URL("../out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const SR = 48000;
const DUR = DURATION;
const N = SR * DUR;
const L = new Float64Array(N);
const R = new Float64Array(N);
const BEAT = 0.5;
const hits = [];

const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const add = (i, v, pan = 0) => {
  if (i < 0 || i >= N) return;
  L[i] += v * Math.cos(((pan + 1) * Math.PI) / 4);
  R[i] += v * Math.sin(((pan + 1) * Math.PI) / 4);
};
// Records a hit and checks it sits on the beat grid.
function hit(t, name) {
  const off = Math.abs(t / BEAT - Math.round(t / BEAT));
  if (off > 1e-6) throw new Error(`${name} at ${t} s is off the 120 BPM grid`);
  hits.push([t, name]);
}

// ---------------------------------------------------------------- voices

// A felt piano: a few slightly stretched partials, the high ones dying first, with a soft attack.
function piano(t, m, vel = 0.3, len = 3, pan = 0) {
  const f = midi(m);
  const start = Math.round(t * SR);
  const n = Math.round(len * SR);
  for (let k = 0; k < n; k++) {
    const x = k / SR;
    const att = Math.min(1, x / 0.006);
    let v = 0;
    for (let p = 1; p <= 6; p++) {
      const fp = f * p * Math.sqrt(1 + 0.0004 * p * p);
      if (fp > 9000) break;
      v += (Math.sin(2 * Math.PI * fp * x) / p ** 1.6) * Math.exp(-x * (1.1 + p * 0.9));
    }
    const tail = Math.min(1, (n - k) / (0.05 * SR));
    add(start + k, v * vel * att * tail, pan);
  }
}
// A quiet pad of detuned sines with a slow swell, for the chord under everything.
function pad(t0, t1, notes, vol = 0.04) {
  const a = Math.round(t0 * SR);
  const b = Math.round(t1 * SR);
  for (let i = a; i < b; i++) {
    const x = (i - a) / SR;
    const env = Math.min(1, x / 1.2) * Math.min(1, (b - i) / (0.8 * SR));
    let v = 0;
    for (const m of notes) {
      const f = midi(m);
      v += Math.sin(2 * Math.PI * f * 0.998 * x) + Math.sin(2 * Math.PI * f * 1.002 * x + 1) + 0.3 * Math.sin(4 * Math.PI * f * x);
    }
    const s = (v / notes.length) * vol * env;
    add(i, s * (1 + 0.15 * Math.sin(x * 0.7)), -0.3);
    add(i, s * (1 - 0.15 * Math.sin(x * 0.7)), 0.3);
  }
}
function kick(t, vol = 0.35) {
  const s = Math.round(t * SR);
  let ph = 0;
  for (let k = 0; k < 0.4 * SR; k++) {
    const x = k / SR;
    ph += (2 * Math.PI * (45 + 50 * Math.exp(-x * 30))) / SR;
    add(s + k, Math.sin(ph) * Math.exp(-x * 9) * vol);
  }
}
// Band-limited noise: two one-pole filters make a band between lo and hi.
function noise(t, len, { lo = 200, hi = 4000, vol = 0.1, env = (u) => 1 - u, seed = 1, pan = 0 }) {
  const rand = mulberry32(seed);
  const s = Math.round(t * SR);
  const n = Math.round(len * SR);
  const aH = Math.exp((-2 * Math.PI * lo) / SR);
  const aL = Math.exp((-2 * Math.PI * hi) / SR);
  let lp = 0;
  let lpLo = 0;
  for (let k = 0; k < n; k++) {
    const w = rand() * 2 - 1;
    lp = aL * lp + (1 - aL) * w;
    lpLo = aH * lpLo + (1 - aH) * lp;
    add(s + k, (lp - lpLo) * vol * env(k / n), pan);
  }
}
const click = (t, vol = 0.05, seed = 3) => noise(t, 0.012, { lo: 1500, hi: 7000, vol, env: (u) => (1 - u) ** 3, seed });
const tick = (t, vol = 0.03) => noise(t, 0.03, { lo: 5000, hi: 12000, vol, env: (u) => (1 - u) ** 4, seed: Math.round(t * 100) });
function press(t) {
  click(t, 0.12, 9);
  kick(t, 0.12);
}
function bell(t, m, vol = 0.12) {
  const f = midi(m);
  const s = Math.round(t * SR);
  for (let k = 0; k < 3 * SR; k++) {
    const x = k / SR;
    const v = Math.sin(2 * Math.PI * f * x) * Math.exp(-x * 1.5) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * x) * Math.exp(-x * 3) + 0.2 * Math.sin(2 * Math.PI * f * 5.4 * x) * Math.exp(-x * 6);
    add(s + k, v * vol * Math.min(1, x / 0.003));
  }
}
function whoosh(t, len, vol = 0.12) {
  noise(t, len, { lo: 120, hi: 1800, vol, env: (u) => Math.sin(Math.PI * u ** 0.7) ** 2, seed: 77 });
}
// A pen on paper. `speed` gives the pen's speed (0 to 1) at each moment of the stroke, so a lift is silent.
function pen(t, len, speed, seed = 5) {
  const rand = mulberry32(seed);
  const s = Math.round(t * SR);
  const n = Math.round(len * SR);
  const aL = Math.exp((-2 * Math.PI * 6000) / SR);
  const aH = Math.exp((-2 * Math.PI * 900) / SR);
  let lp = 0;
  let lo = 0;
  let grit = 0;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    const sp = speed(u);
    const w = rand() * 2 - 1;
    if (rand() < 0.002) grit = 1;
    grit *= 0.995;
    lp = aL * lp + (1 - aL) * (w * (0.7 + grit));
    lo = aH * lo + (1 - aH) * lp;
    add(s + k, (lp - lo) * 0.16 * sp, 0.15);
  }
}

// ---------------------------------------------------------------- the score

// One felt piano for the whole film, in the language of the opening: slow, sparse, B minor leaning to D major.
// No drums. The opening's three notes (B, D, C sharp) are the motif. They stay unresolved while the promise is made,
// and resolve to D when it is kept.
const CH = {
  D: [62, 66, 69],
  Bm: [59, 62, 66],
  G: [59, 62, 67],
  A: [57, 61, 64],
  F$m: [57, 61, 66],
};
const BASS = { D: 38, Bm: 35, G: 31, A: 33, F$m: 30 };
const MOTIF = [71, 74, 73];
const human = mulberry32(60);
const nudge = (amount = 0.012) => (human() * 2 - 1) * amount;

// A chord rolled the way a hand plays it, lowest note first.
function roll(t, notes, vel = 0.1, len = 3, spread = 0.035) {
  notes.forEach((m, i) => piano(t + i * spread, m, vel * (1 - i * 0.06), len, (m - 64) / 40));
}
// The motif from `at`, one note every `gap` seconds, a little late or early like a person.
function motif(at, notes = MOTIF, gap = 0.75, vel = 0.085, len = 3) {
  notes.forEach((m, i) => piano(at + i * gap + (i ? nudge(0.02) : 0), m, vel * (i === notes.length - 1 ? 1.1 : 1), len, 0.15));
}
// One chord held from t0 to t1: the bass, then the chord tones broken one a second, quiet.
function bed(t0, t1, c, { moving = true, vel = 0.05 } = {}) {
  piano(t0, BASS[c], 0.13, Math.min(4, t1 - t0 + 0.8));
  piano(t0 + 0.02, BASS[c] + 12, 0.06, Math.min(4, t1 - t0 + 0.8));
  pad(t0, t1 + 0.4, CH[c], 0.025);
  if (!moving) return;
  const order = [0, 1, 2, 1];
  for (let k = 0, t = t0 + 1; t < t1 - 0.2; k++, t += 1) {
    const m = CH[c][order[k % 4]] + (k % 4 === 2 ? 12 : 0);
    piano(t + nudge(), m, vel + human() * 0.012, 2.2, k % 2 ? 0.2 : -0.2);
  }
}

// 0 to 6.5: the opening, unchanged. A low B minor drone and three sparse notes. Silence from 6.5 to 7.
pad(0.2, 6.5, [47, 54, 61], 0.03);
piano(1.0, 59, 0.16, 3);
piano(2.5, 62, 0.13, 3);
piano(4.0, 61, 0.14, 2.5);
hit(STRIKE.at, "strike");
piano(5.0, 35, 0.22, 1.5);

// 8: the turn. The chord lands with the signature's underline, then rings under the tagline.
hit(8.0, "turn chord");
roll(8.0, [38, 50, 62, 66, 69, 76], 0.11, 4.5, 0.04);
pad(8.0, SHOT.turn[1], [62, 66, 69], 0.025);

// 11 to 39.5: making the promise. A chord on each step and on each camera move, the motif left open.
const PLAN = [
  [SHOT.write[0], "Bm"],
  [15.0, "G"],
  [SHOT.stake[0], "D"],
  [AT.stakeGlide, "A"],
  [SHOT.people[0], "Bm"],
  [AT.peopleGlide, "G"],
  [SHOT.sign[0], "D"],
  [AT.signToSteps, "A"],
  [AT.stepsToSigned, "D"],
  [SHOT.locked[0], "Bm"],
  [SHOT.arc[0], "G"],
  [45.5, "D"],
  [SHOT.proof[0], "A"],
  [SHOT.proof[0] + 3, "Bm"],
  [SHOT.judge[0], "G"],
  [AT.judgeTap, "A"],
  [AT.judgeToKept, "D"],
  [SHOT.bridge[0], "Bm"],
  [SHOT.pay1[0], "G"],
  [AT.pay1Money, "A"],
  [AT.pay1Glide, "D"],
  [SHOT.pay3[0], "Bm"],
  [AT.pay3Money, "G"],
  [AT.pay3Glide, "F$m"],
];
const STILL = new Set([SHOT.locked[0], SHOT.bridge[0], AT.judgeTap]);
PLAN.forEach(([t0, c], i) => {
  hit(t0, `chord ${c}`);
  const t1 = PLAN[i + 1]?.[0] ?? SHOT.recap[0];
  bed(t0, t1, c, { moving: !STILL.has(t0) });
});

// The motif, open while the promise is made and kept waiting.
motif(15.0);
motif(AT.peopleGlide + 0.5);
motif(SHOT.proof[0] + 3.5, [71, 74, 73], 0.75, 0.07);
// Signed: one high D, where the old bell was.
hit(AT.stepsToSigned, "signed");
piano(AT.stepsToSigned + 0.5, 86, 0.06, 3);
// Locked on Arc: the low D the opening's B was waiting for.
piano(SHOT.locked[0], 26, 0.16, 3.5);
// Why Arc: the motif turned upward, the only rising line before the verdict.
motif(SHOT.arc[0] + 0.5, [66, 69, 74], 0.6, 0.075);
// Kept: the motif resolves to D for the first time.
hit(AT.judgeToKept, "kept");
motif(AT.judgeToKept + 0.4, [71, 74, 73, 74], 0.6, 0.09, 3.5);
// Bridge: one breath, high B.
piano(SHOT.bridge[0] + 0.5, 83, 0.05, 3);
// Paid back: the resolved motif again, an octave up, warm.
hit(AT.pay1Glide, "paid back");
motif(AT.pay1Glide + 0.5, [83, 86, 85, 86], 0.55, 0.07, 3);
// Paid out: the motif in the minor, left open. The other side is real too.
hit(AT.pay3Glide, "paid out");
motif(AT.pay3Glide + 0.5, [71, 74, 73], 0.75, 0.075, 3);

// Recap: one rolled chord per line, landing with each cut. Keep it resolves the motif.
for (const [t, c] of [
  [AT.recap[0], "G"],
  [AT.recap[1], "A"],
  [AT.recap[2], "D"],
]) {
  hit(t, "recap");
  piano(t, BASS[c], 0.15, 2.4);
  roll(t, [BASS[c] + 12, ...CH[c], CH[c][2] + 12], 0.1, 2.4);
}
pad(SHOT.recap[0], SHOT.end[0] + 0.3, [50, 57, 62], 0.025);
motif(AT.recap[2] + 0.25, [71, 74, 73, 74], 0.45, 0.08, 2.5);

// The end card. A last D with the motif's resolution on top, left to ring out.
hit(SHOT.end[0], "end chord");
roll(SHOT.end[0], [38, 50, 57, 62, 66, 69, 74], 0.11, 6, 0.05);
piano(SHOT.end[0] + 1.6, 78, 0.06, 4.5);
pad(SHOT.end[0], DUR, [62, 66, 69], 0.025);

// ---------------------------------------------------------------- sound under the picture

// Keys: one click per character, on the frame it appears.
HOOK_TYPED.forEach((t, i) => click(t, 0.03 + (i % 3) * 0.004, i + 1));
WRITE_TYPED.forEach((t, i) => click(t, 0.034 + (i % 3) * 0.004, i + 40));
// Taps: a soft key, and a low note under it instead of a drum.
for (const t of [AT.signTap, AT.judgeTap]) {
  hit(t, "tap");
  click(t, 0.09, Math.round(t * 10));
  piano(t, 38, 0.07, 1.2);
}
// The pen follows the speed of the ink it draws, starting a frame after the ink so the eye leads the ear.
const PEN_LAG = 1 / 60;
pen(STRIKE.at + PEN_LAG, STRIKE.ms / 1000, penSpeed(handLine(0, 0, 300, -6, STRIKE.ms, 7)), 21);
pen(SIGNATURE.at + PEN_LAG, SIGNATURE.ms / 1000, penSpeed(satStakeSignature(600, 200), 2.5), 23);
pen(UNDERLINE.at + PEN_LAG, UNDERLINE.ms / 1000, penSpeed(handLine(0, 0, 400, -4, UNDERLINE.ms, 11)), 22);

// ---------------------------------------------------------------- master

// Silence before the turn, exactly as cut.
for (let i = Math.round(6.5 * SR); i < Math.round(6.98 * SR); i++) {
  const u = (i - 6.5 * SR) / (0.06 * SR);
  const g = Math.max(0, 1 - u);
  L[i] *= g;
  R[i] *= g;
}
// The last second and a half fades to nothing, with the picture.
for (let i = Math.round((DUR - 1.5) * SR); i < N; i++) {
  const g = (N - i) / (1.5 * SR);
  L[i] *= g;
  R[i] *= g;
}
const pcm = Buffer.alloc(N * 2 * 3);
for (let i = 0; i < N; i++) {
  for (const [c, ch] of [
    [0, L],
    [1, R],
  ]) {
    const v = Math.round(Math.tanh(ch[i] * 1.2) * 0x7fffff * 0.9);
    pcm.writeIntLE(v, (i * 2 + c) * 3, 3);
  }
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 6, 28);
header.writeUInt16LE(6, 32);
header.writeUInt16LE(24, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
const raw = join(OUT, "audio-raw.wav");
writeFileSync(raw, Buffer.concat([header, pcm]));

// Two-pass loudnorm: measure, then normalize to -14 LUFS integrated with a -1 dBTP ceiling.
const m = JSON.parse(execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${raw}" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p'`], { encoding: "utf8" }));
const af = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af", af, "-c:a", "pcm_s24le", join(OUT, "audio.wav")]);
const check = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${join(OUT, "audio.wav")}" -af ebur128 -f null - 2>&1 | grep -E "^\\s+I:" | tail -1`], { encoding: "utf8" }).trim();
console.log(`hits on the grid: ${hits.length} (${[...new Set(hits.map((h) => h[0]))].sort((a, b) => a - b).join(", ")})`);
console.log(`loudness after mastering: ${check}`);
