import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Colours, fonts, theme, and layout are Liam's (05 v1.27); contrast is checked by inspection of the final
// styles. What stays here is what keeps the site safe and usable whatever it looks like.
const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

describe("LLR-FE-073 the style sheet loads nothing from another origin", () => {
  it("imports no style sheet and points no url() at another site", () => {
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
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
