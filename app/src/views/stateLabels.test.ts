import { describe, expect, it } from "vitest";
import { PLEDGE_STATES } from "../chain/reads";
import { ACTIVE_PAST_DEADLINE_MEANING, STATE_MEANINGS, STATE_NAMES } from "./stateLabels";

describe("LLR-FE-040 the derived state in words", () => {
  it("has a short name for every state, and nothing else", () => {
    expect(STATE_NAMES).toEqual({
      Active: "Active",
      Expired: "Expired",
      Kept: "Kept",
      Broken: "Broken",
      SettledToStaker: "Settled to staker",
      SettledToBeneficiary: "Settled to beneficiary",
    });
    expect(Object.keys(STATE_NAMES).sort()).toEqual([...PLEDGE_STATES].sort());
  });

  it("has a meaning for every state, and nothing else", () => {
    expect(STATE_MEANINGS).toEqual({
      Active: "Active. Waiting for the referee's verdict.",
      Expired: "Expired. The deadline passed with no verdict. The stake can now be sent to the beneficiary.",
      Kept: "Kept. The referee confirmed the promise. The stake can now be returned to the staker.",
      Broken: "Broken. The referee marked the promise broken. The stake can now be sent to the beneficiary.",
      SettledToStaker: "Settled. The stake was returned to the staker.",
      SettledToBeneficiary: "Settled. The stake was sent to the beneficiary.",
    });
    expect(Object.keys(STATE_MEANINGS).sort()).toEqual([...PLEDGE_STATES].sort());
  });

  it("has its own sentence for an Active pledge whose deadline chain time has reached", () => {
    expect(ACTIVE_PAST_DEADLINE_MEANING).toBe("The deadline has passed. Updating the status from the network.");
  });

  it("starts each meaning with its state name's first word", () => {
    for (const state of PLEDGE_STATES) {
      expect(STATE_MEANINGS[state].startsWith(STATE_NAMES[state].split(" ")[0]!)).toBe(true);
    }
  });
});
