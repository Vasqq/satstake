// Renders the film. Frames come from window.seek(t) in a headless browser; ffmpeg encodes them.
//   node tools/render.mjs --stills 3.2,9.5,24.8,44,59         stills to out/stills/
//   node tools/render.mjs [--format 9x16] [--from 10 --to 14]  video (a range renders only those seconds)
//   node tools/render.mjs --hash 44                            renders one frame twice and compares hashes
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const FILM = new URL("..", import.meta.url).pathname;
const ROOT = join(FILM, ".."); // the repository, so the page can load the app's own fonts
const OUT = join(FILM, "out");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const format = opt("format", "16x9");
const fps = Number(opt("fps", 60));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    createReadStream(path).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

async function open(server) {
  const { port } = server.address();
  const [w, h] = format === "9x16" ? [1080, 1920] : [1920, 1080];
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"] });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`http://127.0.0.1:${port}/film/index.html?format=${format}`);
  await page.evaluate(() => window.ready);
  return { browser, page };
}
const frame = async (page, t) => {
  await page.evaluate(([t, fps]) => window.seek(t, fps), [t, fps]);
  return page.locator("#film").screenshot({ type: "png" });
};

const server = await serve();
const { browser, page } = await open(server);
mkdirSync(OUT, { recursive: true });

try {
  if (args.includes("--stills")) {
    const dir = join(OUT, "stills");
    mkdirSync(dir, { recursive: true });
    for (const t of opt("stills", "").split(",").map(Number)) {
      const file = join(dir, `${format}-${t.toFixed(2)}.png`);
      await page.evaluate(([t, fps]) => window.seek(t, fps), [t, fps]);
      await page.locator("#film").screenshot({ path: file });
      console.log(file);
    }
  } else if (args.includes("--hash")) {
    const t = Number(opt("hash", 0));
    const a = createHash("sha256").update(await frame(page, t)).digest("hex");
    await frame(page, t + 7);
    const b = createHash("sha256").update(await frame(page, t)).digest("hex");
    console.log(a === b ? `deterministic at t=${t}: ${a.slice(0, 16)}` : `NOT deterministic at t=${t}: ${a.slice(0, 16)} vs ${b.slice(0, 16)}`);
    if (a !== b) process.exitCode = 1;
  } else {
    const from = Number(opt("from", 0));
    const to = Number(opt("to", await page.evaluate(() => window.DURATION)));
    const name = opt("out", from === 0 && to >= 60 ? `video-${format}.mp4` : `part-${format}-${from}-${to}.mp4`);
    const file = join(OUT, name);
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
    const first = Math.round(from * fps);
    const last = Math.round(to * fps);
    const started = Date.now();
    for (let f = first; f < last; f++) {
      const png = await frame(page, f / fps);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
      if (f % 120 === 0) console.log(`frame ${f}/${last} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    }
    ff.stdin.end();
    await new Promise((r, j) => ff.on("close", (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`)))));
    console.log(file);
  }
} finally {
  await browser.close();
  server.close();
}
