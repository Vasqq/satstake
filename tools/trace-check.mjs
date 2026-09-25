#!/usr/bin/env node
/**
 * Traceability checker for SatStake (06_VERIFICATION_PLAN.md section 3).
 * Parses the requirement tables, scans code and tests for requirement IDs, and
 * fails on any broken link. On success it regenerates docs/TRACE_MATRIX.md.
 *
 * Usage: node tools/trace-check.mjs [--release] [--root <dir>]
 *
 * @trace LLR-VV-002 LLR-VV-009
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const release = args.includes("--release");
const rootArg = args.indexOf("--root");
const root = rootArg >= 0 ? args[rootArg + 1] : join(dirname(fileURLToPath(import.meta.url)), "..");

const LLR_RE = /\bLLR-[A-Z]{2}-\d{3}\b/g;
const HLR_RE = /\bHLR-\d{3}\b/g;
// Deliberately looser than the real ID formats, so a malformed tag such as a wrong
// digit count is reported as unknown (condition 6) instead of being silently skipped.
const ID_SHAPE_RE = /\b(?:LLR-[A-Z]+-\d+|HLR-\d+|UJ-\d+)\b/g;

// Scopes whose LLRs must be implemented somewhere in code or build configuration (condition 4).
const IMPLEMENTED_SCOPES = new Set(["SC", "FE", "DP"]);
const SCAN_DIRS = ["src", "test", "app/src", "script", "e2e", "tools", ".github/workflows"];
// Git hooks have no file extension, so every file in these directories is scanned.
const SCAN_ALL_FILES_DIRS = [".githooks"];
const SCAN_FILES = [
  "foundry.toml",
  ".gitignore",
  "app/eslint.config.js",
  "app/eslint.config.mjs",
  "app/eslint.config.ts",
];
const SCAN_EXT = /\.(sol|ts|tsx|js|jsx|mjs|cjs|toml|ya?ml)$/;
// Foundry's top-level lib/ is never walked because it is not in SCAN_DIRS; a nested
// lib such as app/src/lib is project code and must be scanned.
const SKIP_ANYWHERE = new Set(["node_modules", "out", "cache", "dist", "broadcast", "coverage", ".git"]);

const failures = [];
const fail = (id, reason) => failures.push(`${id}: ${reason}`);

const read = (rel) => readFileSync(join(root, rel), "utf8");

function tableRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()));
}

// Rows whose first cell matches firstColumnRe, keyed by the lower-case names of the header row above them.
function tableObjects(text, firstColumnRe) {
  const out = [];
  let header = null;
  for (const cells of tableRows(text)) {
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (!firstColumnRe.test(cells[0])) {
      header = cells.map((c) => c.toLowerCase());
      continue;
    }
    const row = { first: cells[0] };
    if (header) header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    out.push(row);
  }
  return out;
}

// In a child list, a bare three-digit number inherits the scope of the last full ID before
// it, so "SC-010, 011; FE-033" (each written with the LLR prefix in 04) names three LLRs.
function expandChildren(cell) {
  const ids = [];
  let scope = null;
  for (const m of cell.matchAll(/LLR-([A-Z]{2})-(\d{3})|\b(\d{3})\b/g)) {
    if (m[1]) {
      scope = m[1];
      ids.push(`LLR-${m[1]}-${m[2]}`);
    } else if (scope) {
      ids.push(`LLR-${scope}-${m[3]}`);
    }
  }
  return ids;
}

function parseHlrs() {
  const hlrs = new Map();
  for (const cells of tableRows(read("docs/04_HLR.md"))) {
    if (!/^HLR-\d{3}$/.test(cells[0])) continue;
    hlrs.set(cells[0], { children: expandChildren(cells[4] ?? "") });
  }
  return hlrs;
}

function parseLlrs() {
  const llrs = new Map();
  for (const cells of tableRows(read("docs/05_LLR.md"))) {
    if (!/^LLR-[A-Z]{2}-\d{3}$/.test(cells[0])) continue;
    llrs.set(cells[0], {
      scope: cells[0].slice(4, 6),
      parents: [...(cells[2] ?? "").matchAll(HLR_RE)].map((m) => m[0]),
      methods: new Set((cells[3] ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
    });
  }
  return llrs;
}

function parseJourneys() {
  return [...read("docs/03_USER_JOURNEYS.md").matchAll(/\*\*(UJ-\d{2})\b/g)].map((m) => m[1]);
}

function parseAcceptance() {
  const rows = new Map();
  if (!existsSync(join(root, "docs/ACCEPTANCE.md"))) return rows;
  for (const r of tableObjects(read("docs/ACCEPTANCE.md"), /^UJ-\d{2}$/)) {
    rows.set(r.first, { result: r.result ?? "", verification: r.verification ?? "" });
  }
  return rows;
}

function walk(relDir, out, allFiles = false) {
  if (!existsSync(join(root, relDir))) return;
  for (const name of readdirSync(join(root, relDir))) {
    const rel = `${relDir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) {
      if (!SKIP_ANYWHERE.has(name)) walk(rel, out, allFiles);
    } else if (allFiles || SCAN_EXT.test(name)) {
      out.push(rel);
    }
  }
}

const isTestFile = (rel) =>
  /^(test|e2e)\//.test(rel) ||
  /\/(test|__tests__)\//.test(rel) ||
  /\.t\.sol$/.test(rel) ||
  /\.(test|spec)\.[a-z0-9]+$/i.test(rel);

// Returns id -> [{ file, line }] for source and test references separately.
function scanCode() {
  const files = [];
  for (const d of SCAN_DIRS) walk(d, files);
  for (const d of SCAN_ALL_FILES_DIRS) walk(d, files, true);
  for (const f of SCAN_FILES) if (existsSync(join(root, f))) files.push(f);
  const source = new Map();
  const tests = new Map();
  const mentions = [];
  for (const rel of files) {
    const target = isTestFile(rel) ? tests : source;
    read(rel)
      .split("\n")
      .forEach((text, i) => {
        for (const m of text.matchAll(ID_SHAPE_RE)) {
          const ref = { file: rel, line: i + 1 };
          mentions.push({ id: m[0], ...ref });
          if (!target.has(m[0])) target.set(m[0], []);
          target.get(m[0]).push(ref);
        }
      });
  }
  return { source, tests, mentions };
}

// All LLRs named in the first column of docs/INSPECTIONS.md, and those with a passing row.
function parseInspections() {
  const mentioned = new Set();
  const passed = new Set();
  if (!existsSync(join(root, "docs/INSPECTIONS.md"))) return { mentioned, passed };
  for (const r of tableObjects(read("docs/INSPECTIONS.md"), /LLR-[A-Z]{2}-\d{3}/)) {
    for (const m of r.first.matchAll(LLR_RE)) {
      mentioned.add(m[0]);
      if ((r.result ?? "").toLowerCase() === "pass") passed.add(m[0]);
    }
  }
  return { mentioned, passed };
}

function parseEvidence() {
  const files = [];
  walk("docs/evidence", files, true);
  const ids = new Map();
  // The test-first log records test runs, not demonstrations, so it never counts as D evidence.
  for (const rel of files.filter((f) => /\.(md|json)$/.test(f) && !f.endsWith("/tdd-log.md"))) {
    for (const m of read(rel).matchAll(LLR_RE)) {
      if (!ids.has(m[0])) ids.set(m[0], new Set());
      ids.get(m[0]).add(rel);
    }
  }
  return ids;
}

const hlrs = parseHlrs();
const llrs = parseLlrs();
const journeys = parseJourneys();
const acceptance = parseAcceptance();
const { source, tests, mentions } = scanCode();
const inspections = parseInspections();
const evidence = parseEvidence();

// Condition 1: every HLR has children, and every child exists.
for (const [id, h] of hlrs) {
  if (h.children.length === 0) fail(id, "lists no child LLR");
  for (const c of h.children) if (!llrs.has(c)) fail(id, `lists child ${c}, which does not exist`);
}

// Condition 2: every LLR has a parent, and every parent lists it back (and vice versa).
for (const [id, l] of llrs) {
  if (l.parents.length === 0) fail(id, "lists no parent HLR");
  for (const p of l.parents) {
    if (!hlrs.has(p)) fail(id, `lists parent ${p}, which does not exist`);
    else if (!hlrs.get(p).children.includes(id)) fail(id, `lists parent ${p}, which does not list it back`);
  }
}
for (const [id, h] of hlrs) {
  for (const c of h.children) {
    if (llrs.has(c) && !llrs.get(c).parents.includes(id)) fail(c, `is listed by ${id} but does not name it as a parent`);
  }
}

// Conditions 3 and 4 apply once any scanned file references an LLR, and to all LLRs at release.
for (const [id, l] of llrs) {
  const referenced = source.has(id) || tests.has(id) || inspections.mentioned.has(id) || evidence.has(id);
  if (!referenced && !release) continue;
  if (l.methods.has("T") && !tests.has(id)) fail(id, "has method T but no test carries its ID");
  if (IMPLEMENTED_SCOPES.has(l.scope) && !source.has(id)) fail(id, "has no source reference in code or build configuration");
}

// Condition 5: inspection and demonstration records at the release gate.
if (release) {
  for (const [id, l] of llrs) {
    if ((l.methods.has("I") || l.methods.has("A")) && !inspections.passed.has(id)) {
      fail(id, "has method I or A but no docs/INSPECTIONS.md row with result Pass");
    }
    if (l.methods.has("D") && !evidence.has(id)) fail(id, "has method D but no entry in docs/evidence/");
  }
}

// Condition 6: every ID-shaped name in code or tests exists.
const known = new Set([...llrs.keys(), ...hlrs.keys(), ...journeys]);
for (const m of mentions) if (!known.has(m.id)) fail(m.id, `named at ${m.file}:${m.line} but does not exist`);

// Condition 7: every journey is in ACCEPTANCE.md and, at release, passes or awaits only the walkthrough.
const hasWalkthrough = (row) => /\bWT\b|walkthrough/i.test(row.verification);
for (const j of journeys) {
  const row = acceptance.get(j);
  if (!row) {
    fail(j, "is missing from docs/ACCEPTANCE.md");
    continue;
  }
  const result = row.result.toLowerCase();
  const ok = result === "pass" || (result === "awaiting walkthrough" && hasWalkthrough(row));
  if (release && !ok) fail(j, `has result "${row.result}" instead of Pass`);
}

if (failures.length > 0) {
  for (const f of [...new Set(failures)].sort()) console.error(`FAIL ${f}`);
  console.error(`\ntrace-check: ${new Set(failures).size} failure(s)${release ? " (release gate)" : ""}`);
  process.exit(1);
}

const refs = (list) => (list ?? []).map((r) => `${r.file}:${r.line}`).join("<br>");
const rows = [...llrs.keys()].sort().map((id) => {
  const l = llrs.get(id);
  const records = [
    ...(inspections.mentioned.has(id) ? ["docs/INSPECTIONS.md"] : []),
    ...[...(evidence.get(id) ?? [])].sort(),
  ].join("<br>");
  return `| ${id} | ${l.parents.join(", ")} | ${[...l.methods].join(", ")} | ${refs(source.get(id))} | ${refs(tests.get(id))} | ${records} |`;
});
const referencedCount = [...llrs.keys()].filter((id) => source.has(id) || tests.has(id)).length;
const passing = journeys.filter((j) => (acceptance.get(j)?.result ?? "").toLowerCase() === "pass").length;

writeFileSync(
  join(root, "docs/TRACE_MATRIX.md"),
  [
    "# Traceability matrix",
    "",
    "Generated by `node tools/trace-check.mjs`. Do not edit by hand.",
    "",
    `- ${hlrs.size} HLRs, ${llrs.size} LLRs, ${journeys.length} journeys.`,
    `- ${referencedCount} of ${llrs.size} LLRs referenced by code or tests.`,
    `- ${passing} of ${journeys.length} journeys passing in docs/ACCEPTANCE.md.`,
    "",
    "| LLR | Parents | Method | Implementation | Tests | Inspection and evidence |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n"),
);
console.log(
  `trace-check: OK${release ? " (release gate)" : ""}. ${referencedCount}/${llrs.size} LLRs referenced, ${passing}/${journeys.length} journeys passing.`,
);
