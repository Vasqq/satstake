// The SatStake demo film. Every frame is a pure function of t: window.seek(t) draws it from nothing.
// See ../CLAUDE.md for the render contract.
import { Ink, satStakeSignature } from "./ink.gen.js";
import { AT, DURATION, GLIDE, HOOK, HOOK_TYPED, SHOT, SIGNATURE, STRIKE, UNDERLINE, WRITE_TYPED, handLine, mulberry32 } from "./timeline.js";

const params = new URLSearchParams(location.search);
const V = params.get("format") === "9x16";
const W = V ? 1080 : 1920;
const H = V ? 1920 : 1080;

const canvas = document.getElementById("film");
canvas.width = W;
canvas.height = H;
const g = canvas.getContext("2d");

// The Signed design's light tokens (app/src/styles.css).
const C = {
  paper: "#f7f8fa",
  ink: "#14213d",
  ink2: "#3d4a66",
  sub: "#616b80",
  rule: "#dde1e8",
  sat: "#e86a12",
  kept: "#17784c",
};
const SERIF = '"Newsreader", Georgia, serif';
const SANS = '"Hanken Grotesk", system-ui, sans-serif';

// ---------------------------------------------------------------- math

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;

// A closed-form damped spring from 0 to 1, started at t = 0. Stiffness and damping per unit mass. With damping at or
// above critical it never overshoots, which is what type and logos use.
export function spring(t, k = 170, c = 26) {
  if (t <= 0) return 0;
  const w = Math.sqrt(k);
  const z = c / (2 * w);
  if (Math.abs(z - 1) < 1e-3) return 1 - (1 + w * t) * Math.exp(-w * t);
  if (z > 1) {
    const s = w * Math.sqrt(z * z - 1);
    const r1 = -z * w + s;
    const r2 = -z * w - s;
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}
const heavy = (t) => spring(t, 90, 19.5); // big type and the logo, slightly over critical
const soft = (t) => spring(t, 170, 26); // everything else

// ---------------------------------------------------------------- assets

const IMAGES = {
  typing: Array.from({ length: 27 }, (_, i) => `assets/testnet/typing/${String(i).padStart(2, "0")}.png`),
  stake: "assets/testnet/c02-stake.png",
  people: "assets/testnet/c03-people.png",
  ready: "assets/testnet/c04-ready.png",
  confirming: "assets/testnet/c05-confirming.png",
  signed: "assets/testnet/c06-signed-noink.png",
  verdict: "assets/testnet-referee/r01-verdict.png",
  kept: "assets/testnet-referee/r02-kept.png",
  home: "assets/home.png",
  p1: "assets/p1.png",
  p3: "assets/p3.png",
};
const img = {};
const loadImage = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error(`missing ${src}`));
    i.src = src;
  });

async function loadFonts() {
  const base = "/app/public/fonts/";
  const faces = [
    new FontFace("Newsreader", `url(${base}newsreader-latin-opsz-normal.woff2)`, { weight: "300 600", style: "normal" }),
    new FontFace("Newsreader", `url(${base}newsreader-latin-opsz-italic.woff2)`, { weight: "300 600", style: "italic" }),
    new FontFace("Hanken Grotesk", `url(${base}hanken-grotesk-latin-400-normal.woff2)`, { weight: "400" }),
    new FontFace("Hanken Grotesk", `url(${base}hanken-grotesk-latin-500-normal.woff2)`, { weight: "500" }),
    new FontFace("Hanken Grotesk", `url(${base}hanken-grotesk-latin-600-normal.woff2)`, { weight: "600" }),
  ];
  for (const f of faces) document.fonts.add(await f.load());
}

// Static paper grain from seeded noise, made once. Same seed, same grain, every render.
let grain;
function makeGrain() {
  grain = new OffscreenCanvas(W, H);
  const gg = grain.getContext("2d");
  const data = gg.createImageData(W, H);
  const rand = mulberry32(5042);
  for (let i = 0; i < W * H; i++) {
    const v = rand();
    data.data[i * 4] = 20;
    data.data[i * 4 + 1] = 33;
    data.data[i * 4 + 2] = 61;
    data.data[i * 4 + 3] = Math.round(v * v * 16);
  }
  gg.putImageData(data, 0, 0);
}

