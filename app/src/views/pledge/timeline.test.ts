import { describe, expect, it } from "vitest";
import { PLEDGE_STATES, type PledgeState } from "../../chain/reads";
import { timelineOf } from "./timeline";

const statuses = (state: PledgeState) => timelineOf(state).map((s) => s.status);
const second = (state: PledgeState) => timelineOf(state)[1]!;

describe("LLR-FE-040 the three-step timeline", () => {
  it("has three steps for every state, exactly one of them the present", () => {
    for (const state of PLEDGE_STATES) {
      expect(timelineOf(state)).toHaveLength(3);
      expect(statuses(state).filter((s) => s === "now")).toHaveLength(1);
    }
  });

  it.each<[PledgeState, string[]]>([
    ["Active", ["done", "now", "ahead"]],
    ["Kept", ["done", "done", "now"]],
    ["Broken", ["done", "done", "now"]],
    ["SettledToStaker", ["done", "done", "now"]],
    ["Expired", ["done", "passed", "now"]],
    ["SettledToBeneficiary", ["done", "passed", "now"]],
  ])("for %s the steps read %j", (state, expected) => {
    expect(statuses(state)).toEqual(expected);
  });

  // The page reads no logs, so after a payout to the beneficiary it cannot tell a broken verdict from silence,
  // and an expired promise had no verdict at all. Neither may claim one.
  it("does not call the second step judged when no verdict is known", () => {
    expect(second("Expired").label).not.toBe(second("Kept").label);
    expect(second("Expired").label).toMatch(/no answer/i);
    expect(second("SettledToBeneficiary").label).not.toBe(second("Kept").label);
    expect(second("SettledToBeneficiary").label).toMatch(/no answer/i);
  });

  it("calls the second step judged once a verdict is known", () => {
    for (const state of ["Kept", "Broken", "SettledToStaker"] as const) expect(second(state).label).toBe(second("Active").label);
  });
});
