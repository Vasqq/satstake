import { describe, expect, it } from "vitest";
import { formatSats } from "./format";

describe("LLR-FE-045 amounts of cirBTC are shown in satoshis as a grouped integer", () => {
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
