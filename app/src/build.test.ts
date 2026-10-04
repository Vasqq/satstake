import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { satStakeAbi as abi } from "./abi";
import { contentSecurityPolicy } from "./config/csp";
import { networks } from "./config/networks";
import viteConfig from "../vite.config";

const appDir = resolve(import.meta.dirname, "..");
const repo = resolve(appDir, "..");
const vite = resolve(appDir, "node_modules/vite/bin/vite.js");
const scratch = resolve(repo, "cache/app-build-test");

interface Build {
  status: number | null;
  stderr: string;
  out: string;
  bundle: string;
}

// Runs the real Vite build, since the requirement is about what the build does and not about a helper.
function build(name: string, network: string | undefined): Build {
  const out = resolve(scratch, name);
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  if (network !== undefined) env.VITE_NETWORK = network;
  const run = spawnSync(process.execPath, [vite, "build", "--outDir", out, "--emptyOutDir"], {
    cwd: appDir,
    env,
    encoding: "utf8",
  });
  const assets = resolve(out, "assets");
  const bundle = existsSync(assets)
    ? readdirSync(assets)
        .filter((f) => f.endsWith(".js"))
        .map((f) => readFileSync(resolve(assets, f), "utf8"))
        .join("\n")
    : "";
  return { status: run.status, stderr: run.stderr, out, bundle };
}

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("LLR-FE-002 the build selects its target from VITE_NETWORK", () => {
  it("builds the mainnet target with the mainnet contract address inside it", () => {
    const result = build("mainnet", "mainnet");
    expect(result.status).toBe(0);
    expect(existsSync(resolve(result.out, "index.html"))).toBe(true);
    expect(result.bundle.toLowerCase()).toContain((networks.mainnet.contract as string).toLowerCase());
  }, 120_000);

  it("fails when the variable is unset", () => {
    const result = build("unset", undefined);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("VITE_NETWORK");
  }, 120_000);

  it("builds the testnet target with the testnet contract address inside it", () => {
    const result = build("testnet", "testnet");
    expect(result.status).toBe(0);
    expect(existsSync(resolve(result.out, "index.html"))).toBe(true);
    expect(result.bundle.toLowerCase()).toContain((networks.testnet.contract as string).toLowerCase());
  }, 120_000);
});

describe("LLR-FE-081 the contract ABI comes from the Foundry artifact", () => {
  const artifactPath = resolve(repo, "out/SatStake.sol/SatStake.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    abi: unknown;
    deployedBytecode: { object: string };
  };

  it("is identical to the abi field of out/SatStake.sol/SatStake.json", () => {
    expect(abi).toEqual(artifact.abi);
  });

  it("is imported from the artifact path in the source, and no ABI is written by hand under src", () => {
    const abiSource = readFileSync(resolve(appDir, "src/abi.ts"), "utf8");
    expect(abiSource).toMatch(/import \{ abi \} from "\.\.\/\.\.\/out\/SatStake\.sol\/SatStake\.json";/);
    expect(abiSource).not.toMatch(/parseAbi|"type":\s*"function"|type:\s*"function"/);
    const stack = [resolve(appDir, "src")];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) stack.push(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
          expect(readFileSync(path, "utf8"), path).not.toMatch(/parseAbi|type:\s*"function"/);
        }
      }
    }
  });

  it("carries the external surface of 05 section 1.1, errors included", () => {
    const names = (type: string) =>
      abi
        .filter((e) => e.type === type)
        .map((e) => ("name" in e ? e.name : ""))
        .sort();
    expect(names("function")).toEqual(
      [
        "MAX_DURATION",
        "MAX_PAGE",
        "MAX_PROMISE_BYTES",
        "MIN_DURATION",
        "allowedTokens",
        "createPledge",
        "getPledge",
        "isAllowedToken",
        "markBroken",
        "markKept",
        "pledgeCount",
        "pledgeCountOf",
        "pledgeIdsOf",
        "settle",
        "stateOf",
        "totalLocked",
      ].sort(),
    );
    expect(names("error")).toContain("PledgeNotFound");
  });

  it("leaves the compiler output of the artifact out of the bundle", () => {
    const result = build("abi", "testnet");
    expect(result.status).toBe(0);
    expect(result.bundle).toContain("pledgeIdsOf");
    expect(result.bundle).not.toContain(artifact.deployedBytecode.object.slice(2, 80));
    expect(result.bundle).not.toContain("sourceUnit");
  }, 120_000);
});