// ---------------------------------------------------------------- drawing helpers

function paper() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, H);
}
function finish() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.drawImage(grain, 0, 0);
}

function text(str, x, y, { font, size, weight = 400, italic = false, color = C.ink, track = 0, alpha = 1, align = "left" }) {
  g.font = `${italic ? "italic " : ""}${weight} ${size}px ${font}`;
  g.letterSpacing = `${track}px`;
  g.fillStyle = color;
  g.globalAlpha = alpha;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillText(str, x, y);
  const width = g.measureText(str).width;
  g.globalAlpha = 1;
  g.letterSpacing = "0px";
  return width;
}
const measure = (str, { font, size, weight = 400, italic = false, track = 0 }) => {
  g.font = `${italic ? "italic " : ""}${weight} ${size}px ${font}`;
  g.letterSpacing = `${track}px`;
  const w = g.measureText(str).width;
  g.letterSpacing = "0px";
  return w;
};

// The hero caret: orange, solid while typing, blinking at the app's 1.05 s when idle.
function caret(x, y, size, t, typingUntil) {
  const on = t < typingUntil || Math.floor((t - typingUntil) / 0.525) % 2 === 0;
  if (!on) return;
  g.fillStyle = C.sat;
  g.fillRect(x + size * 0.04, y - size * 0.76, Math.max(3, size * 0.045), size * 0.82);
}

// Ink drawn by the app's own Ink class onto a scratch canvas, from points timed in ms. `ms` is how far the pen has got.
const inkCanvas = new OffscreenCanvas(W, H);
function drawInk(strokes, ms, { x = 0, y = 0, scale = 1, color = C.ink } = {}) {
  const ig = inkCanvas.getContext("2d");
  ig.setTransform(1, 0, 0, 1, 0, 0);
  ig.clearRect(0, 0, W, H);
  ig.setTransform(scale, 0, 0, scale, x, y);
  const k = new Ink(ig, () => color);
  for (const stroke of strokes) {
    if (!stroke.length || stroke[0].t > ms) break;
    k.begin(stroke[0].x, stroke[0].y, stroke[0].t);
    for (let i = 1; i < stroke.length && stroke[i].t <= ms; i++) k.add(stroke[i].x, stroke[i].y, stroke[i].t);
    k.end();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(inkCanvas, 0, 0);
}
const inkEnd = (strokes) => strokes.at(-1).at(-1).t;

// ---------------------------------------------------------------- camera over real captures

// Fits an image rectangle into the area under the step header. Returns the scale and the rectangle's centre.
function fit(r, fw = V ? 0.9 : 0.84, fh = V ? 0.42 : 0.56) {
  // Capped so a 2x capture is never blown up past the point where its text goes soft.
  return { s: Math.min((W * fw) / r.w, (H * fh) / r.h, 2.2), cx: r.x + r.w / 2, cy: r.y + r.h / 2, r };
}
const UI_DY = V ? 160 : 110; // the UI sits below centre, leaving the top to the step header
// Draws `image` so the camera's centre sits at (W/2, H/2 + UI_DY), scaled by cam.s. Push-in multiplies the scale.
// Only the camera's rectangle of the capture is shown, on plain paper, so nothing around the element competes with it.
function shoot(image, cam, push = 1, alpha = 1, lift = 0) {
  if (alpha <= 0) return;
  const s = cam.s * push;
  g.save();
  g.globalAlpha = alpha;
  g.setTransform(s, 0, 0, s, W / 2 - cam.cx * s, H / 2 + UI_DY + lift - cam.cy * s);
  g.beginPath();
  g.rect(cam.r.x, cam.r.y, cam.r.w, cam.r.h);
  g.clip();
  g.imageSmoothingQuality = "high";
  g.drawImage(image, 0, 0);
  g.restore();
}
// A camera move from rect a to rect b, driven by a spring started at t0. Scale is blended in log space so a zoom
// feels even. Critical damping, about a second to settle.
const slowCam = (t) => spring(t, 40, 12.65);
function camBetween(a, b, t, t0) {
  const u = slowCam(t - t0);
  const A = fit(a);
  const B = fit(b);
  const r = { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u) };
  return { s: Math.exp(lerp(Math.log(A.s), Math.log(B.s), u)), cx: lerp(A.cx, B.cx, u), cy: lerp(A.cy, B.cy, u), r };
}
// A slow push-in across a whole shot, so a held frame still breathes.
const pushIn = (t, [a, b]) => 1 + 0.03 * clamp((t - a) / (b - a));
// The app changing state: the old view lifts away and fades, the new one settles in from just below, each in its
// own framing. Nothing travels across the page, so nothing streams past the eye half-read.
function swap(t, t0, fromImg, fromRect, toImg, toRect, push) {
  const out = clamp((t - t0) / 0.3);
  if (out < 1) shoot(fromImg, fit(fromRect), push, 1 - out * out, -16 * out);
  const lt = t - t0 - 0.18;
  if (lt > 0) shoot(toImg, fit(toRect), push, clamp(lt / 0.35), 22 * (1 - soft(lt)));
}

