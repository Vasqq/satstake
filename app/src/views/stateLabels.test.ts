import { describe, expect, it } from "vitest";
import { PLEDGE_STATES } from "../chain/reads";
import { ACTIVE_PAST_DEADLINE_MEANING, STATE_MEANINGS, STATE_NAMES } from "./stateLabels";

describe("LLR-FE-040 the derived state in words", () => {
  it("has a plain name for every state, and nothing else", () => {
    expect(STATE_NAMES).toEqual({
      Active: "Open",
      Expired: "No answer by the deadline",
      Kept: "Kept",
      Broken: "Broken",
      SettledToStaker: "Paid back",
      SettledToBeneficiary: "Paid out",
    });
    expect(Object.keys(STATE_NAMES).sort()).toEqual([...PLEDGE_STATES].sort());
  });

  it("has a meaning for every state, and nothing else", () => {
    expect(STATE_MEANINGS).toEqual({
      Active: "Open. Waiting for the referee's verdict.",
      Expired: "No answer by the deadline. The promise counts as broken, and the stake can be sent to the beneficiary.",
      Kept: "Kept. The referee confirmed it, and the stake can be sent back to the staker.",
      Broken: "Broken. The referee marked it broken, and the stake can be sent to the beneficiary.",
      SettledToStaker: "Paid back. The stake went back to the staker.",
      SettledToBeneficiary: "Paid out. The stake went to the beneficiary.",
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

  it("uses none of the contract's identifiers", () => {
    for (const state of PLEDGE_STATES) {
      expect(STATE_NAMES[state]).not.toMatch(/Settled|Active|Expired/);
      expect(STATE_MEANINGS[state]).not.toMatch(/Settled|Active|Expired/);
    }
  });
});
