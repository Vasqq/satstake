// LLR-SB-005 (methods I and T): the repository at submission holds no to-do or fix-me markers, no
// console.log in source, and no unused dependency. The scanners are plain functions over
// { path, text } records so that each is shown to fire on a fixture before it is trusted on the
// repository. Marker words are assembled at runtime so this file does not trip its own scan.
//
// Not covered here: commented-out code. A scan cannot tell code in a comment from prose or an
// example, so that half of the requirement stays with the inspection recorded in docs/INSPECTIONS.md.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { builtinModules } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const MARKER_WORDS = ["TO" + "DO", "FIX" + "ME"];
const MARKER_RE = new RegExp(`\\b(?:${MARKER_WORDS.join("|")})\\b`, "i");
const CONSOLE_LOG = "console" + ".log";

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".pdf"]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// Third-party and generated text is not the author's to clean. The specification documents define the
// requirement and so name the markers they forbid; they are the law and are not edited by this check.
const EXCLUDED = (path) => path.startsWith("lib/") || /(^|\/)package-lock\.json$/.test(path) || /^docs\/0\d_.*\.md$/.test(path);

// The browser bundle is the one place a stray log reaches a visitor. Solidity sources and scripts must
// not import Foundry's console either. The Node programs in tools/, e2e/, script/ and app/scripts/ are
// command-line tools whose standard output is their interface, so a log there is not debug residue.
const SHIPPED = (path) => path.startsWith("app/src/") || path.startsWith("src/") || /^script\/.*\.sol$/.test(path);

/** Lines holding a marker word, as "path:line". */
export function findMarkers(files) {
  const hits = [];
  for (const { path, text } of files) {
    if (EXCLUDED(path)) continue;
    text.split("\n").forEach((line, i) => {
      if (MARKER_RE.test(line)) hits.push(`${path}:${i + 1}`);
    });
  }
  return hits;
}

/** Lines in shipped source that log to the console or import Foundry's console library. */
export function findConsoleLogs(files) {
  const hits = [];
  const solidity = /\bconsole2?\.log\w*\s*\(|forge-std\/console2?\.sol/;
  for (const { path, text } of files) {
    if (EXCLUDED(path) || !SHIPPED(path)) continue;
    // Any use, not only a call: `p.catch(console.log)` and `const { log } = console` log as surely.
    const re = path.endsWith(".sol") ? solidity : new RegExp(`\\b${CONSOLE_LOG.replace(".", "\\.")}\\b|\\{[^}]*\\blog\\b[^}]*\\}\\s*=\\s*console\\b`);
    text.split("\n").forEach((line, i) => {
      if (re.test(line)) hits.push(`${path}:${i + 1}`);
    });
  }
  return hits;
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)["']([^"']+)["']/g;

function packageOf(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) return null;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return builtinModules.includes(name) ? null : name;
}

/**
 * Dependencies of one package.json that nothing in its directory imports. Tools that are run rather
 * than imported are used when the script or config that runs them says so.
 * `dir` is "" for the root package and "app" for the application; files outside it do not count,
 * and the application's directory does not count for the root package.
 */
export function unusedDependencies(manifest, dir, files) {
  const inScope = files.filter(({ path }) => {
    if (path.startsWith("lib/") || !CODE_EXT.has(extname(path))) return false;
    return dir === "" ? !path.startsWith("app/") : path.startsWith(`${dir}/`);
  });
  const imported = new Set();
  let importsNodeBuiltin = false;
  for (const { text } of inScope) {
    for (const m of text.matchAll(IMPORT_RE)) {
      if (m[1].startsWith("node:")) importsNodeBuiltin = true;
      const name = packageOf(m[1]);
      if (name) imported.add(name);
    }
  }
  const scripts = Object.values(manifest.scripts ?? {}).join("\n");
  const configText = (name) => files.find((f) => f.path === (dir ? `${dir}/${name}` : name))?.text ?? "";
  const runBy = {
    typescript: /\btsc\b/.test(scripts),
    eslint: /\beslint\b/.test(scripts),
    vite: /\bvite\b/.test(scripts),
    jsdom: /["']jsdom["']/.test(configText("vitest.config.ts")),
    "@types/node": importsNodeBuiltin,
  };

  const used = (name) => {
    if (imported.has(name) || runBy[name]) return true;
    const types = name.match(/^@types\/(.+)$/);
    return types !== null && imported.has(types[1]);
  };
  const declared = [...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})];
  return declared.filter((name) => !used(name));
}