describe("LLR-FE-080 TypeScript strict, ESLint with no any", () => {
  it("has strict mode on", () => {
    const tsconfig = JSON.parse(readFileSync(resolve(appDir, "tsconfig.json"), "utf8")) as {
      compilerOptions: { strict: boolean };
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it("makes ESLint report an explicit any as an error", async () => {
    const eslint = new ESLint({ cwd: appDir });
    const [result] = await eslint.lintText("export const x: any = 1;\n", {
      filePath: resolve(appDir, "src/example.ts"),
    });
    const hit = result?.messages.find((m) => m.ruleId === "@typescript-eslint/no-explicit-any");
    expect(hit?.severity).toBe(2);
  });

  it("pins every dependency to an exact version", () => {
    const pkg = JSON.parse(readFileSync(resolve(appDir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(all)) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    for (const needed of ["vite", "react", "typescript", "viem", "wagmi"]) expect(all, needed).toHaveProperty(needed);
  });
});

describe("LLR-FE-073 the built page carries the policy and loads nothing from elsewhere", () => {
  const result = () => build("csp", "testnet");
  const html = (out: string) => readFileSync(resolve(out, "index.html"), "utf8");

  it("has a policy meta tag, ahead of every script and stylesheet, equal to the policy for the selected network", () => {
    const built = result();
    expect(built.status).toBe(0);
    const page = html(built.out);
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(page);
    // The attribute is HTML-escaped, so the quotes in 'self' and 'none' read back as character references.
    expect(meta?.[1]?.replaceAll("&#39;", "'")).toBe(contentSecurityPolicy(networks.testnet));
    const at = page.indexOf("Content-Security-Policy");
    expect(at).toBeGreaterThan(-1);
    for (const tag of ["<script", "<link"]) expect(at, tag).toBeLessThan(page.indexOf(tag));
  }, 120_000);

  it("loads every script and stylesheet from a relative path, with no inline code or style", () => {
    const page = html(build("csp-page", "testnet").out);
    const references = [...page.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((m) => m[1] as string);
    expect(references.length).toBeGreaterThan(1);
    expect(page).toMatch(/<link rel="stylesheet"[^>]*href="\.\/assets\/[^"]+\.css"/);
    expect(page).toMatch(/<script type="module"[^>]*src="\.\/assets\/[^"]+\.js"/);
    for (const ref of references) expect(ref, ref).toMatch(/^\.\//);
    expect(page).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(page).not.toMatch(/<style|\sstyle=/);
  }, 120_000);

  it("links a favicon from the site itself, so the browser asks nowhere else for an icon", () => {
    const built = build("csp-icon", "testnet");
    const page = html(built.out);
    const icon = /<link rel="icon"[^>]*href="([^"]*)"/.exec(page);
    expect(icon?.[1]).toBe("./favicon.svg");
    const svg = readFileSync(resolve(built.out, "favicon.svg"), "utf8");
    expect(svg).toMatch(/^<svg\b/);
    // The xmlns attribute names the SVG vocabulary and is never fetched, so it is set aside before the scan.
    expect(svg.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "")).not.toMatch(/https?:|href=|<script|<image|<foreignObject|url\(|data:/i);
  }, 120_000);

  it("names exactly the mainnet RPC URLs in connect-src of the mainnet build, and no testnet URL", () => {
    const page = html(build("csp-mainnet", "mainnet").out);
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(page);
    const policy = (meta?.[1] ?? "").replaceAll("&#39;", "'");
    expect(policy).toBe(contentSecurityPolicy(networks.mainnet));
    const connect = /connect-src ([^;]*)/.exec(policy)?.[1]?.split(" ");
    expect(connect).toEqual([...networks.mainnet.rpcUrls]);
    for (const url of networks.testnet.rpcUrls) expect(page).not.toContain(url);
  }, 120_000);

  it("names exactly the testnet RPC URLs in connect-src of the testnet build, and no mainnet URL", () => {
    const page = html(build("csp-testnet", "testnet").out);
    const connect = /connect-src ([^;"]*)/.exec(page)?.[1]?.split(" ");
    expect(connect).toEqual([...networks.testnet.rpcUrls]);
    for (const url of networks.mainnet.rpcUrls) expect(page).not.toContain(url);
  }, 120_000);

  it("is not applied by the source index.html, so the development server is not locked out", () => {
    expect(readFileSync(resolve(appDir, "index.html"), "utf8")).not.toContain("Content-Security-Policy");
  });
});

describe("LLR-FE-081 the development server serves the artifact and the deployment records only", () => {
  it("allows the app folder, the Foundry output, and the deployments folder, and not the repository root", async () => {
    const config = await (viteConfig as unknown as (env: { mode: string; command: string }) => Promise<{
      server: { fs: { allow: string[] } };
    }>)({ mode: "test", command: "serve" });
    expect(config.server.fs.allow).toEqual([".", "../out", "../deployments"]);
  });
});
