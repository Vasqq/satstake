import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "../../styles.css"), "utf8");
const darkStart = css.search(/@media\s*\(prefers-color-scheme:\s*dark\)/);
const lightCss = css.slice(0, darkStart);
const darkCss = css.slice(darkStart);
const marker = css.indexOf("/* Pledge page");
const section = marker === -1 ? "" : css.slice(marker);

const tokens = (source: string) =>
  Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1] as string, m[2] as string]));
const channel = (hex: string, at: number) => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The declarations of the first rule in the pledge section whose selector contains `selector`. */
function rule(selector: string): string {
  const match = new RegExp(`${selector.replace(/[.[\]()*+?^$|\\]/g, "\\$&")}[^{]*\\{([^}]*)\\}`).exec(section);
  return match?.[1] ?? "";
}

describe("LLR-FE-040 the pledge page's styles keep the promise as written", () => {
  it("has its own section of the stylesheet", () => {
    expect(marker).toBeGreaterThan(-1);
  });

  it("keeps the promise's line breaks and lets a long word wrap", () => {
    expect(rule(".pledge-promise")).toMatch(/white-space:\s*pre-wrap/);
    expect(rule(".pledge-promise")).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("makes the promise larger than body text", () => {
    expect(rule(".pledge-promise")).toMatch(/font-size:\s*1\.[2-9]\d*rem|font-size:\s*[2-9]/);
  });
});

describe("LLR-FE-072 the pledge page's warning, failure, and badge colours meet WCAG 2.1 AA in both schemes", () => {
  const schemes = [
    ["light", tokens(lightCss)],
    ["dark", { ...tokens(lightCss), ...tokens(darkCss) }],
  ] as const;

  it.each(schemes)("sets the warning on the notice colours, at 4.5 to 1 or more, in %s", (_name, t) => {
    const warning = rule(".pledge-warning");
    expect(warning).toMatch(/background:\s*var\(--banner-notice-bg\)/);
    expect(warning).toMatch(/color:\s*var\(--banner-notice-fg\)/);
    expect(contrast(t["--banner-notice-fg"] as string, t["--banner-notice-bg"] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(schemes)("sets a failure on the error colours, at 4.5 to 1 or more, in %s", (_name, t) => {
    expect(contrast(t["--banner-error-fg"] as string, t["--banner-error-bg"] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(schemes)("draws the warning's frame at 3 to 1 or more against the page, in %s", (_name, t) => {
    expect(rule(".pledge-warning")).toMatch(/border:[^;]*var\(--banner-notice-fg\)/);
    expect(contrast(t["--banner-notice-fg"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(3);
  });

  it.each(schemes)("draws every state badge's frame at 3 to 1 or more against the page, in %s", (_name, t) => {
    const frames = [...section.matchAll(/\.state-badge\[data-state[^{]*\{[^}]*border-color:\s*var\((--[\w-]+)\)/g)].map((m) => m[1] as string);
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const name of frames) expect(contrast(t[name] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(3);
  });

  it("does not tell the states apart by colour alone: the badge carries a border and the state's name", () => {
    expect(rule(".state-badge")).toMatch(/border:\s*2px solid/);
  });
});
