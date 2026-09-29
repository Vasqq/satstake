#!/usr/bin/env node
/**
 * Structural coverage gate for SatStake (06_VERIFICATION_PLAN.md section 6).
 * Reads the text of `forge coverage --report summary` and fails unless the row for
 * src/SatStake.sol is 100% on lines, statements, branches, and functions.
 *
 * A missing row fails too. That is the case a renamed or moved contract would produce,
 * and treating it as a pass would report full coverage of a file nothing measured.
 *
 * Usage: node tools/coverage-gate.mjs [summary-file]   (reads stdin when no file is given)
 *
 * @trace LLR-VV-003
 */
import { readFileSync } from "node:fs";

const TARGET = "src/SatStake.sol";
const REQUIRED = 100;
// Column headings forge prints, by the name each measure has in the requirement.
const MEASURES = {
  lines: "% lines",
  statements: "% statements",
  branches: "% branches",
  functions: "% funcs",
};

const cells = (line) => line.split("|").slice(1, -1).map((c) => c.trim());

/** Reasons the summary fails the gate; empty means it passes. */
function checkSummary(text) {
  const failures = [];
  const rows = text
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map(cells);

  const header = rows.find((row) => (row[0] ?? "").toLowerCase() === "file");
  if (!header) return ["the summary has no coverage table (no File column heading)"];

  const columns = {};
  for (const [measure, heading] of Object.entries(MEASURES)) {
    const index = header.findIndex((cell) => cell.toLowerCase() === heading);
    if (index < 0) failures.push(`the summary has no "${heading}" column`);
    else columns[measure] = index;
  }
  if (failures.length > 0) return failures;

  const row = rows.find((cells_) => cells_[0] === TARGET);
  if (!row) return [`${TARGET} has no row in the coverage summary`];

  for (const [measure, index] of Object.entries(columns)) {
    const percentage = /^([\d.]+)%/.exec(row[index] ?? "");
    if (!percentage) {
      failures.push(`${TARGET}: ${measure} is not a percentage: "${row[index] ?? ""}"`);
      continue;
    }
    if (Number(percentage[1]) < REQUIRED) {
      failures.push(`${TARGET}: ${measure} is ${percentage[1]}%, not ${REQUIRED}%`);
    }
  }
  return failures;
}

const failures = checkSummary(readFileSync(process.argv[2] ?? 0, "utf8"));
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\ncoverage-gate: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log(`coverage-gate: OK. ${TARGET} is at ${REQUIRED}% on lines, statements, branches, and functions.`);
