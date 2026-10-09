import { describe, expect, it } from "vitest";
import { selectNetwork } from "../config/networks";
import { liveLabel } from "./chrome";

describe("LLR-FE-013 the live indicator names the configured network", () => {
  it("says Arc testnet for the test network and Arc mainnet for the main one", () => {
    expect(liveLabel(selectNetwork("testnet"))).toBe("Live on Arc testnet");
    expect(liveLabel(selectNetwork("mainnet"))).toBe("Live on Arc mainnet");
  });
});
