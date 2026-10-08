import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";
import { networks, selectNetwork } from "./networks";

const directives = (policy: string) =>
  Object.fromEntries(
    policy.split(";").map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name as string, sources];
    }),
  );

describe("LLR-FE-073 the Content-Security-Policy limits connect-src to the configured RPC URLs", () => {
  const testnet = selectNetwork("testnet");
  const mainnet = selectNetwork("mainnet", {
    testnet: networks.testnet,
    mainnet: { ...networks.mainnet, contract: "0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4" },
  });

  it("allows exactly the testnet RPC URLs to be connected to, in the testnet build", () => {
    expect(directives(contentSecurityPolicy(testnet))["connect-src"]).toEqual([...testnet.rpcUrls]);
  });

  it("allows exactly the mainnet RPC URLs, and none of the testnet ones, in the mainnet build", () => {
    const policy = contentSecurityPolicy(mainnet);
    expect(directives(policy)["connect-src"]).toEqual([...mainnet.rpcUrls]);
    for (const url of testnet.rpcUrls) expect(policy).not.toContain(url);
  });

  it("follows the list it is given, so a changed configuration changes the policy", () => {
    const changed = { ...testnet, rpcUrls: ["https://one.example", "https://two.example"] };
    expect(directives(contentSecurityPolicy(changed))["connect-src"]).toEqual(["https://one.example", "https://two.example"]);
  });

  it("loads scripts and styles only from the site itself and refuses everything not named", () => {
    const d = directives(contentSecurityPolicy(testnet));
    expect(d["default-src"]).toEqual(["'none'"]);
    expect(d["script-src"]).toEqual(["'self'"]);
    expect(d["style-src"]).toEqual(["'self'"]);
    expect(d["img-src"]).toEqual(["'self'"]);
    expect(d["font-src"]).toEqual(["'self'"]);
    expect(d["base-uri"]).toEqual(["'none'"]);
    expect(d["form-action"]).toEqual(["'none'"]);
    expect(Object.keys(d).sort()).toEqual(
      ["base-uri", "connect-src", "default-src", "font-src", "form-action", "img-src", "script-src", "style-src"].sort(),
    );
  });

  it("allows no inline or eval code, no wildcard, and no unencrypted or third-party origin", () => {
    for (const target of [testnet, mainnet]) {
      const policy = contentSecurityPolicy(target);
      expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|unsafe-hashes|\*|\bhttp:|\bws:|\bdata:|\bblob:|\bfilesystem:/);
      const origins = [...policy.matchAll(/https:\/\/[^\s;]+/g)].map((m) => m[0]);
      expect(origins.sort()).toEqual([...target.rpcUrls].sort());
    }
  });
});
