// Captures every view at phone and desktop width, light and dark, so the design review reads the
// rendered app and not only its CSS. Usage, from app/:
//   PLAYWRIGHT_BROWSERS_PATH=0 node scripts/screenshots.mjs [extra hash routes...]
// The browser lives in node_modules (PLAYWRIGHT_BROWSERS_PATH=0) so nothing is written outside the
// repository. Output goes to the gitignored cache/screenshots/ at the repository root.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = fileURLToPath(new URL("../../cache/screenshots/", import.meta.url));
const port = 4317;
const base = `http://127.0.0.1:${port}/`;

const routes = ["#/", "#/create", "#/mine", "#/about", "#/p/1", "#/p/999999", "#/nowhere", ...process.argv.slice(2)];
const widths = [360, 1440];
const schemes = ["light", "dark"];

const build = spawnSync("npm", ["run", "build:testnet"], { cwd: appDir, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
  cwd: appDir,
  env: { ...process.env, VITE_NETWORK: "testnet" },
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not start on ${base}`);
}

function fileName(route, width, scheme) {
  const slug = route.replace(/^#\/?/, "").replace(/[^a-z0-9]+/gi, "-") || "home";
  return `${slug}-${width}-${scheme}.png`;
}

try {
  await waitForServer();
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const scheme of schemes) {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await context.newPage();
      for (const route of routes) {
        await page.goto(base + route);
        // Live reads settle within a poll or two; the screenshot should show the loaded state.
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1500);
        await page.screenshot({ path: outDir + fileName(route, width, scheme), fullPage: true });
      }
      await context.close();
    }
  }
  await browser.close();
  console.log(`${routes.length * widths.length * schemes.length} screenshots in cache/screenshots/`);
} finally {
  server.kill();
}
