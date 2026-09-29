// Tests for the structural coverage gate (LLR-VV-003): the summary it accepts, the
// summaries it must reject, and the CI job that runs it. The gate is exercised through
// its command line, so what is tested is what CI runs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE = join(ROOT, "tools/coverage-gate.mjs");

const gate = (summary) => spawnSync(process.execPath, [GATE], { input: summary, encoding: "utf8" });

// A summary in the shape `forge coverage --report summary` prints, with the four measures of
// src/SatStake.sol given by the caller. The other rows are the test files, which forge also
// reports and which the gate must ignore.
function summary({ lines = "100.00% (115/115)", statements = "100.00% (147/147)", branches = "100.00% (30/30)", functions = "100.00% (15/15)", target = "src/SatStake.sol" } = {}) {
  return [
    "╭--------------------------------+-------------------+-------------------+-----------------+-----------------╮",
    "| File                           | % Lines           | % Statements      | % Branches      | % Funcs         |",
    "+=============================================================================================================+",
    `| ${target}               | ${lines} | ${statements} | ${branches} | ${functions} |`,
    "|--------------------------------+-------------------+-------------------+-----------------+-----------------|",
    "| test/base/SatStakeTestBase.sol | 98.85% (86/87)    | 99.04% (103/104)  | 100.00% (1/1)   | 100.00% (16/16) |",
    "|--------------------------------+-------------------+-------------------+-----------------+-----------------|",
    "| Total                          | 99.66% (296/297)  | 99.70% (329/330)  | 100.00% (44/44) | 100.00% (59/59) |",
    "╰--------------------------------+-------------------+-------------------+-----------------+-----------------╯",
    "",
  ].join("\n");
}

describe("LLR-VV-003 coverage gate", () => {
  it("passes when the contract is at 100% on all four measures", () => {
    const r = gate(summary());
    assert.equal(r.status, 0, `the gate rejected a fully covered contract\n${r.stderr}`);
    assert.match(r.stdout, /coverage-gate: OK/);
  });

  it("passes although the test files are below 100%", () => {
    // The requirement is about src/SatStake.sol. A gate that read the Total row would fail
    // on the helper files, which no requirement covers.
    assert.equal(gate(summary()).status, 0);
  });

  for (const measure of ["lines", "statements", "branches", "functions"]) {
    it(`fails when ${measure} is 99%`, () => {
      const r = gate(summary({ [measure]: "99.00% (99/100)" }));
      assert.notEqual(r.status, 0, `the gate accepted ${measure} at 99%`);
      assert.match(r.stderr, new RegExp(`${measure} is 99`), r.stderr);
    });

    it(`fails when ${measure} is one hundredth short`, () => {
      const r = gate(summary({ [measure]: "99.99% (9999/10000)" }));
      assert.notEqual(r.status, 0, `the gate accepted ${measure} at 99.99%`);
    });
  }

  it("fails when the contract has no row at all", () => {
    // What a renamed or moved contract produces. Reporting that as a pass would claim full
    // coverage of a file nothing measured.
    const r = gate(summary({ target: "src/Renamed.sol" }));
    assert.notEqual(r.status, 0, "the gate accepted a summary with no row for the contract");
    assert.match(r.stderr, /src\/SatStake\.sol has no row/);
  });

  it("fails when the output is not a coverage summary", () => {
    const r = gate("Error: failed to run coverage\n");
    assert.notEqual(r.status, 0, "the gate accepted output that is not a summary");
    assert.match(r.stderr, /no coverage table/);
  });

  it("fails when a measure is missing from the table", () => {
    const withoutBranches = summary()
      .split("\n")
      .map((line) => line.replace(" % Branches      |", "").replace(" 100.00% (30/30) |", "").replace(" 100.00% (44/44) |", ""))
      .join("\n");
    const r = gate(withoutBranches);
    assert.notEqual(r.status, 0, "the gate accepted a table with no branch column");
    assert.match(r.stderr, /no "% branches" column/);
  });

  describe("CI runs the gate", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const jobs = ci.split(/\n  (?=[a-z][\w-]*:\n)/);
    const contracts = jobs.find((block) => /\bforge test\b/.test(block));

    it("has a job that runs forge test", () => {
      assert.ok(contracts, "no CI job runs `forge test`");
    });

    it("runs forge coverage and feeds it to the gate in that job", () => {
      assert.match(contracts, /forge coverage[^\n]*--report summary/, "the job does not run forge coverage");
      assert.match(contracts, /tools\/coverage-gate\.mjs/, "the job does not run the coverage gate");
    });

    it("cannot pass the gate by hiding a coverage failure", () => {
      assert.doesNotMatch(contracts, /continue-on-error:\s*true/, "the job cannot fail the build");
      assert.doesNotMatch(contracts, /coverage-gate\.mjs[^\n]*\|\|/, "the gate's exit code is discarded");
    });

    it("runs the gate unconditionally", () => {
      // A condition on this step is another way to pass it: a repository with no test files has no
      // coverage at all, which is the failure the gate exists to catch, so it must still run.
      const steps = contracts.split(/\n      - (?=name:|uses:)/);
      const gateStep = steps.find((step) => /coverage-gate\.mjs/.test(step));
      assert.ok(gateStep, "no step runs the coverage gate");
      assert.doesNotMatch(gateStep, /\bif:/, "the coverage gate step can be skipped by its own condition");
    });
  });
});