// The step header: number, title, and five marks for where the viewer is. It enters once when the step starts
// and stays for the whole step, so the step is never on screen for less than six seconds.
const STEPS = ["Write the promise.", "Put Bitcoin on it.", "Pick who judges, and who collects.", "Sign it.", "Your referee decides."];
function header(n, lt) {
  const u = heavy(lt);
  const pad = V ? 64 : 120;
  const top = (V ? 240 : 170) + (1 - u) * 12;
  const size = V ? 58 : 86;
  const num = String(n).padStart(2, "0");
  const nw = text(num, pad, top, { font: SANS, size: size * 0.7, weight: 600, color: C.sat, track: 2, alpha: u });
  text(STEPS[n - 1], pad + nw + size * 0.45, top, { font: SERIF, size, weight: 400, color: C.ink, track: -size * 0.02, alpha: u });
  for (let i = 0; i < 5; i++) {
    g.globalAlpha = u;
    g.fillStyle = i + 1 === n ? C.sat : i + 1 < n ? C.ink2 : C.rule;
    g.fillRect(pad + i * 64, top + (V ? 50 : 56), 52, 5);
  }
  g.globalAlpha = 1;
}
// A heading over a shot that is not a step.
function caption(str, lt) {
  const u = heavy(lt);
  const size = V ? 58 : 86;
  text(str, V ? 64 : 120, (V ? 240 : 170) + (1 - u) * 12, { font: SERIF, size, weight: 400, italic: true, color: C.ink, track: -size * 0.02, alpha: u });
}
// Where a shot was recorded, bottom corner. Only mainnet shots carry it.
function source(str, lt) {
  const u = soft(lt);
  const pad = V ? 64 : 120;
  const size = V ? 34 : 30;
  const y = V ? H - 110 : H - 70;
  const x = V ? pad : W - pad;
  const w = measure(str, { font: SANS, size, weight: 500, track: 1 });
  const dotX = V ? x : x - w - 26;
  g.fillStyle = C.kept;
  g.globalAlpha = u;
  g.beginPath();
  g.arc(dotX + 6, y - 10, 7, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  text(str, V ? x + 26 : x, y, { font: SANS, size, weight: 500, color: C.sub, track: 1, alpha: u, align: V ? "left" : "right" });
}

// An expanding ring where a finger lands, instead of a cursor.
function tap(imgX, imgY, cam, push, lt) {
  if (lt < 0 || lt > 0.7) return;
  const s = cam.s * push;
  const x = W / 2 + (imgX - cam.cx) * s;
  const y = H / 2 + UI_DY + (imgY - cam.cy) * s;
  const u = soft(lt);
  g.strokeStyle = C.sat;
  g.lineWidth = 7;
  g.globalAlpha = 1 - clamp(lt / 0.7) ** 2;
  g.beginPath();
  g.arc(x, y, 24 + 70 * u, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- shots

// Rectangles in capture pixels (the captures are 2x). None of them reaches the nav, the footer, or the wallet
// line, which is where a testnet capture names its network.
const R = {
  hero: { x: 420, y: 300, w: 2060, h: 860 },
  token: { x: 460, y: 1490, w: 980, h: 170 },
  amount: { x: 1450, y: 1490, w: 1000, h: 225 },
  referee: { x: 460, y: 1700, w: 980, h: 250 },
  beneficiary: { x: 1450, y: 1700, w: 1000, h: 290 },
  button: { x: 1890, y: 2252, w: 515, h: 124 },
  steps: { x: 460, y: 2262, w: 1160, h: 165 },
  signedHead: { x: 435, y: 1352, w: 1000, h: 164 },
  stats: { x: 1436, y: 9925, w: 1014, h: 295 },
  contract: { x: 430, y: 10235, w: 1080, h: 310 },
  verdict: { x: 650, y: 1690, w: 760, h: 190 },
  // The verdict on the referee's own page, above the line that names that promise's amount.
  keptState: { x: 1570, y: 3020, w: 820, h: 270 },
  quote: { x: 435, y: 320, w: 2010, h: 400 },
  money1: { x: 435, y: 3020, w: 2010, h: 545 },
  money3: { x: 435, y: 2959, w: 2010, h: 545 },
  state1: { x: 1556, y: 3030, w: 889, h: 530 },
  state3: { x: 1556, y: 2969, w: 889, h: 530 },
};

// The vertical cut reframes the wide shots around their one element instead of shrinking them.
if (V) {
  Object.assign(R, {
    token: { x: 460, y: 1490, w: 560, h: 170 },
    amount: { x: 1460, y: 1500, w: 640, h: 232 },
    stats: { x: 1436, y: 9925, w: 504, h: 295 },
    money1: { x: 435, y: 3020, w: 1125, h: 545 },
    money3: { x: 435, y: 2959, w: 1125, h: 545 },
  });
}

const LEFT = V ? 72 : 180;

function hook(t) {
  paper();
  const size = V ? 118 : 150;
  const x = LEFT;
  const { l1, l2 } = HOOK;
  const y1 = V ? 760 : 430;
  const y2 = y1 + size * 1.02;
  const typed = HOOK_TYPED.filter((at) => t >= at).length;
  const s1 = l1.slice(0, typed);
  const s2 = l2.slice(0, Math.max(0, typed - l1.length));
  const typingUntil = HOOK_TYPED.at(-1) + 0.1;
  const w1 = text(s1, x, y1, { font: SERIF, size, weight: 300, track: -size * 0.035 });
  const w2 = text(s2, x, y2, { font: SERIF, size, weight: 400, italic: true, track: -size * 0.035 });
  if (typed <= l1.length) caret(x + w1, y1, size, t, typingUntil);
  else caret(x + w2, y2, size, t, typingUntil);
  // The hero's orange rule, as on the New promise page.
  g.fillStyle = C.sat;
  g.fillRect(x, y2 + size * 0.36, W - x * 2, 3);
  if (t >= STRIKE.at) {
    const mx0 = x + measure("on ", { font: SERIF, size, italic: true, track: -size * 0.035 }) - 8;
    const mx1 = x + measure(l2, { font: SERIF, size, italic: true, track: -size * 0.035 }) + 10;
    const sy = y2 - size * 0.3;
    const k = 2.2;
    drawInk(handLine(mx0 / k, (sy + 8) / k, mx1 / k, (sy - 6) / k, STRIKE.ms, 7), (t - STRIKE.at) * 1000, { scale: k });
  }
  if (t >= 5.5) {
    const u = soft(t - 5.5);
    text("Promises are free to break.", x, y2 + size * 0.36 + (V ? 120 : 110) + (1 - u) * 14, { font: SANS, size: V ? 46 : 44, weight: 500, color: C.ink2, alpha: u });
  }
  finish();
}

// The signature the app writes, at film scale, sped up to exactly one second.
const sigBox = V ? { w: 500, h: 170 } : { w: 600, h: 200 };
const SIG_SCALE = V ? 2 : 2.1;
const sig = satStakeSignature(sigBox.w, sigBox.h);
const SIG_MS = inkEnd(sig);

function turn(t) {
  paper();
  const sx = V ? 72 - 0.06 * 500 * 2 - 40 : 180 - (0.06 * 600 + 20) * 2.1;
  const sy = V ? 560 : 150;
  drawInk(sig, Math.max(0, (t - SIGNATURE.at) * SIG_MS * (1000 / SIGNATURE.ms)), { x: sx, y: sy, scale: SIG_SCALE });
  if (t >= 8.5) {
    const u = heavy(t - 8.5);
    const y = (V ? 1180 : 760) + (1 - u) * 18;
    const size = V ? 88 : 72;
    if (V) {
      text("Lock Bitcoin", LEFT, y, { font: SERIF, size, weight: 400, alpha: u, track: -1 });
      text("against a promise.", LEFT, y + size * 1.15, { font: SERIF, size, weight: 400, italic: true, alpha: u, track: -1 });
    } else {
      const w = text("Lock Bitcoin ", LEFT, y, { font: SERIF, size, weight: 400, alpha: u, track: -1 });
      text("against a promise.", LEFT + w, y, { font: SERIF, size, weight: 400, italic: true, alpha: u, track: -1 });
    }
  }
  finish();
}

function write(t) {
  paper();
  // Frame n of the typing captures holds n characters; frame 23 (mid-wrap) is never shown.
  let n = Math.max(1, WRITE_TYPED.filter((at) => t >= at).length);
  if (n === 23) n = 22;
  shoot(img.typing[n], fit(R.hero), pushIn(t, SHOT.write));
  header(1, t - SHOT.write[0]);
  finish();
}

function stake(t) {
  paper();
  swap(t, AT.stakeGlide, img.stake, R.token, img.stake, R.amount, pushIn(t, SHOT.stake));
  header(2, t - SHOT.stake[0]);
  finish();
}

function people(t) {
  paper();
  swap(t, AT.peopleGlide, img.people, R.referee, img.people, R.beneficiary, pushIn(t, SHOT.people));
  header(3, t - SHOT.people[0]);
  finish();
}

function sign(t) {
  paper();
  const push = pushIn(t, SHOT.sign);
  if (t < AT.signToSteps) {
    const cam = fit(R.button);
    shoot(img.ready, cam, push);
    tap(2166, 2312, cam, push, t - AT.signTap);
  } else if (t < AT.stepsToSigned) {
    swap(t, AT.signToSteps, img.ready, R.button, img.confirming, R.steps, push);
  } else {
    swap(t, AT.stepsToSigned, img.confirming, R.steps, img.signed, R.signedHead, push);
  }
  header(4, t - SHOT.sign[0]);
  finish();
}

function bigLines(lt, a, b, accent) {
  const size = V ? 120 : 150;
  const y = V ? 860 : 470;
  const u = heavy(lt);
  text(a, LEFT, y + (1 - u) * 16, { font: SERIF, size, weight: 300, alpha: u, track: -size * 0.035 });
  const w = text(b, LEFT, y + size * 1.05 + (1 - u) * 16, { font: SERIF, size, weight: 400, italic: true, alpha: u, track: -size * 0.035 });
  if (accent) text(accent, LEFT + w, y + size * 1.05 + (1 - u) * 16, { font: SERIF, size, weight: 400, italic: true, color: C.sat, alpha: u, track: -size * 0.035 });
}

function locked(t) {
  paper();
  bigLines(t - SHOT.locked[0], "200 sats,", "locked on ", "Arc.");
  finish();
}

// Why Arc, in the North Star's own words: cirBTC as the stake, USDC as gas, final the moment it lands.
function arc(t) {
  const lt = t - SHOT.arc[0];
  paper();
  const size = V ? 112 : 140;
  const y = V ? 820 : 430;
  const k = soft(lt);
  text("Why Arc", LEFT, y - size * 0.95, { font: SANS, size: V ? 46 : 48, weight: 600, color: C.sat, track: 2, alpha: k });
  const u1 = heavy(lt - 0.2);
  text("Final the moment", LEFT, y + (1 - u1) * 16, { font: SERIF, size, weight: 300, alpha: u1, track: -size * 0.035 });
  const u2 = heavy(lt - 0.5);
  text("it lands.", LEFT, y + size * 1.05 + (1 - u2) * 16, { font: SERIF, size, weight: 400, italic: true, alpha: u2, track: -size * 0.035 });
  const u3 = soft(lt - 1.5);
  const sy = y + size * 1.05 + (V ? 150 : 130) + (1 - u3) * 12;
  const ss = V ? 44 : 46;
  if (V) {
    text("The stake is cirBTC.", LEFT, sy, { font: SANS, size: ss, weight: 500, color: C.ink2, alpha: u3 });
    text("Gas is USDC, so a promise", LEFT, sy + ss * 1.4, { font: SANS, size: ss, weight: 500, color: C.ink2, alpha: u3 });
    text("costs cents to make.", LEFT, sy + ss * 2.8, { font: SANS, size: ss, weight: 500, color: C.ink2, alpha: u3 });
  } else {
    text("The stake is cirBTC. Gas is USDC, so a promise costs cents to make.", LEFT, sy, { font: SANS, size: ss, weight: 500, color: C.ink2, alpha: u3 });
  }
  finish();
}

function proof(t) {
  const lt = t - SHOT.proof[0];
  paper();
  swap(t, SHOT.proof[0] + 3, img.home, R.stats, img.home, R.contract, pushIn(t, SHOT.proof));
  caption("Read straight from the contract.", lt);
  source("Live on Arc mainnet", lt);
  finish();
}

function judge(t) {
  paper();
  const push = pushIn(t, SHOT.judge);
  if (t < AT.judgeToKept) {
    const cam = fit(R.verdict);
    shoot(img.verdict, cam, push);
    tap(730, 1830, cam, push, t - AT.judgeTap);
  } else {
    swap(t, AT.judgeToKept, img.verdict, R.verdict, img.kept, R.keptState, push);
  }
  header(5, t - SHOT.judge[0]);
  finish();
}

function bridge(t) {
  paper();
  const size = V ? 92 : 110;
  const y = V ? 900 : 500;
  const u = heavy(t - SHOT.bridge[0]);
  text("On Arc mainnet,", LEFT, y + (1 - u) * 14, { font: SERIF, size, weight: 300, alpha: u, track: -size * 0.03 });
  text("it already happened.", LEFT, y + size * 1.1 + (1 - u) * 14, { font: SERIF, size, weight: 400, italic: true, alpha: u, track: -size * 0.03 });
  finish();
}

// The promise, then where the money went, then the state up close.
function payoff(t, span, image, money, state, moneyAt, glideAt, label) {
  paper();
  if (t < moneyAt) shoot(image, fit(R.quote), pushIn(t, [span[0], moneyAt + 1]));
  else shoot(image, camBetween(money, state, t, glideAt), 1);
  source(label, t - span[0]);
  finish();
}

function recap(t) {
  paper();
  const lines = ["Write it.", "Stake it.", "Keep it."];
  const i = AT.recap.filter((at) => t >= at).length - 1;
  const line = lines[Math.max(0, i)];
  const lt = t - AT.recap[Math.max(0, i)];
  const size = V ? 190 : 230;
  const y = (V ? 1040 : 640) + (1 - heavy(lt)) * 10;
  const word = line.split(" ");
  const w = text(word[0] + " ", LEFT, y, { font: SERIF, size, weight: 300, track: -size * 0.04 });
  text(word[1], LEFT + w, y, { font: SERIF, size, weight: 400, italic: true, color: i === 2 ? C.sat : C.ink, track: -size * 0.04 });
  finish();
}

function endCard(t) {
  paper();
  const size = V ? 150 : 170;
  const y = V ? 820 : 420;
  const w = text("Sat", LEFT, y, { font: SERIF, size, weight: 500, italic: true, track: -size * 0.02 });
  text("Stake", LEFT + w, y, { font: SERIF, size, weight: 500, italic: true, color: C.sat, track: -size * 0.02 });
  const y2 = y + (V ? 130 : 120);
  g.fillStyle = C.kept;
  g.beginPath();
  g.arc(LEFT + 10, y2 - 12, 9, 0, Math.PI * 2);
  g.fill();
  text("Live on Arc mainnet", LEFT + 34, y2, { font: SANS, size: V ? 40 : 38, weight: 500, color: C.ink });
  const y3 = y2 + (V ? 110 : 100);
  const url = "vasqq.github.io/satstake";
  const uw = text(url, LEFT, y3, { font: SERIF, size: V ? 62 : 64, weight: 400, color: C.ink });
  const k = 1.6;
  drawInk(handLine((LEFT - 4) / k, (y3 + 22) / k, (LEFT + uw + 6) / k, (y3 + 18) / k, UNDERLINE.ms, 11), (t - UNDERLINE.at) * 1000, { scale: k });
  text("Tested, not audited. A solo entry to Circle's Arc Microgrants.", LEFT, V ? H - 140 : H - 90, { font: SANS, size: V ? 26 : 24, weight: 400, color: C.sub });
  // The last second and a half falls to paper.
  const fade = clamp((t - (SHOT.end[1] - 1.5)) / 1.5);
  if (fade > 0) {
    g.globalAlpha = fade;
    g.fillStyle = C.paper;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
  }
  finish();
}

export const SHOTS = [
  [SHOT.hook, hook],
  [SHOT.turn, turn],
  [SHOT.write, write],
  [SHOT.stake, stake],
  [SHOT.people, people],
  [SHOT.sign, sign],
  [SHOT.locked, locked],
  [SHOT.arc, arc],
  [SHOT.proof, proof],
  [SHOT.judge, judge],
  [SHOT.bridge, bridge],
  [SHOT.pay1, (t) => payoff(t, SHOT.pay1, img.p1, R.money1, R.state1, AT.pay1Money, AT.pay1Glide, "Arc mainnet · promise #1")],
  [SHOT.pay3, (t) => payoff(t, SHOT.pay3, img.p3, R.money3, R.state3, AT.pay3Money, AT.pay3Glide, "Arc mainnet · promise #3")],
  [SHOT.recap, recap],
  [SHOT.end, endCard],
];

// Spans where the camera moves, so the renderer averages subframes there and nowhere else.
const MOVES = [AT.pay1Glide, AT.pay3Glide].map((a) => [a, a + GLIDE]);

function draw(t) {
  const shot = SHOTS.find(([[a, b]]) => t >= a && t < b) ?? SHOTS.at(-1);
  shot[1](t);
}

// Draws frame t. With blur on and t inside a camera move, the frame is the exact mean of four subframes spread
// over one frame's time, the same result as ffmpeg tmix=frames=4 with equal weights.
window.seek = (t, fps = 60) => {
  const moving = MOVES.some(([a, b]) => t >= a && t < b);
  if (!moving || params.get("blur") === "0") {
    draw(t);
    return false;
  }
  const acc = new Uint32Array(W * H * 4);
  for (let k = 0; k < 4; k++) {
    draw(t + k / (4 * fps));
    const d = g.getImageData(0, 0, W, H).data;
    for (let i = 0; i < d.length; i++) acc[i] += d[i];
  }
  const out = g.createImageData(W, H);
  for (let i = 0; i < acc.length; i++) out.data[i] = (acc[i] + 2) >> 2;
  g.putImageData(out, 0, 0);
  return true;
};
window.DURATION = DURATION;
window.FORMAT = { W, H };

window.ready = (async () => {
  await loadFonts();
  const entries = Object.entries(IMAGES);
  for (const [k, v] of entries) img[k] = Array.isArray(v) ? await Promise.all(v.map(loadImage)) : await loadImage(v);
  makeGrain();
  return true;
})();
