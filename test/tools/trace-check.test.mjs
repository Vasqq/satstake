// Tests for tools/trace-check.mjs. Each test builds a small fixture repository,
// breaks exactly one traceability rule, and expects the checker to fail with the
// reason for that rule. Fixture IDs are assembled at runtime so that the real
// checker, which scans this file, does not mistake them for real requirements.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHECKER = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "tools", "trace-check.mjs");

const pad = (n, w) => String(n).padStart(w, "0");
const L = (scope, n, w = 3) => ["LLR", scope, pad(n, w)].join("-");
const H = (n, w = 3) => ["HLR", pad(n, w)].join("-");
const U = (n) => ["UJ", pad(n, 2)].join("-");

const SC1 = L("SC", 1); // method T, implemented in src
const SC2 = L("SC", 2); // method I, implemented in src
const SC3 = L("SC", 3); // build setting, tagged in foundry.toml
const SC4 = L("SC", 4); // methods T and I
const SC5 = L("SC", 5); // method A
const FE1 = L("FE", 1); // method T, implemented in app/src
const VV1 = L("VV", 1); // process requirement, tested only
const DP1 = L("DP", 1); // method D, implemented in script

const INSPECTION_SC2 = `| ${SC2} | 2026-09-24 | src/A.sol | Pass | none |`;
const ACCEPT_U2 = `| ${U(2)} | Operator | Deployed | Evid | Pass | 2026-09-24 |`;

function baseline() {
  return {
    "docs/03_USER_JOURNEYS.md": [
      "# Journeys",
      "",
      `**${U(1)} Visitor arrives.** Trigger: opens the site. ${H(1)}.`,
      `**${U(2)} Operator deploys.** Outcome: deployed. ${H(2)}.`,
      "",
    ].join("\n"),
    "docs/04_HLR.md": [
      "# HLR",
      "",
      "| ID | Requirement | Source | Method | Children |",
      "|---|---|---|---|---|",
      `| ${H(1)} | The contract shall work. | NS 1 | T | ${SC1}, 002, 003, 004, 005; ${FE1} |`,
      `| ${H(2)} | The process shall be traced. | NS 11 | T | ${VV1}; ${DP1} |`,
      "",
    ].join("\n"),
    "docs/05_LLR.md": [
      "# LLR",
      "",
      "| ID | Requirement | Parents | Method | Derived |",
      "|---|---|---|---|---|",
      `| ${SC1} | The contract shall do one thing. | ${H(1)} | T | No |`,
      `| ${SC2} | The contract shall contain no admin. | ${H(1)} | I | No |`,
      `| ${SC3} | The build shall pin the compiler. | ${H(1)} | I | No |`,
      `| ${SC4} | The contract shall guard reentry. | ${H(1)} | T, I | No |`,
      `| ${SC5} | The contract shall pass analysis. | ${H(1)} | A | No |`,
      `| ${FE1} | The app shall parse amounts. | ${H(1)} | T | No |`,
      `| ${VV1} | The checker shall run. | ${H(2)} | T | No |`,
      `| ${DP1} | The script shall deploy. | ${H(2)} | D | No |`,
      "",
      "| Error | Message |",
      "|---|---|",
      "| ZeroAmount | Enter an amount above zero. |",
      "",
    ].join("\n"),
    "docs/ACCEPTANCE.md": [
      "# Acceptance",
      "",
      "| Journey | Actor | Expected outcome | Verification | Result | Date |",
      "|---|---|---|---|---|---|",
      `| ${U(1)} | Visitor | Understands | FE; WT | Pass | 2026-09-24 |`,
      ACCEPT_U2,
      "",
    ].join("\n"),
    "docs/INSPECTIONS.md": [
      "# Inspections",
      "",
      "| LLR | Date | Examined | Result | Evidence |",
      "|---|---|---|---|---|",
      INSPECTION_SC2,
      `| ${SC3} | 2026-09-24 | foundry.toml | Pass | none |`,
      `| ${SC4} | 2026-09-24 | src/A.sol | Pass | none |`,
      `| ${SC5} | 2026-09-24 | slither | Pass | docs/evidence/slither.md |`,
      "",
    ].join("\n"),
    "docs/evidence/deploy.md": `# Deploy\n\n${DP1}: deployed at 0xabc.\n`,
    "src/A.sol": [
      "/// @custom:trace " + SC2,
      "contract A {",
      "    /// @custom:trace " + SC1,
      "    function f() external {}",
      "    /// @custom:trace " + SC4 + " " + SC5,
      "    function g() external {}",
      "}",
      "",
    ].join("\n"),
    "test/A.t.sol": `/// @custom:verifies ${SC1} ${SC4}\nfunction test_f() {}\n`,
    "test/tools/checker.test.mjs": `describe("${VV1} checker runs", () => {});\n`,
    "app/src/lib/amount.ts": `/** @trace ${FE1} */\nexport const parse = 1;\n`,
    "app/src/lib/amount.test.ts": `describe("${FE1} amount parsing", () => {});\n`,
    "script/Deploy.s.sol": `// @trace ${DP1}\n`,
    "foundry.toml": `# @trace ${SC3}\nsolc_version = "0.8.28"\n`,
  };
}

