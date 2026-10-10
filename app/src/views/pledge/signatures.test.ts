import { describe, expect, it } from "vitest";
import type { PledgeState } from "../../chain/reads";
import { STAKER_MARK, refereeMark } from "./signatures";

describe("LLR-FE-040 the referee's signature line says only what the state proves", () => {
  const cases: [PledgeState | null, string][] = [
    [null, ""],
    ["Active", ""],
    ["Expired", "no answer"],
    ["Kept", "Kept"],
    ["Broken", "Broken"],
    ["SettledToStaker", "Kept"],
    ["SettledToBeneficiary", ""],
  ];

  it.each(cases)("%s reads %j", (state, text) => {
    expect(refereeMark(state)).toBe(text);
  });

  it("marks the staker as signed", () => {
    expect(STAKER_MARK).toBe("signed");
  });
});
