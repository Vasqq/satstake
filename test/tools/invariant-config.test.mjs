// Tests for the invariant campaign size (LLR-VV-004). The requirement is about the build
// configuration rather than about a call, so it is checked by reading foundry.toml and the CI
// workflow: the default profile's figures, any other profile that could lower them, and any
// environment override CI could apply.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIN_RUNS = 512;
const MIN_DEPTH = 128;

// Section name -> Map of key to value, for the subset of TOML foundry.toml uses. Enough to read
// scalar settings; multi-line arrays contribute keys that no assertion here reads.
function tomlSections(text) {
  const sections = new Map([["", new Map()]]);
  let current = "";
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = header[1];
      if (!sections.has(current)) sections.set(current, new Map());
      continue;
    }
    const setting = /^([A-Za-z0-9_.-]+)\s*=\s*(.+?),?$/.exec(line);
    if (setting) sections.get(current).set(setting[1], setting[2].trim());
  }
  return sections;
}

const sections = tomlSections(readFileSync(join(ROOT, "foundry.toml"), "utf8"));
// Foundry reads a bare [invariant] table as the default profile's.
const defaultInvariant = sections.get("invariant") ?? sections.get("profile.default.invariant");

describe("LLR-VV-004 invariant runs and depth", () => {
  it("the default profile has an invariant section", () => {
    assert.ok(defaultInvariant, "foundry.toml has no [invariant] section");
  });

  it(`runs at least ${MIN_RUNS} sequences`, () => {
    const runs = Number(defaultInvariant.get("runs"));
    assert.ok(Number.isFinite(runs), "[invariant] does not set runs");
    assert.ok(runs >= MIN_RUNS, `[invariant] runs is ${runs}, fewer than ${MIN_RUNS}`);
  });

  it(`makes each sequence at least ${MIN_DEPTH} calls deep`, () => {
    const depth = Number(defaultInvariant.get("depth"));
    assert.ok(Number.isFinite(depth), "[invariant] does not set depth");
    assert.ok(depth >= MIN_DEPTH, `[invariant] depth is ${depth}, shallower than ${MIN_DEPTH}`);
  });

  it("no other profile lowers either figure", () => {
    for (const [name, settings] of sections) {
      if (name !== "invariant" && !name.endsWith(".invariant")) continue;
      const runs = settings.has("runs") ? Number(settings.get("runs")) : MIN_RUNS;
      const depth = settings.has("depth") ? Number(settings.get("depth")) : MIN_DEPTH;
      assert.ok(runs >= MIN_RUNS, `[${name}] runs is ${runs}, fewer than ${MIN_RUNS}`);
      assert.ok(depth >= MIN_DEPTH, `[${name}] depth is ${depth}, shallower than ${MIN_DEPTH}`);
    }
  });

  describe("CI cannot run a smaller campaign", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");

    it("runs forge test", () => {
      assert.match(ci, /\bforge test\b/, "no CI step runs forge test");
    });

    it("selects no other profile", () => {
      assert.doesNotMatch(ci, /FOUNDRY_PROFILE/, "CI selects a Foundry profile, which may carry other figures");
      assert.doesNotMatch(ci, /forge test[^\n]*--profile/, "the forge test step selects a profile");
    });

    it("overrides neither figure through the environment", () => {
      assert.doesNotMatch(ci, /FOUNDRY_INVARIANT_RUNS/, "CI overrides the invariant runs");
      assert.doesNotMatch(ci, /FOUNDRY_INVARIANT_DEPTH/, "CI overrides the invariant depth");
    });
  });
});
