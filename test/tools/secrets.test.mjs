// Tests for the repository's secret protections: the ignore rules and CI scan
// (LLR-DP-010) and the pre-commit hook (LLR-DP-011). Fake credentials are generated
// at runtime so this file never contains anything a secret scanner would flag.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8" });

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "secrets-test-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "test");
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "commit.gpgsign", "false");
  return dir;
}

// A token in GitHub's personal-access-token format, which gitleaks detects by pattern.
function fakeGithubToken() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const body = [...randomBytes(36)].map((b) => alphabet[b % alphabet.length]).join("");
  return ["gh", "p_", body].join("");
}

describe("LLR-DP-010 ignore rules and CI secret scan", () => {
  let repo;
  before(() => {
    repo = tempRepo();
    copyFileSync(join(ROOT, ".gitignore"), join(repo, ".gitignore"));
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  const mustIgnore = [
    ".env",
    ".env.local",
    ".env.mainnet",
    ".env-mainnet",
    ".env_backup",
    ".envrc",
    "deployer.pw",
    "burner.key",
    "burner.pem",
    "keystores/satstake-deployer",
    "keystore/satstake-referee",
    "satstake-deployer",
    "deployments/satstake-referee",
    "wallet.keystore",
    "UTC--2026-09-24T00-00-00.000000000Z--0123456789abcdef",
    "cache/solidity-files-cache.json",
    "broadcast/Deploy.s.sol/5042/run-latest.json",
    "app/node_modules/viem/index.js",
    ".DS_Store",
    "docs/._notes.md",
    "Thumbs.db",
    "desktop.ini",
    ".idea/workspace.xml",
    ".vscode/settings.json",
    "src/.SatStake.sol.swp",
  ];
  for (const path of mustIgnore) {
    it(`ignores ${path}`, () => {
      assert.equal(git(repo, "check-ignore", "-q", "--no-index", path).status, 0, `${path} is not ignored`);
    });
  }

  it("does not ignore project files", () => {
    for (const path of ["src/SatStake.sol", "deployments/5042.json", "deployments/config/5042.json", ".env.example"]) {
      assert.notEqual(git(repo, "check-ignore", "-q", "--no-index", path).status, 0, `${path} is ignored`);
    }
  });

  describe("CI secret scan", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    const jobs = ci.split(/\n  (?=[a-z][\w-]*:\n)/);
    const scanJob = jobs.find((block) => /\bgitleaks git\b/.test(block));
    const installs = [...ci.matchAll(/gitleaks\/releases\/download\/(v[\d.]+)\/gitleaks_[\d.]+_linux_x64\.tar\.gz/g)].map((m) => m[1]);

    it("has a job that runs gitleaks over git history", () => {
      assert.ok(scanJob, "no CI job runs `gitleaks git`");
    });

    it("scans the full history, not only the pushed range", () => {
      assert.match(scanJob, /fetch-depth:\s*0\b/, "the scan job does not fetch the full history");
      assert.doesNotMatch(scanJob, /--log-opts/, "the scan is limited to a commit range");
    });

    it("fails the build on a finding", () => {
      assert.doesNotMatch(scanJob, /continue-on-error:\s*true/, "the scan job cannot fail the build");
      assert.doesNotMatch(scanJob, /--exit-code[= ]0\b/, "the scan exits 0 on findings");
    });

    it("installs one gitleaks version everywhere, verified by checksum", () => {
      assert.ok(installs.length >= 1, "gitleaks is not installed from a pinned release");
      assert.equal(new Set(installs).size, 1, `different gitleaks versions: ${installs.join(", ")}`);
      assert.match(scanJob, /sha256sum -c/, "the scan job does not verify the download");
      assert.doesNotMatch(ci, /gitleaks\/gitleaks-action/, "the action downloads its own unverified gitleaks");
    });
  });
});

describe("LLR-DP-011 pre-commit secret scan", () => {
  let repo;
  before(() => {
    repo = tempRepo();
    mkdirSync(join(repo, ".githooks"));
    copyFileSync(join(ROOT, ".githooks/pre-commit"), join(repo, ".githooks/pre-commit"));
    chmodSync(join(repo, ".githooks/pre-commit"), 0o755);
    git(repo, "config", "core.hooksPath", ".githooks");
  });
  after(() => rmSync(repo, { recursive: true, force: true }));

  it("blocks a commit whose staged changes contain a secret, without printing it", () => {
    const token = fakeGithubToken();
    writeFileSync(join(repo, "config.txt"), `token = "${token}"\n`);
    git(repo, "add", "config.txt");
    const r = git(repo, "commit", "-q", "-m", "Add config");
    assert.notEqual(r.status, 0, "the commit with a secret was accepted");
    assert.ok(!(r.stdout + r.stderr).includes(token), "the hook printed the secret");
    assert.notEqual(git(repo, "rev-parse", "--verify", "-q", "HEAD").status, 0, "a commit was created");
    git(repo, "rm", "-q", "--cached", "config.txt");
    rmSync(join(repo, "config.txt"));
  });

  it("allows a commit with no secret", () => {
    writeFileSync(join(repo, "notes.txt"), "Nothing sensitive here.\n");
    git(repo, "add", "notes.txt");
    const r = git(repo, "commit", "-q", "-m", "Add notes");
    assert.equal(r.status, 0, `a clean commit was blocked\n${r.stderr}`);
  });
});
