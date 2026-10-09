import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Colours, fonts, theme, and layout are Liam's (05 v1.27); contrast is checked by inspection of the final
// styles. What stays here is what keeps the site safe and usable whatever it looks like. Every style sheet
// under src is bundled into the one the site serves, so every one is read, not only the global sheet.
const sheets = (readdirSync(import.meta.dirname, { recursive: true }) as string[]).filter(
  (f) => f.endsWith(".css") && !f.includes("node_modules"),
);
const css = sheets.map((f) => readFileSync(resolve(import.meta.dirname, f), "utf8")).join("\n");

describe("LLR-FE-073 every style sheet is checked", () => {
  it("reads the global sheet and the view sheets", () => {
    expect(sheets.map((f) => f.replace(/\\/g, "/")).sort()).toEqual(
      expect.arrayContaining(["styles.css", "styles/forms.css", "styles/home.css", "styles/pledge.css"]),
    );
  });
});

describe("LLR-FE-073 the style sheet loads nothing from another origin", () => {
  it("imports no style sheet and points no url() at another site", () => {
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
  });
});

describe("LLR-FE-073 fonts and images come from the site's own files", () => {
  const fontFaces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1] as string);
  const urls = [...css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)].map((m) => m[1] as string);

  it("declares the three families and the weights the design uses", () => {
    const declared = fontFaces.map((f) => [/font-family:\s*"?([^";]+)"?/.exec(f)?.[1], /font-weight:\s*(\d+)/.exec(f)?.[1]]);
    expect(declared).toEqual([
      ["Inter Tight", "800"],
      ["Inter Tight", "900"],
      ["Inter", "400"],
      ["Inter", "500"],
      ["Inter", "600"],
      ["Inter", "700"],
      ["IBM Plex Mono", "400"],
      ["IBM Plex Mono", "500"],
    ]);
  });

  it("points every @font-face at a same-origin file that exists in public/fonts", () => {
    for (const face of fontFaces) {
      const src = /src:\s*url\(\s*["']?([^"')\s]+)["']?\s*\)\s*format\(\s*["']woff2["']\s*\)/.exec(face)?.[1];
      expect(src, face).toBeDefined();
      expect(src).toMatch(/^\/fonts\/[a-z0-9-]+\.woff2$/);
      expect(existsSync(resolve(import.meta.dirname, "../public", (src as string).slice(1))), src).toBe(true);
    }
  });

  it("shows text in a fallback face while a font loads", () => {
    for (const face of fontFaces) expect(face).toMatch(/font-display:\s*swap/);
  });

  it("uses no data: or blob: url, which the policy refuses, and every url() is a file under public", () => {
    for (const url of urls) {
      expect(url).toMatch(/^\/[a-z0-9./-]+$/);
      expect(existsSync(resolve(import.meta.dirname, "../public", url.slice(1))), url).toBe(true);
    }
    expect(urls).toContain("/grain.svg");
  });
});

describe("LLR-FE-072 motion is gentle and can be turned off", () => {
  it("never transitions every property", () => {
    expect(css).not.toMatch(/transition(-property)?:\s*[^;]*\ball\b/);
  });

  it("has a reduced-motion rule, and lets hover change colour only on a pointer that hovers", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(/@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
  });

  it("has one dark theme and does not follow the system setting", () => {
    expect(css).toMatch(/color-scheme:\s*dark\s*;/);
    expect(css).not.toMatch(/prefers-color-scheme/);
  });
});

describe("LLR-FE-072 keyboard focus stays visible", () => {
  it("styles :focus-visible with an outline", () => {
    expect(css).toMatch(/:focus-visible\s*{[^}]*outline:\s*[^;]*\d/);
  });
});

describe("LLR-FE-072 the page has a viewport declaration", () => {
  it("scales to the device width", () => {
    const html = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
    expect(html).toMatch(/<meta name="viewport" content="width=device-width/);
  });
});
