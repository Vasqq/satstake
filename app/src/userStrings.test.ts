import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { networks } from "./config/networks";

const SRC = import.meta.dirname;
// The words that would claim more than NS P7 allows. Wording and style are otherwise free (05 v1.27).
const BANNED_WORDS = ["trustless", "guaranteed", "unstoppable", "100% secure"];
// The sentences that name a banned word only to disclaim it (05 v1.28). Listed word for word, with the
// design's typographic apostrophe: a near copy is a different sentence and is refused.
const ALLOWED_DISCLAIMERS = ["SatStake doesn’t claim to be trustless."];

/**
 * Every string a source file can show a visitor: string literals, the pieces of template literals, and the
 * text between JSX tags. Comments are not user-facing and are not read.
 */
function userStrings(source: string, fileName = "file.tsx"): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      found.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

function problemsIn(text: string): string[] {
  const lower = ALLOWED_DISCLAIMERS.reduce((rest, sentence) => rest.split(sentence).join(" "), text).toLowerCase();
  return BANNED_WORDS.filter((word) => lower.includes(word));
}

/** Test files and test support hold the banned words on purpose, as examples to refuse, and show no one anything. */
function applicationSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : applicationSources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("LLR-FE-071 the scan refuses exactly what the requirement names", () => {
  it("lists the four banned words of the requirement, so the list cannot be shortened unseen", () => {
    expect(BANNED_WORDS).toEqual(["trustless", "guaranteed", "unstoppable", "100% secure"]);
  });
});

describe("LLR-FE-071 the scan allows a listed disclaimer and still refuses the claim", () => {
  it("lists exactly one disclaimer, so the allowance cannot grow unseen", () => {
    expect(ALLOWED_DISCLAIMERS).toEqual(["SatStake doesn’t claim to be trustless."]);
  });

  it("allows the disclaimer alone and inside a longer paragraph", () => {
    expect(problemsIn("SatStake doesn’t claim to be trustless.")).toEqual([]);
    expect(problemsIn("SatStake doesn’t claim to be trustless. The code holds the money, and two parties still matter.")).toEqual([]);
  });

  it("still refuses the bare claim, and the claim beside the disclaimer", () => {
    expect(problemsIn("SatStake is trustless.")).toEqual(["trustless"]);
    expect(problemsIn("SatStake doesn’t claim to be trustless. It is trustless.")).toEqual(["trustless"]);
    expect(problemsIn("Trustless by design. SatStake doesn’t claim to be trustless.")).toEqual(["trustless"]);
  });

  it("refuses a sentence that only resembles the disclaimer", () => {
    expect(problemsIn("SatStake doesn't claim to be trustless.")).toEqual(["trustless"]);
    expect(problemsIn("SatStake claims to be trustless.")).toEqual(["trustless"]);
    expect(problemsIn("SatStake doesn’t claim to be trustless")).toEqual(["trustless"]);
  });

  it("does not let the disclaimer excuse the other banned words", () => {
    expect(problemsIn("SatStake doesn’t claim to be trustless. Funds are guaranteed.")).toEqual(["guaranteed"]);
  });
});

describe("LLR-FE-071 the scan reads every kind of user-facing string", () => {
  it("reads string literals, template pieces, and JSX text, and skips comments", () => {
    const strings = userStrings(
      ['const a = "plain";', "const b = `head ${a} tail`;", "const c = <p>jsx text</p>;", "// comment words", "/* block words */"].join("\n"),
    );
    expect(strings).toEqual(expect.arrayContaining(["plain", "head ", " tail", "jsx text"]));
    expect(strings.join("|")).not.toContain("comment words");
    expect(strings.join("|")).not.toContain("block words");
  });

  it("reports each banned word whatever its case, and a clean string passes", () => {
    for (const word of BANNED_WORDS) {
      expect(userStrings(`const a = "It is ${word.toUpperCase()} now";`).flatMap(problemsIn), word).toEqual([word]);
    }
    expect(userStrings(`const a = "Deterministic, sub-second finality.";`).flatMap(problemsIn)).toEqual([]);
  });

  it("finds the application's sources, and not its tests", () => {
    const files = applicationSources(SRC).map((p) => relative(SRC, p));
    expect(files).toContain("App.tsx");
    expect(files).toContain(join("views", "HomeView.tsx"));
    expect(files).toContain(join("views", "AboutView.tsx"));
    expect(files).toContain(join("views", "MineView.tsx"));
    expect(files.some((f) => /\.test\./.test(f))).toBe(false);
    expect(files.some((f) => f.startsWith("test"))).toBe(false);
  });
});

/** The text of the page shell: its title and the content of its meta tags, which a search result or a link preview shows. */
function htmlStrings(html: string): string[] {
  const titles = [...html.matchAll(/<title[^>]*>([^<]*)<\/title>/gi)].map((m) => m[1] as string);
  const contents = [...html.matchAll(/<meta\b[^>]*\bcontent\s*=\s*"([^"]*)"/gi)].map((m) => m[1] as string);
  return [...titles, ...contents];
}

describe("LLR-FE-071 the scan also reads the page shell and the network names", () => {
  it("reads the title and the meta content of an HTML file", () => {
    const html = `<head><meta name="description" content="fully trustless" /><title>Guaranteed</title></head>`;
    expect(htmlStrings(html).flatMap(problemsIn)).toEqual(["guaranteed", "trustless"]);
  });

  it("holds for the title and meta content of app/index.html", () => {
    const html = readFileSync(join(SRC, "..", "index.html"), "utf8");
    expect(htmlStrings(html)).toContain("SatStake");
    expect(htmlStrings(html).flatMap(problemsIn)).toEqual([]);
  });

  it("scans the file that names each network, and the names it shows are clean", () => {
    expect(applicationSources(SRC).map((p) => relative(SRC, p))).toContain(join("config", "networks.ts"));
    const names = Object.values(networks).map((n) => n.name);
    expect(names).toEqual(["Arc Testnet", "Arc"]);
    expect(names.flatMap(problemsIn)).toEqual([]);
  });
});

describe("LLR-FE-071 LLR-VV-006 no user-facing string holds a banned word", () => {
  it("holds for every string in app/src", () => {
    const offences = applicationSources(SRC).flatMap((path) =>
      userStrings(readFileSync(path, "utf8"), path).flatMap((text) =>
        problemsIn(text).map((problem) => `${relative(SRC, path)}: ${problem} in ${JSON.stringify(text.slice(0, 60))}`),
      ),
    );
    expect(offences).toEqual([]);
  });
});
