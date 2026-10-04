import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount";

describe("LLR-FE-032 LLR-VV-006 amount entry accepts digits with at most one decimal point and no more fractional digits than the token's decimals", () => {
  it.each([
    ["1", 6, 1_000_000n],
    ["0", 6, 0n],
    ["10.5", 6, 10_500_000n],
    ["0.000001", 6, 1n],
    ["12345678901234567890", 6, 12345678901234567890000000n],
    ["1.5", 8, 150_000_000n],
    ["0.00000001", 8, 1n],
    ["21", 8, 2_100_000_000n],
    ["007", 6, 7_000_000n],
    [".5", 6, 500_000n],
    ["5.", 6, 5_000_000n],
    ["1.50", 6, 1_500_000n],
  ])("accepts %s at %i decimals as %s", (text, decimals, value) => {
    expect(parseAmount(text, decimals)).toEqual({ ok: true, value });
  });

  it("converts with the decimals of the token it is given and never with 18", () => {
    expect(parseAmount("1", 6)).toEqual({ ok: true, value: 10n ** 6n });
    expect(parseAmount("1", 8)).toEqual({ ok: true, value: 10n ** 8n });
    expect(parseAmount("1", 0)).toEqual({ ok: true, value: 1n });
    expect(parseAmount("1", 2)).toEqual({ ok: true, value: 100n });
    expect(parseAmount("1", 6)).not.toEqual({ ok: true, value: 10n ** 18n });
  });

  it.each([
    ["an empty entry", "", "empty"],
    ["a decimal point alone", ".", "syntax"],
    ["two decimal points", "1.2.3", "syntax"],
    ["a comma", "1,5", "syntax"],
    ["a thousands comma", "1,000", "syntax"],
    ["a minus sign", "-1", "syntax"],
    ["a plus sign", "+1", "syntax"],
    ["an exponent", "1e6", "syntax"],
    ["a leading space", " 1", "syntax"],
    ["a trailing space", "1 ", "syntax"],
    ["a hex prefix", "0x10", "syntax"],
    ["an underscore", "1_000", "syntax"],
    ["letters", "abc", "syntax"],
    ["a full-width digit", "１", "syntax"],
    ["an Arabic-Indic digit", "١", "syntax"],
    ["a newline", "1\n", "syntax"],
    ["a unit", "1 USDC", "syntax"],
  ] as const)("refuses %s", (_label, text, reason) => {
    expect(parseAmount(text, 6)).toEqual({ ok: false, reason });
  });

  it("refuses one more fractional digit than the token has, even when it is a zero", () => {
    expect(parseAmount("0.0000001", 6)).toEqual({ ok: false, reason: "precision" });
    expect(parseAmount("1.5000000", 6)).toEqual({ ok: false, reason: "precision" });
    expect(parseAmount("0.000000001", 8)).toEqual({ ok: false, reason: "precision" });
    expect(parseAmount("0.1", 0)).toEqual({ ok: false, reason: "precision" });
    expect(parseAmount("1.", 0)).toEqual({ ok: true, value: 1n });
  });

  it("accepts exactly as many fractional digits as the token has", () => {
    expect(parseAmount("0.123456", 6)).toEqual({ ok: true, value: 123_456n });
    expect(parseAmount("0.12345678", 8)).toEqual({ ok: true, value: 12_345_678n });
  });
});