function trackedFiles() {
  const names = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
  return names
    .filter((path) => !BINARY_EXT.has(extname(path).toLowerCase()))
    .filter((path) => existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).isFile())
    .map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));
}

// Spelled out again, so a change to the words the scan looks for cannot also change what the fixtures use.
const MARKER = "TO" + "DO";
const SECOND_MARKER = "FIX" + "ME";

describe("LLR-SB-005 the repository scans read the repository", () => {
  it("reads the contract, the application, the scripts, and the documents, each with its text", () => {
    const files = new Map(trackedFiles().map(({ path, text }) => [path, text]));
    for (const path of ["docs/README.md", "docs/ACCEPTANCE.md", "src/SatStake.sol", "script/Deploy.s.sol", "app/src/format.ts", "app/src/App.tsx"]) {
      assert.ok((files.get(path) ?? "").length > 0, `${path} was not read`);
    }
  });
});

describe("LLR-SB-005 the marker scan", () => {
  it("flags both marker words, in any file type, with its location", () => {
    const files = [
      { path: "src/A.sol", text: `// ok\n// ${MARKER}: later\n` },
      { path: "README.md", text: `${SECOND_MARKER} this\n` },
      { path: "app/src/a.ts", text: `const x = 1; // ${MARKER}\n` },
    ];
    assert.deepEqual(findMarkers(files), ["src/A.sol:2", "README.md:1", "app/src/a.ts:1"]);
  });

  it("flags a marker word in any case (05 v1.25)", () => {
    const files = [{ path: "app/src/a.ts", text: `// ${MARKER.toLowerCase()}: later\n// ${SECOND_MARKER[0]}${SECOND_MARKER.slice(1).toLowerCase()} this\n` }];
    assert.deepEqual(findMarkers(files), ["app/src/a.ts:1", "app/src/a.ts:2"]);
  });

  it("ignores a word that merely contains a marker and hyphenated prose", () => {
    const files = [{ path: "docs/a.md", text: `${MARKER}S and A${SECOND_MARKER} and the to-do list\n` }];
    assert.deepEqual(findMarkers(files), []);
  });

  it("skips submodules, lockfiles, and the specification documents, and nothing else", () => {
    const text = `${MARKER}\n`;
    const files = [
      { path: "lib/forge-std/a.sol", text },
      { path: "package-lock.json", text },
      { path: "app/package-lock.json", text },
      { path: "docs/05_LLR.md", text },
      { path: "docs/evidence/tdd-log.md", text },
      { path: "docs/WALKTHROUGH.md", text },
    ];
    assert.deepEqual(findMarkers(files), ["docs/evidence/tdd-log.md:1", "docs/WALKTHROUGH.md:1"]);
  });

  it("finds none in the tracked files", () => {
    assert.deepEqual(findMarkers(trackedFiles()), []);
  });
});

describe("LLR-SB-005 the console scan", () => {
  it("flags a log in the browser bundle, including a test file there", () => {
    const files = [
      { path: "app/src/a.ts", text: `${CONSOLE_LOG}("x");\n` },
      { path: "app/src/a.test.ts", text: `  ${CONSOLE_LOG} ("x");\n` },
    ];
    assert.deepEqual(findConsoleLogs(files), ["app/src/a.ts:1", "app/src/a.test.ts:1"]);
  });

  it("flags Foundry's console in contract source and scripts, in both library spellings", () => {
    const files = [
      { path: "src/A.sol", text: `import {console} from "forge-std/console.sol";\n` },
      { path: "script/D.s.sol", text: `console2.log("x");\n` },
      { path: "script/E.s.sol", text: `console.log("x");\n` },
    ];
    assert.deepEqual(findConsoleLogs(files), ["src/A.sol:1", "script/D.s.sol:1", "script/E.s.sol:1"]);
  });

  it("leaves command-line tools alone, because their output is their interface", () => {
    const files = [
      { path: "tools/a.mjs", text: `${CONSOLE_LOG}("ok");\n` },
      { path: "e2e/run.mjs", text: `${CONSOLE_LOG}("ok");\n` },
      { path: "script/seed.mjs", text: `${CONSOLE_LOG}("ok");\n` },
      { path: "app/scripts/x.mjs", text: `${CONSOLE_LOG}("ok");\n` },
    ];
    assert.deepEqual(findConsoleLogs(files), []);
  });

  it("flags a log passed as a value or taken apart from console", () => {
    const files = [
      { path: "app/src/a.ts", text: `p.catch(${CONSOLE_LOG});\n` },
      { path: "app/src/b.ts", text: `const { log } = console;\n` },
    ];
    assert.deepEqual(findConsoleLogs(files), ["app/src/a.ts:1", "app/src/b.ts:1"]);
  });

  it("does not flag other console methods or a mention in a word", () => {
    const files = [{ path: "app/src/a.ts", text: `console.error("x");\nconst myconsole = 1; myconsole.log;\n` }];
    assert.deepEqual(findConsoleLogs(files), []);
  });

  it("finds none in the tracked files", () => {
    assert.deepEqual(findConsoleLogs(trackedFiles()), []);
  });
});

