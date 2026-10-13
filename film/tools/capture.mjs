// Captures real SatStake UI at 2x from the live mainnet site, full page, plus the boxes of named elements,
// so shots crop real pixels instead of redrawn copies.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const SITE = "https://vasqq.github.io/satstake/";
const OUT = new URL("../assets/", import.meta.url).pathname;
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ["home", "p1", "p3", "create"];
const routes = { home: "#/", p1: "#/p/1", p2: "#/p/2", p3: "#/p/3", p4: "#/p/4", create: "#/create", about: "#/about" };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light", reducedMotion: "reduce", timezoneId: "UTC", locale: "en-US" });
const page = await ctx.newPage();
for (const name of pages) {
  await page.goto(SITE + routes[name], { waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.body.innerText.includes("Reading the promise"), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  writeFileSync(`${OUT}${name}.txt`, text);
  // Boxes of the blocks a shot may frame, in image pixels, found by the words they carry.
  const boxes = await page.evaluate((needles) => {
    const out = {};
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round((r.left + scrollX) * 2), y: Math.round((r.top + scrollY) * 2), w: Math.round(r.width * 2), h: Math.round(r.height * 2) };
    };
    const h1 = document.querySelector("h1");
    if (h1) out.h1 = box(h1);
    const all = [...document.querySelectorAll("body *")];
    for (const n of needles) {
      const el = all.filter((e) => e.children.length === 0 || [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
        .find((e) => e.textContent.trim().startsWith(n));
      if (!el) continue;
      out[n] = box(el);
      let p = el;
      for (let i = 0; i < 6 && p.parentElement; i++) {
        p = p.parentElement;
        if (getComputedStyle(p).borderTopWidth !== "0px" || p.tagName === "SECTION") {
          out[n + " (block)"] = box(p);
          break;
        }
      }
    }
    return out;
  }, ["Paid back", "Paid out", "Where the money is", "Check it yourself", "Done. The stake", "Promise #", "Live on Arc mainnet", "Seven lines.", "Nobody can"]);
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(boxes, null, 1));
  console.log(name, "ok");
}
await browser.close();
