import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Colours, fonts, theme, and layout are Liam's (05 v1.27); contrast is checked by inspection of the final
// styles. What stays here is what keeps the site safe and usable whatever it looks like. Every style sheet
// under src is bundled into the one the site serves, so every one is read, not only the global sheet.
const sheets = (readdirSync(import.meta.dirname, { recursive: true }) as string[]).filter(
  (f) => f.endsWith(".css") && !f.includes("node_modules"),
);
const css = sheets.map((f) => readFileSync(resolve(import.meta.dirname, f), "utf8")).join("\n");

describe("LLR-FE-073 every style sheet is checked", () => {
  it("reads the one style sheet, and finds no other", () => {
    expect(sheets.map((f) => f.replace(/\\/g, "/")).sort()).toEqual(
      ["styles.css"],
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
      ["Newsreader", "300"],
      ["Newsreader", "300"],
      ["Hanken Grotesk", "400"],
      ["Hanken Grotesk", "500"],
      ["Hanken Grotesk", "600"],
      ["Hanken Grotesk", "700"],
      ["JetBrains Mono", "400"],
      ["JetBrains Mono", "500"],
    ]);
    // Newsreader is one variable file per style, so its weight is a range; the design uses 300 to 600.
    expect(fontFaces.filter((f) => /Newsreader/.test(f)).map((f) => /font-weight:\s*(\d+ \d+)/.exec(f)?.[1])).toEqual(["300 600", "300 600"]);
    expect(fontFaces.filter((f) => /Newsreader/.test(f)).map((f) => /font-style:\s*(\w+)/.exec(f)?.[1])).toEqual(["normal", "italic"]);
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

  it("has a light theme, a dark theme that follows the system, and a data-theme override for each", () => {
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*{/);
    expect(css.match(/color-scheme:\s*dark\s*;/g)?.length).toBe(2);
  });

  it("carries the design's palette in both themes", () => {
    const light = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
    const dark = /:root\[data-theme="dark"\]\s*{([^}]*)}/.exec(css)?.[1] ?? "";
    for (const [token, value] of [["paper", "#f7f8fa"], ["sheet", "#ffffff"], ["ink", "#14213d"], ["sat", "#e86a12"], ["kept", "#17784c"], ["broken", "#c23a26"]]) {
      expect(light, token).toContain(`--${token}: ${value}`);
    }
    for (const [token, value] of [["paper", "#0c0f15"], ["sheet", "#121620"], ["ink", "#e3e9f5"], ["sat", "#ff9549"], ["kept", "#4fcf8f"], ["broken", "#ff7a66"]]) {
      expect(dark, token).toContain(`--${token}: ${value}`);
    }
  });

  it("repeats the system dark palette in the data-theme override, so the two cannot drift", () => {
    const system = /prefers-color-scheme:\s*dark\)\s*{\s*:root:not\(\[data-theme="light"\]\)\s*{([^}]*)}/.exec(css)?.[1] ?? "";
    const forced = /:root\[data-theme="dark"\]\s*{([^}]*)}/.exec(css)?.[1] ?? "";
    const norm = (block: string) => block.split(";").map((d) => d.trim()).filter(Boolean).sort();
    expect(norm(system)).toEqual(norm(forced));
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

// Every rule as its selector and its body, with the media wrappers left out: a rule inside one is read on its own.
const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: (m[1] as string).trim(), body: m[2] as string }));
const rulesFor = (pattern: RegExp) => rules.filter((r) => pattern.test(r.selector));

