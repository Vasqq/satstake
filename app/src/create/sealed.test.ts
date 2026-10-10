import { describe, expect, it } from "vitest";
import { network } from "../test/walletHarness";
import { sealBytesOf, sealLabelOf, shareLink, stakeWords } from "./sealed";

const usdc = network.tokens.find((t) => t.symbol === "USDC")!;
const cirbtc = network.tokens.find((t) => t.symbol === "cirBTC")!;
const HASH = `0x${Array.from({ length: 32 }, (_, i) => (i * 7 + 3).toString(16).padStart(2, "0")).join("")}` as const;

describe("LLR-FE-037 the seal is drawn from the 32 bytes of the creation hash and from nothing else", () => {
  it("returns the bytes of a transaction hash, in order, whatever the case of its letters", () => {
    const bytes = sealBytesOf(HASH);
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(32);
    expect(Array.from(bytes!)).toEqual(Array.from({ length: 32 }, (_, i) => i * 7 + 3));
    expect(Array.from(sealBytesOf(`0x${HASH.slice(2).toUpperCase()}`)!)).toEqual(Array.from(bytes!));
  });

  it.each([
    ["one byte short", `0x${"ab".repeat(31)}`],
    ["one byte long", `0x${"ab".repeat(33)}`],
    ["a half byte", `0x${"ab".repeat(31)}a`],
    ["not hex", `0x${"zz".repeat(32)}`],
    ["no prefix", "ab".repeat(32)],
    ["empty", ""],
  ])("returns nothing for a hash that is %s, so a malformed answer cannot stop the page after the money has moved", (_name, hash) => {
    expect(sealBytesOf(hash)).toBeNull();
  });

  it("gives two different hashes two different byte strings", () => {
    const other = `0x${HASH.slice(2, -2)}ff`;
    expect(Array.from(sealBytesOf(other)!)).not.toEqual(Array.from(sealBytesOf(HASH)!));
  });
});

describe("LLR-FE-037 the words round the seal come from the real promise", () => {
  it("names the promise number, the stake, the network and the first eight digits of the hash, in capitals", () => {
    const label = sealLabelOf({ id: 42n, stake: "1,000 sats", networkName: "Arc Testnet", hash: HASH });
    expect(label).toBe(`PROMISE № 42 · 1,000 SATS · SEALED ON ARC TESTNET · ${HASH.slice(2, 10).toUpperCase()}`);
  });

  it("changes with the number, the stake, the network and the hash", () => {
    const base = { id: 42n, stake: "1,000 sats", networkName: "Arc", hash: HASH } as const;
    const label = sealLabelOf(base);
    expect(sealLabelOf({ ...base, id: 43n })).not.toBe(label);
    expect(sealLabelOf({ ...base, stake: "2,000 sats" })).not.toBe(label);
    expect(sealLabelOf({ ...base, networkName: "Arc Testnet" })).not.toBe(label);
    expect(sealLabelOf({ ...base, hash: `0x${"ee".repeat(32)}` })).not.toBe(label);
  });
});

describe("LLR-FE-037 the stake is written in the words of its token (LLR-FE-045)", () => {
  it("writes cirBTC as sats and USDC as dollars, and never adds a price", () => {
    expect(stakeWords(network, cirbtc.address, 1_000n)).toBe("1,000 sats");
    expect(stakeWords(network, cirbtc.address, 1n)).toBe("1 sat");
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
