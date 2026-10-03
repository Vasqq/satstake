import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = import.meta.dirname;
const EM_DASH = String.fromCharCode(0x2014);
const BANNED_WORDS = ["trustless", "guaranteed", "unstoppable", "seamless", "revolutionary", "100% secure"];

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
  const lower = text.toLowerCase();
  const problems = BANNED_WORDS.filter((word) => lower.includes(word));
  if (text.includes(EM_DASH)) problems.push("U+2014");
  return problems;
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
  it("lists the six banned words of the requirement, so the list cannot be shortened unseen", () => {
    expect(BANNED_WORDS).toEqual(["trustless", "guaranteed", "unstoppable", "seamless", "revolutionary", "100% secure"]);
    expect(EM_DASH).toBe("\u2014");
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

  it("reports the em dash in a literal, a template, and JSX text", () => {
    for (const source of [`const a = "one ${EM_DASH} two";`, `const a = \`x ${EM_DASH} \${1}\`;`, `const a = <p>one ${EM_DASH} two</p>;`]) {
      expect(userStrings(source).flatMap(problemsIn), source).toEqual(["U+2014"]);
    }
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

describe("LLR-FE-071 no user-facing string holds U+2014 or a banned word", () => {
  it("holds for every string in app/src", () => {
    const offences = applicationSources(SRC).flatMap((path) =>
      userStrings(readFileSync(path, "utf8"), path).flatMap((text) =>
        problemsIn(text).map((problem) => `${relative(SRC, path)}: ${problem} in ${JSON.stringify(text.slice(0, 60))}`),
      ),
    );
    expect(offences).toEqual([]);
  });
});