function tokensOf(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1] as string, m[2] as string]));
}
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi as number) + 0.05) / ((lo as number) + 0.05);
};
/** A foreground laid over a background at a share of its strength, as colour-mix in sRGB does with transparent. */
const blend = (fg: string, bg: string, share: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(parseInt(fg.slice(i, i + 2), 16) * share + parseInt(bg.slice(i, i + 2), 16) * (1 - share))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

describe("LLR-FE-072 text and control borders meet WCAG 2.1 AA in both themes, measured from the tokens themselves", () => {
  const themes = {
    light: tokensOf(/:root\s*{([^}]*)}/.exec(css)?.[1] ?? ""),
    dark: tokensOf(/:root\[data-theme="dark"\]\s*{([^}]*)}/.exec(css)?.[1] ?? ""),
  };
  // Text is 4.5 to 1, and the border of a control, which 1.4.11 asks for, 3 to 1.
  const text: [string, string][] = [
    ["ink", "paper"],
    ["ink", "sheet"],
    ["ink2", "sheet"],
    ["ink2", "paper"],
    ["sub", "paper"],
    ["sub", "sheet"],
    ["sub", "wash"],
    ["sat-text", "paper"],
    ["sat-text", "sheet"],
    ["sat-text", "wash"],
    ["kept", "sheet"],
    ["kept", "wash"],
    ["broken", "sheet"],
    ["broken", "wash"],
    ["on-sat", "sat"],
    ["on-state", "kept"],
    ["on-state", "broken"],
    ["on-state", "sub"],
    ["error-fg", "error-bg"],
    ["notice-fg", "notice-bg"],
  ];
  const borders: [string, string][] = [
    ["control", "sheet"],
    ["control", "paper"],
  ];
  for (const [theme, t] of Object.entries(themes)) {
    for (const [fg, bg] of text) {
      it(`${theme}: ${fg} on ${bg} is at least 4.5 to 1`, () => {
        expect(t[fg], `--${fg}`).toBeDefined();
        expect(ratio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
      });
    }
    for (const [fg, bg] of borders) {
      it(`${theme}: the control border ${fg} on ${bg} is at least 3 to 1`, () => {
        expect(ratio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(3);
      });
    }
    it(`${theme}: the agreement's lines that are not lit stay at 4.5 to 1 on the sheet`, () => {
      const dimmed = rulesFor(/^\.doc\.focus li$/)[0]?.body ?? "";
      const share = Number(/color-mix\(in srgb,\s*var\(--ink2\)\s*(\d+)%,\s*transparent\)/.exec(dimmed)?.[1]);
      expect(share).toBeGreaterThan(0);
      expect(ratio(blend(t["ink2"] as string, t["sheet"] as string, share / 100), t["sheet"] as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("LLR-FE-072 the promise field shows where the keyboard is", () => {
  it("has a focus rule with the orange ring and a heavier underline, and nothing that removes the outline after it", () => {
    const focus = rulesFor(/\.typed-in:focus-visible/);
    expect(focus.length).toBeGreaterThan(0);
    const body = focus.map((r) => r.body).join(";");
    expect(body).toMatch(/outline:\s*2px solid var\(--sat\)/);
    expect(body).toMatch(/box-shadow:[^;]*var\(--sat\)/);
    // A base rule that says outline none beats the global :focus-visible, which is how the ring was lost.
    for (const rule of rulesFor(/\.typed-in$/)) expect(rule.body, rule.selector).not.toMatch(/outline:\s*none/);
  });
});

describe("LLR-FE-072 only the boundaries of fields carry the darker control border", () => {
  it("leaves pills, chips, Read as and the ghost button on the design's hairline", () => {
    for (const rule of rulesFor(/\.readas|\.chain span|\.b\.ghost|\.pill|\.hash-controls|\.scen/)) {
      expect(rule.body, rule.selector).not.toContain("var(--control)");
    }
  });
});

describe("LLR-FE-073 the style sheet holds no rule for a class that no component uses", () => {
  // The words of every string a component holds, with comments left out: a class named only in a comment is unused.
  const strings = (source: string): string[] => {
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        found.push(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile("c.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
    return found;
  };
  const sources = (readdirSync(import.meta.dirname, { recursive: true }) as string[])
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes("node_modules"))
    .flatMap((f) => strings(readFileSync(resolve(import.meta.dirname, f), "utf8")))
    .join("\n");
  const index = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
  // A file name inside a url() reads as a class to this scan, so the url() contents are removed first.
  const classes = new Set([...stripped.replace(/url\([^)]*\)/g, "").matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1] as string));

  it("finds every class in the sheet in a component or in the page", () => {
    // Only a string made of nothing but class-like words counts, so a sentence that happens to contain "rule" does not.
    const named = new Set(
      [...sources.split("\n"), ...[...index.matchAll(/class="([^"]*)"/g)].map((m) => m[1] as string)]
        .filter((text) => /^[\w\s-]+$/.test(text))
        .flatMap((text) => text.split(/\s+/)),
    );
    const unused = [...classes].filter((c) => !named.has(c));
    expect(unused).toEqual([]);
  });

  it("carries one reduced-motion rule for everything, and none that names a single component", () => {
    const blocks = stripped.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{[^@]*?\n}\n/g) ?? [];
    expect(blocks.filter((b) => /\*,\s*\*::before/.test(b))).toHaveLength(1);
  });
});