describe("LLR-SB-005 the unused-dependency scan", () => {
  const manifest = (extra = {}) => ({
    scripts: { build: "vite build", test: "vitest run" },
    dependencies: { react: "1.0.0", "@scope/pkg": "1.0.0" },
    devDependencies: { vitest: "1.0.0" },
    ...extra,
  });
  const app = (text, path = "app/src/a.ts") => ({ path, text });

  it("reports a dependency that no file imports", () => {
    const files = [app(`import { x } from "react";\n`), app(`import { t } from "vitest";\n`, "app/src/a.test.ts")];
    assert.deepEqual(unusedDependencies(manifest(), "app", files), ["@scope/pkg"]);
  });

  it("counts a subpath import, a scoped import, a side-effect import, a dynamic import, and a require", () => {
    const files = [
      app(`import a from "react/jsx-runtime";\nimport "vitest";\n`),
      app(`const m = await import("@scope/pkg/deep");\n`, "app/src/b.ts"),
    ];
    assert.deepEqual(unusedDependencies(manifest(), "app", files), []);
    assert.deepEqual(
      unusedDependencies(manifest(), "app", [app(`const a = require("react");\nrequire("vitest");\nrequire("@scope/pkg");\n`, "app/src/c.cjs")]),
      [],
    );
  });

  it("does not count an import in another package, or a relative path or Node builtin of the same name", () => {
    const files = [
      { path: "e2e/run.mjs", text: `import "react";\nimport "@scope/pkg";\nimport "vitest";\n` },
      app(`import "./react";\nimport "node:fs";\n`),
    ];
    assert.deepEqual(unusedDependencies(manifest(), "app", files), ["react", "@scope/pkg", "vitest"]);
  });

  it("scans the root package over everything outside app/", () => {
    const files = [{ path: "tools/a.mjs", text: `import { x } from "viem";\n` }, app(`import "left-pad";\n`)];
    const root = { dependencies: { viem: "1.0.0", "left-pad": "1.0.0" } };
    assert.deepEqual(unusedDependencies(root, "", files), ["left-pad"]);
  });

  it("counts a tool the scripts run, but only the tool the scripts name", () => {
    const m = manifest({ devDependencies: { typescript: "1", eslint: "1", vite: "1", vitest: "1", "typescript-eslint": "1" }, scripts: { lint: "eslint ." } });
    const files = [app(`import "react";\nimport "@scope/pkg";\nimport "vitest";\n`)];
    assert.deepEqual(unusedDependencies(m, "app", files), ["typescript", "vite", "typescript-eslint"]);
    const named = { ...m, scripts: { check: "tsc --noEmit", build: "vite build" } };
    assert.deepEqual(unusedDependencies(named, "app", files), ["eslint", "typescript-eslint"]);
  });

  it("counts jsdom only when the test configuration names it", () => {
    const m = manifest({ dependencies: {}, devDependencies: { jsdom: "1" } });
    assert.deepEqual(unusedDependencies(m, "app", []), ["jsdom"]);
    assert.deepEqual(unusedDependencies(m, "app", [{ path: "app/vitest.config.ts", text: `environment: "jsdom"\n` }]), []);
  });

  it("counts a types package when its subject is imported or, for Node, when a builtin is", () => {
    const m = manifest({ dependencies: {}, devDependencies: { "@types/react": "1", "@types/node": "1", "@types/left-pad": "1" } });
    assert.deepEqual(unusedDependencies(m, "app", []), ["@types/react", "@types/node", "@types/left-pad"]);
    const files = [app(`import "react";\nimport "node:fs";\n`)];
    assert.deepEqual(unusedDependencies(m, "app", files), ["@types/left-pad"]);
  });

  it("finds none in app/package.json", () => {
    const manifestOf = JSON.parse(readFileSync(join(ROOT, "app/package.json"), "utf8"));
    assert.deepEqual(unusedDependencies(manifestOf, "app", trackedFiles()), []);
  });

  it("finds none in the root package.json", () => {
    const manifestOf = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    assert.deepEqual(unusedDependencies(manifestOf, "", trackedFiles()), []);
  });
});
