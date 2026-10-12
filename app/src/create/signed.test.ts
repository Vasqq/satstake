import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { network } from "../test/walletHarness";
import { shareLink, stakeWords } from "./signed";

const usdc = network.tokens.find((t) => t.symbol === "USDC")!;
const cirbtc = network.tokens.find((t) => t.symbol === "cirBTC")!;

describe("LLR-FE-037 the stake is written in the words of its token (LLR-FE-045)", () => {
  it("names the token with the sats of cirBTC, writes USDC as dollars, and never adds a price", () => {
    expect(stakeWords(network, cirbtc.address, 1_000n)).toBe("1,000 sats of cirBTC");
    expect(stakeWords(network, cirbtc.address, 1n)).toBe("1 sat of cirBTC");
    expect(stakeWords(network, usdc.address, 20_000_000n)).toBe("$20 in USDC");
    expect(stakeWords(network, usdc.address, 1_500_000n)).toBe("$1.50 in USDC");
  });
});

describe("LLR-FE-037 the share link is the address of the promise's page, in full", () => {
  it("is this page's own address with the promise's route", () => {
    expect(shareLink(42n)).toBe(`${window.location.origin}${window.location.pathname}#/p/42`);
    expect(shareLink(2n ** 70n)).toBe(`${window.location.origin}${window.location.pathname}#/p/${(2n ** 70n).toString()}`);
  });
});

describe("LLR-FE-037 the create flow and the landing say sign, and never seal", () => {
  // The strings a visitor can read in the files that make a promise and introduce it; comments are not read.
  const shown = (file: string): string[] => {
    const source = ts.createSourceFile(file, readFileSync(join(import.meta.dirname, "..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node))
        found.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  };

  it.each(["create/CreateView.tsx", "views/HomeView.tsx", "design/Hero.tsx", "design/SignaturePad.tsx", "design/Sections.tsx", "create/signed.ts"])(
    "has no seal or sealed in what %s shows",
    (file) => {
      expect(shown(file).filter((text) => /\bseal/i.test(text))).toEqual([]);
    },
  );

  it("says Sign it on the button and signed in the panel's labels", () => {
    const create = shown("create/CreateView.tsx").join("\n");
    expect(create).toContain("Sign it");
    expect(create).toContain("Signed in transaction");
    expect(create).toContain("Signed promise");
    expect(create).toMatch(/· signed/);
  });
});
