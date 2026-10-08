import { afterEach, describe, expect, it } from "vitest";
import { formatAmount, formatLocalTime, formatSats, shorten } from "./format";
import { network } from "./test/walletHarness";

describe("LLR-FE-045 LLR-VV-006 amounts of cirBTC are shown in satoshis as a grouped integer", () => {
  it.each([
    [0n, "0 sats"],
    [1n, "1 sat"],
    [2n, "2 sats"],
    [999n, "999 sats"],
    [1_000n, "1,000 sats"],
    [25_000_000n, "25,000,000 sats"],
    [150_000_000n, "150,000,000 sats"],
    [2_100_000_000_000_000n, "2,100,000,000,000,000 sats"],
    [2n ** 70n, "1,180,591,620,717,411,303,424 sats"],
  ])("writes %s units as %s", (units, text) => {
    expect(formatSats(units)).toBe(text);
  });

  it("groups with commas whatever the visitor's locale, so the same amount reads the same everywhere", () => {
    expect(formatSats(1_234_567n)).toBe("1,234,567 sats");
  });
});

describe("LLR-FE-040 amounts as the pledge page writes them", () => {
  const token = (symbol: string) => network.tokens.find((t) => t.symbol === symbol)!;
  const usdc = token("USDC");
  const cirbtc = token("cirBTC");

  it.each([
    [20_000_000n, "$20 in USDC"],
    [5_000_000n, "$5 in USDC"],
    [1_500_000n, "$1.5 in USDC"],
    [1_234_500_000n, "$1,234.5 in USDC"],
    [1n, "$0.000001 in USDC"],
    [0n, "$0 in USDC"],
    [123_456_789_000_000n, "$123,456,789 in USDC"],
    [1_000_000_000_000n, "$1,000,000 in USDC"],
    [999_000_000n, "$999 in USDC"],
  ])("writes %s units of USDC with its 6 decimals as %s", (amount, text) => {
    expect(formatAmount(network, usdc.address, amount)).toBe(text);
  });

  it.each([
    [1_000n, "1,000 sats, 0.00001 cirBTC"],
    [10_000n, "10,000 sats, 0.0001 cirBTC"],
    [1n, "1 sat, 0.00000001 cirBTC"],
    [2n, "2 sats, 0.00000002 cirBTC"],
    [150_000_000n, "150,000,000 sats, 1.5 cirBTC"],
  ])("writes %s units of cirBTC in sats first and then in cirBTC as %s", (amount, text) => {
    expect(formatAmount(network, cirbtc.address, amount)).toBe(text);
  });

  it("gives cirBTC no dollar sign, because no price feed turns it into dollars", () => {
    expect(formatAmount(network, cirbtc.address, 10_000n)).not.toContain("$");
  });

  it("matches the token address whatever the case of the letters", () => {
    expect(formatAmount(network, usdc.address.toLowerCase() as `0x${string}`, 2_000_000n)).toBe("$2 in USDC");
    expect(formatAmount(network, cirbtc.address.toLowerCase() as `0x${string}`, 10_000n)).toBe(
      "10,000 sats, 0.0001 cirBTC",
    );
  });

  it("shows no sats for a token that is not cirBTC", () => {
    expect(formatAmount(network, usdc.address, 10_000n)).not.toContain("sat");
  });

  it("writes a token that matches none of the configured ones as raw units with the token shortened", () => {
    const other = "0x1234567890123456789012345678901234567890" as const;
    expect(formatAmount(network, other, 42n)).toBe("42 units of 0x1234…7890");
  });

  it("looks the token up in the network it is given, not in a fixed list", () => {
    const custom = { ...network, tokens: [{ symbol: "XYZ", address: usdc.address, decimals: 2 }] };
    expect(formatAmount(custom, usdc.address, 250n)).toBe("2.5 XYZ");
  });

  // LLR-FE-045: the decimals come from the configuration, not from what USDC and cirBTC happen to use today.
  it("reads USDC and cirBTC with the decimals the network configures for them", () => {
    const custom = {
      ...network,
      tokens: [
        { ...usdc, decimals: 2 },
        { ...cirbtc, decimals: 4 },
      ],
    };
    expect(formatAmount(custom, usdc.address, 123_456n)).toBe("$1,234.56 in USDC");
    expect(formatAmount(custom, cirbtc.address, 15n)).toMatch(/, 0\.0015 cirBTC$/);
  });

  it("leaves a configured token that is neither USDC nor cirBTC as units and symbol, with no dollar sign", () => {
    const custom = { ...network, tokens: [{ symbol: "XYZ", address: usdc.address, decimals: 2 }] };
    expect(formatAmount(custom, usdc.address, 123_456n)).toBe("1234.56 XYZ");
  });
});

describe("LLR-FE-040 a time is written in the visitor's zone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  // 2026-10-05T13:30:00Z
  const SECONDS = 1_791_207_000n;

  it("writes month, day, year, hour, minute and the zone name, 12-hour clock, in English", () => {
    process.env.TZ = "Europe/Paris";
    expect(formatLocalTime(SECONDS)).toBe("Oct 5, 2026, 3:30 PM GMT+2");
  });

  it("follows the visitor's zone", () => {
    process.env.TZ = "UTC";
    expect(formatLocalTime(SECONDS)).toBe("Oct 5, 2026, 1:30 PM UTC");
  });

  it("takes seconds as a number or as a bigint", () => {
    process.env.TZ = "UTC";
    expect(formatLocalTime(Number(SECONDS))).toBe(formatLocalTime(SECONDS));
  });

  it("reads the value as seconds, not milliseconds", () => {
    process.env.TZ = "UTC";
    expect(formatLocalTime(0n)).toBe("Jan 1, 1970, 12:00 AM UTC");
  });
});

describe("LLR-FE-040 a hex value is shortened to its first 6 and last 4 characters", () => {
  it("joins them with an ellipsis character", () => {
    expect(shorten("0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4")).toBe("0x3Ae2…Cac4");
  });

  it("shortens a transaction hash the same way", () => {
    expect(shorten(`0x${"ab".repeat(32)}`)).toBe("0xabab…abab");
    expect(shorten(`0x${"1234567890".repeat(6)}ffff`)).toBe("0x1234…ffff");
  });
});