function run(files, args = []) {
  const root = mkdtempSync(join(tmpdir(), "trace-check-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      if (content === null) continue;
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    const r = spawnSync("node", [CHECKER, "--root", root, ...args], { encoding: "utf8" });
    let matrix = null;
    try {
      matrix = readFileSync(join(root, "docs", "TRACE_MATRIX.md"), "utf8");
    } catch {
      matrix = null;
    }
    return { code: r.status, out: r.stdout + r.stderr, matrix };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const withFiles = (changes) => ({ ...baseline(), ...changes });
const edit = (path, from, to) => {
  const files = baseline();
  assert.ok(files[path].includes(from), `fixture ${path} lacks ${from}`);
  files[path] = files[path].replace(from, to);
  return files;
};

function expectPass(result) {
  assert.equal(result.code, 0, `expected exit 0, got ${result.code}\n${result.out}`);
}

// Asserts a failure line for `id` whose reason contains `reason`, so a test cannot be
// satisfied by some other check that happens to mention the same ID.
function expectFailure(result, id, reason) {
  assert.equal(result.code, 1, `expected exit 1, got ${result.code}\n${result.out}`);
  const line = result.out.split("\n").find((l) => l.startsWith(`FAIL ${id}:`) && l.includes(reason));
  assert.ok(line, `no failure for ${id} with reason "${reason}"\n${result.out}`);
}

describe("LLR-VV-002 trace checker", () => {
  it("passes a fully traced repository and writes the matrix", () => {
    const r = run(baseline());
    expectPass(r);
    assert.ok(r.matrix, "TRACE_MATRIX.md was not written");
    for (const id of [SC1, SC2, SC3, SC4, SC5, FE1, VV1, DP1]) assert.ok(r.matrix.includes(id), `matrix lacks ${id}`);
    assert.ok(r.matrix.includes("src/A.sol:3"), "matrix lacks the implementing file and line");
    assert.ok(r.matrix.includes("test/A.t.sol:1"), "matrix lacks the test file and line");
  });

  it("passes the release gate when every entry is present", () => {
    expectPass(run(baseline(), ["--release"]));
  });

  describe("condition 1: HLR children", () => {
    it("fails when an HLR lists no children", () => {
      expectFailure(run(edit("docs/04_HLR.md", `${VV1}; ${DP1} |`, " |")), H(2), "lists no child LLR");
    });

    it("fails when an HLR lists a child that does not exist", () => {
      expectFailure(run(edit("docs/04_HLR.md", "004, 005", "004, 005, 009")), H(1), `lists child ${L("SC", 9)}`);
    });
  });

  describe("condition 2: LLR parents", () => {
    it("fails when an LLR lists no parent", () => {
      expectFailure(run(edit("docs/05_LLR.md", `no admin. | ${H(1)} |`, "no admin. |  |")), SC2, "lists no parent HLR");
    });

    it("fails when an LLR names a parent that does not exist", () => {
      const ghost = H(9);
      expectFailure(run(edit("docs/05_LLR.md", `no admin. | ${H(1)} |`, `no admin. | ${H(1)}, ${ghost} |`)), SC2, `lists parent ${ghost}, which does not exist`);
    });

    it("fails when a named parent does not list the LLR back", () => {
      const r = run(edit("docs/05_LLR.md", `one thing. | ${H(1)} |`, `one thing. | ${H(1)}, ${H(2)} |`));
      expectFailure(r, SC1, `lists parent ${H(2)}, which does not list it back`);
    });

    it("fails when an HLR lists a child that does not name it as a parent", () => {
      const r = run(edit("docs/04_HLR.md", `${VV1}; ${DP1} |`, `${VV1}; ${DP1}; ${SC1} |`));
      expectFailure(r, SC1, `is listed by ${H(2)} but does not name it as a parent`);
    });

    it("ignores tables whose first column is not a requirement ID", () => {
      expectPass(run(baseline()));
    });
  });

  describe("condition 3: tests for method T", () => {
    it("fails when a referenced LLR with method T has no test", () => {
      expectFailure(run(withFiles({ "test/A.t.sol": `/// @custom:verifies ${SC4}\n` })), SC1, "has method T but no test");
    });

    it("counts an e2e script as a test", () => {
      expectPass(run(withFiles({ "test/tools/checker.test.mjs": "", "e2e/run.ts": `// ${VV1}\n` }), ["--release"]));
    });

    it("counts a .test. file anywhere as a test, whatever its extension", () => {
      const files = withFiles({ "test/A.t.sol": `/// @custom:verifies ${SC4}\n`, "src/Foo.test.sol": `// ${SC1}\n` });
      expectPass(run(files, ["--release"]));
    });

    it("counts an evidence mention as a reference that starts the check", () => {
      const files = withFiles({ "test/A.t.sol": `/// @custom:verifies ${SC4}\n`, "docs/evidence/note.md": `${SC1} observed.\n` });
      files["src/A.sol"] = files["src/A.sol"].replace(`/// @custom:trace ${SC1}`, "");
      expectFailure(run(files), SC1, "has method T but no test");
    });

    it("counts an INSPECTIONS.md mention as a reference that starts the check", () => {
      const files = withFiles({ "test/A.t.sol": `/// @custom:verifies ${SC1}\n` });
      files["src/A.sol"] = files["src/A.sol"].replace(`${SC4} ${SC5}`, SC5);
      expectFailure(run(files), SC4, "has method T but no test");
    });
  });

  describe("condition 4: source references", () => {
    it("fails when a referenced SC LLR has no source reference", () => {
      const files = withFiles({});
      files["src/A.sol"] = files["src/A.sol"].replace(`/// @custom:trace ${SC1}`, "");
      expectFailure(run(files), SC1, "has no source reference");
    });

    it("fails when a DP LLR has no source reference at release", () => {
      expectFailure(run(withFiles({ "script/Deploy.s.sol": "// nothing\n" }), ["--release"]), DP1, "has no source reference");
    });

    it("does not count a helper inside an app test directory as source", () => {
      const files = withFiles({ "app/src/lib/amount.ts": "export const parse = 1;\n", "app/src/test/setup.ts": `// ${FE1}\n` });
      expectFailure(run(files), FE1, "has no source reference");
    });

    it("does not count a helper inside a __tests__ directory as source", () => {
      const files = withFiles({ "app/src/lib/amount.ts": "export const parse = 1;\n", "app/src/__tests__/helper.ts": `// ${FE1}\n` });
      expectFailure(run(files), FE1, "has no source reference");
    });

    it("counts a .jsx file as source", () => {
      expectPass(run(withFiles({ "app/src/lib/amount.ts": null, "app/src/lib/Amount.jsx": `// ${FE1}\n` }), ["--release"]));
    });

    it("scans tools/ and lists it in the matrix", () => {
      const r = run(withFiles({ "tools/check.mjs": `// @trace ${VV1}\n` }));
      expectPass(r);
      assert.ok(r.matrix.includes("tools/check.mjs:1"), "matrix lacks tools/check.mjs:1");
    });

    it("does not count a .spec file as source", () => {
      const files = withFiles({ "app/src/lib/amount.ts": "export const parse = 1;\n", "app/src/lib/amount.spec.tsx": `// ${FE1}\n` });
      expectFailure(run(files), FE1, "has no source reference");
    });

    it("counts a tag in foundry.toml as the source of a build setting", () => {
      expectFailure(run(withFiles({ "foundry.toml": 'solc_version = "0.8.28"\n' }), ["--release"]), SC3, "has no source reference");
    });

    it("counts tags in CI workflows, git hooks, and .gitignore as source", () => {
      for (const path of [".github/workflows/ci.yml", ".githooks/pre-commit", ".gitignore"]) {
        expectPass(run(withFiles({ "script/Deploy.s.sol": "// nothing\n", [path]: `# ${DP1}\n` }), ["--release"]));
      }
    });

    it("does not require code or tests for an unreferenced LLR until release", () => {
      const files = withFiles({ "test/A.t.sol": `/// @custom:verifies ${SC4}\n` });
      files["src/A.sol"] = files["src/A.sol"].replace(`/// @custom:trace ${SC1}`, "");
      expectPass(run(files));
      expectFailure(run(files, ["--release"]), SC1, "has method T but no test");
    });
  });

  describe("condition 5: inspection and evidence at release", () => {
    it("fails when an I LLR has no inspection entry", () => {
      const files = edit("docs/INSPECTIONS.md", INSPECTION_SC2 + "\n", "");
      expectPass(run(files));
      expectFailure(run(files, ["--release"]), SC2, "no docs/INSPECTIONS.md row with result Pass");
    });

    it("fails when an A LLR has no inspection entry", () => {
      const files = edit("docs/INSPECTIONS.md", `| ${SC5} | 2026-09-24 | slither | Pass | docs/evidence/slither.md |\n`, "");
      expectFailure(run(files, ["--release"]), SC5, "no docs/INSPECTIONS.md row with result Pass");
    });

    it("fails when the only inspection row did not pass", () => {
      const files = edit("docs/INSPECTIONS.md", INSPECTION_SC2, INSPECTION_SC2.replace("Pass", "Fail"));
      expectFailure(run(files, ["--release"]), SC2, "no docs/INSPECTIONS.md row with result Pass");
    });

    it("fails when a D LLR has no evidence entry", () => {
      const files = withFiles({ "docs/evidence/deploy.md": "# Deploy\n" });
      expectPass(run(files));
      expectFailure(run(files, ["--release"]), DP1, "no entry in docs/evidence/");
    });

    it("finds evidence in subdirectories and JSON records", () => {
      expectPass(run(withFiles({ "docs/evidence/deploy.md": "# Deploy\n", "docs/evidence/e2e/run.json": `{"llr":"${DP1}"}\n` }), ["--release"]));
    });

    it("never counts the test-first log as demonstration evidence", () => {
      const files = withFiles({ "docs/evidence/deploy.md": "# Deploy\n", "docs/evidence/tdd-log.md": `${DP1}\n` });
      expectFailure(run(files, ["--release"]), DP1, "no entry in docs/evidence/");
    });
  });

  describe("condition 6: unknown IDs", () => {
    it("fails when code or tests name an ID that does not exist", () => {
      const ghost = L("SC", 99);
      expectFailure(run(withFiles({ "test/B.t.sol": `/// @custom:verifies ${ghost}\n` })), ghost, "does not exist");
    });

    it("fails on malformed IDs with the wrong number of digits", () => {
      for (const bad of [L("SC", 32, 2), L("SC", 320, 4), H(1, 2), ["UJ", "1"].join("-"), U(99)]) {
        expectFailure(run(withFiles({ "test/B.t.sol": `/// @custom:verifies ${bad}\n` })), bad, "does not exist");
      }
    });

    it("ignores IDs inside lib and node_modules", () => {
      expectPass(run(withFiles({ "lib/x/Y.sol": `// ${L("SC", 99)}\n`, "node_modules/z/i.ts": `// ${L("FE", 99)}\n` })));
    });
  });
});

describe("LLR-VV-009 journey acceptance", () => {
  it("fails when a journey is missing from ACCEPTANCE.md", () => {
    expectFailure(run(edit("docs/ACCEPTANCE.md", ACCEPT_U2 + "\n", "")), U(2), "is missing from docs/ACCEPTANCE.md");
  });

  it("fails at release when a journey has no passing result", () => {
    const files = edit("docs/ACCEPTANCE.md", "Evid | Pass |", "Evid | Pending |");
    expectPass(run(files));
    expectFailure(run(files, ["--release"]), U(2), 'has result "Pending"');
  });

  it("accepts Awaiting walkthrough at release for a journey with a walkthrough step", () => {
    expectPass(run(edit("docs/ACCEPTANCE.md", "FE; WT | Pass |", "FE; WT | Awaiting walkthrough |"), ["--release"]));
  });

  it("rejects Awaiting walkthrough at release for a journey without a walkthrough step", () => {
    const files = edit("docs/ACCEPTANCE.md", "Evid | Pass |", "Evid | Awaiting walkthrough |");
    expectFailure(run(files, ["--release"]), U(2), 'has result "Awaiting walkthrough"');
  });
});
