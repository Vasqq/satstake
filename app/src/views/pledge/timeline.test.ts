import { describe, expect, it } from "vitest";
import { PLEDGE_STATES, type PledgeState } from "../../chain/reads";
import { STEPS, timelineOf } from "./timeline";

describe("LLR-FE-040 the three-step timeline", () => {
  it("names the three steps in order", () => {
    expect(STEPS).toEqual(["Made", "Judged", "Paid out"]);
  });

  it.each<[PledgeState, number, number]>([
    ["Active", 1, 1],
    ["Expired", 2, 2],
    ["Kept", 2, 2],
    ["Broken", 2, 2],
    ["SettledToStaker", 3, 2],
    ["SettledToBeneficiary", 3, 2],
  ])("for %s marks %i steps done and step index %i as the current one", (state, done, current) => {
    expect(timelineOf(state)).toEqual({ done, current });
  });

  it("covers every state", () => {
    for (const state of PLEDGE_STATES) expect(timelineOf(state).current).toBeGreaterThanOrEqual(0);
  });
});
