import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "styles.css"), "utf8");

// The dark tokens sit inside one prefers-color-scheme block; everything before it is the light theme.
const darkStart = css.search(/@media\s*\(prefers-color-scheme:\s*dark\)/);
const lightCss = darkStart === -1 ? css : css.slice(0, darkStart);
const darkCss = darkStart === -1 ? "" : css.slice(darkStart);

function tokens(source: string): Record<string, string> {
  return Object.fromEntries([...source.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1] as string, m[2] as string]));
}

const channel = (hex: string, at: number) => {
  const c = parseInt(hex.slice(at, at + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe("LLR-FE-072 the theme follows the system setting", () => {
  it("declares both colour schemes and a dark block under prefers-color-scheme", () => {
    expect(css).toMatch(/color-scheme:\s*light dark\s*;/);
    expect(darkStart).toBeGreaterThan(-1);
  });

  it("defines the same colour tokens for the light and the dark theme", () => {
    const light = Object.keys(tokens(lightCss)).sort();
    const dark = Object.keys(tokens(darkCss)).sort();
    expect(light.length).toBeGreaterThanOrEqual(10);
    expect(dark).toEqual(light);
  });
});

describe("LLR-FE-072 text contrast meets WCAG 2.1 AA in both themes", () => {
  const textPairs: [string, string][] = [
    ["--fg", "--bg"],
    ["--muted", "--bg"],
    ["--link", "--bg"],
    // The primary button is the page's background colour on the link colour.
    ["--bg", "--link"],
    ["--banner-error-fg", "--banner-error-bg"],
    ["--banner-notice-fg", "--banner-notice-bg"],
  ];
  for (const [name, source] of [
    ["light", lightCss],
    ["dark", darkCss],
  ] as const) {
    const t = tokens(source);
    it.each(textPairs)(`${name}: %s on %s is at least 4.5 to 1`, (fg, bg) => {
      expect(t[fg], fg).toBeDefined();
      expect(t[bg], bg).toBeDefined();
      expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
    });

    // WCAG 1.4.11: the border that marks a field in error is a graphic the user needs to find.
    it(`${name}: the border of a field in error is at least 3 to 1 against the page`, () => {
      expect(contrast(t["--banner-error-fg"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: the focus ring is at least 3 to 1 against the page`, () => {
      expect(contrast(t["--focus"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(3);
    });

    // WCAG 1.4.11: the border that marks a control is a graphic the user needs to find it.
    it(`${name}: the border of a control is at least 3 to 1 against the page`, () => {
      expect(t["--control-border"], "--control-border").toBeDefined();
      expect(contrast(t["--control-border"] as string, t["--bg"] as string)).toBeGreaterThanOrEqual(3);
    });
  }

  it("measures contrast correctly: black on white is 21 to 1 and equal colours are 1 to 1", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#767676", "#767676")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrast("#777777", "#ffffff")).toBeLessThan(4.5);
  });
});

describe("LLR-FE-072 keyboard focus is visible and layouts hold from 360 to 1440 px", () => {
  it("styles :focus-visible with an outline of at least 2 px using the focus token", () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/outline:\s*(\d+)px solid var\(--focus\)/);
    expect(Number(/outline:\s*(\d+)px/.exec(rule)?.[1])).toBeGreaterThanOrEqual(2);
  });

  it("removes an outline from nothing but the heading that takes focus on a route change", () => {
    const removed = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^}]*outline:\s*(?:none|0)\b[^}]*\}/g)].map((m) => (m[1] as string).trim());
    expect(removed).toEqual(['h1[tabindex="-1"]:focus']);
  });

  it("keeps the content in a column no wider than the viewport, with no fixed width of 360 px or more", () => {
    expect(css).toMatch(/max-width:\s*\d+(ch|rem|em|px)/);
    for (const m of css.matchAll(/(?<![-\w])(min-width|width):\s*(\d+)px/g)) {
      expect(Number(m[2]), m[0]).toBeLessThan(360);
    }
  });

  it("lets the wallet buttons wrap and gives every button a touch-sized height", () => {
    const list = /\.wallet-bar ul\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(list).toMatch(/flex-wrap:\s*wrap/);
    const button = /(?<![-\w.])button\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(button).toMatch(/min-height:\s*2\.75rem/);
  });

  it("draws a button's border in the control colour, and keeps the decorative border for rules", () => {
    const button = /(?<![-\w.])button\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(button).toMatch(/border:\s*1px solid var\(--control-border\)/);
    expect(button).toMatch(/font-size:\s*1rem/);
  });

  it("marks a pending control by more than colour: a dashed border, muted text, and a not-allowed cursor", () => {
    const rule = /button\[aria-disabled="true"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/border-style:\s*dashed/);
    expect(rule).toMatch(/color:\s*var\(--muted\)/);
    expect(rule).toMatch(/cursor:\s*not-allowed/);
    expect(css).not.toMatch(/button:disabled/);
  });

  it("lays the wallet bar out as one wrapping row of muted small text, with the notices on a row of their own", () => {
    const bar = /\.wallet-bar\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(bar).toMatch(/display:\s*flex/);
    expect(bar).toMatch(/flex-wrap:\s*wrap/);
    expect(bar).toMatch(/align-items:\s*center/);
    expect(bar).toMatch(/justify-content:\s*space-between/);
    expect(bar).toMatch(/font-size:\s*0\.875rem/);
    expect(bar).toMatch(/color:\s*var\(--muted\)/);
    const paragraphs = /\.wallet-bar p\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(paragraphs).toMatch(/margin:\s*0\s*;/);
    const area = /\.notice-area\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(area).toMatch(/flex-basis:\s*100%/);
  });

  it("gives the other-network state the notice colours, which are checked for contrast above", () => {
    const rule = /\.wallet-status-action\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--banner-notice-bg\)/);
    expect(rule).toMatch(/color:\s*var\(--banner-notice-fg\)/);
  });

  it("has no paragraph margin inside a hint or a notice area, so their lines sit together", () => {
    expect(/\.hint p,\s*\.notice-area p\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/margin:\s*0\s*;/);
  });

  it("holds the wallet area to the same column as the header", () => {
    const group = /([^{}]*)\{[^}]*max-width:\s*44rem/.exec(css)?.[1] ?? "";
    expect(group).toContain(".wallet-bar");
  });

  it("wraps long words, so an address or a transaction hash cannot push the page sideways", () => {
    expect(css).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
  });
});

describe("LLR-FE-072 the form's controls and messages are as findable and as readable as the buttons", () => {
  const rule = (selector: RegExp) => new RegExp(`(?<![-\\w.])${selector.source}[^{}]*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  const fields = rule(/textarea/);

  it("styles the text fields, the select, and the text area together", () => {
    const selectors = /([^{}]*textarea[^{}]*)\{/.exec(css)?.[1] ?? "";
    expect(selectors).toContain("select");
    expect(selectors).toMatch(/input/);
  });

  it("draws their border in the control colour, so the field can be found", () => {
    expect(fields).toMatch(/border:\s*1px solid var\(--control-border\)/);
  });

  it("gives them a touch-sized height, the page's text size, and the width of the column", () => {
    expect(fields).toMatch(/min-height:\s*2\.75rem/);
    expect(fields).toMatch(/font-size:\s*1rem/);
    expect(fields).toMatch(/width:\s*100%/);
  });

  it("frames a field's failure in the error colours and its warning in the notice colours, both checked for contrast above", () => {
    const failure = /\.field-error\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(failure).toMatch(/background:\s*var\(--banner-error-bg\)/);
    expect(failure).toMatch(/color:\s*var\(--banner-error-fg\)/);
    const warning = /\.field-warning\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(warning).toMatch(/background:\s*var\(--banner-notice-bg\)/);
    expect(warning).toMatch(/color:\s*var\(--banner-notice-fg\)/);
  });

  it("takes no room for a message that is not there, though its container stays in the page to be announced", () => {
    const empty = /\.field-error:empty[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(empty).toMatch(/padding:\s*0/);
    expect(empty).not.toMatch(/display:\s*none/);
    expect(css).not.toMatch(/\.field-(error|warning)[^{]*\{[^}]*display:\s*none/);
  });
});

describe("LLR-FE-072 the primary action, a field in error, and the spacing of the submit area", () => {
  it("draws the primary button in the link colour with the page colour for its text", () => {
    const rule = /\.button-primary\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--link\)/);
    expect(rule).toMatch(/color:\s*var\(--bg\)/);
  });

  it("gives the primary button that is not available the plain pending look, so muted text is never on the link colour", () => {
    const rule = /\.button-primary\[aria-disabled="true"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*transparent/);
    expect(rule).toMatch(/color:\s*var\(--muted\)/);
  });

  it("draws a field in error with a 2 px border in the error colour, which is not told by colour alone", () => {
    const rule = /([^{}]*\[aria-invalid="true"\][^{}]*)\{([^}]*)\}/.exec(css);
    expect(rule?.[1]).toMatch(/input/);
    expect(rule?.[1]).toMatch(/textarea/);
    expect(rule?.[1]).toMatch(/select/);
    expect(rule?.[2]).toMatch(/border:\s*2px solid var\(--banner-error-fg\)/);
  });

  it("spaces the submit area from its content, so a container with nothing in it takes no room", () => {
    const area = /\.submit-area\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(area).not.toMatch(/\bgap:/);
    const spaced = /\.submit-area\s*>\s*\*\s*\+\s*:not\(:empty\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(spaced).toMatch(/margin-top:\s*0\.5rem/);
  });

  it("keeps the room of the copy confirmation, so the button above it does not move when it is filled", () => {
    expect(/\.copy-status\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/min-height:\s*[\d.]+r?em/);
  });
});

describe("LLR-FE-073 the style sheet loads nothing from elsewhere and uses system fonts", () => {
  it("has no import, no font file, and no url()", () => {
    expect(css).not.toMatch(/@import|@font-face|url\(/);
  });

  it("sets a system font stack that starts with system-ui and ends in a generic family", () => {
    const stack = /font-family:\s*([^;]+);/.exec(css)?.[1] ?? "";
    expect(stack.trim()).toMatch(/^system-ui,/);
    expect(stack.trim()).toMatch(/(sans-serif|serif|monospace)$/);
  });
});

describe("LLR-FE-072 the page has a viewport declaration", () => {
  it("scales to the device width", () => {
    const html = readFileSync(resolve(import.meta.dirname, "../index.html"), "utf8");
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0" />');
  });
});

describe("LLR-FE-072 the Skip to content link is visible when it has focus", () => {
  it("sits off screen by default and is brought back by :focus", () => {
    expect(css).toMatch(/\.skip-link\s*{[^}]*top:\s*-\d/);
    expect(css).toMatch(/\.skip-link:focus\s*{[^}]*top:\s*var\(--gap\)/);
  });
});
