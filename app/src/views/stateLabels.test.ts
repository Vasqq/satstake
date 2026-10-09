import { describe, expect, it } from "vitest";
import { PLEDGE_STATES } from "../chain/reads";
import { ACTIVE_PAST_DEADLINE_MEANING, STATE_MEANINGS, STATE_NAMES } from "./stateLabels";

// The words are Liam's to change (05 v1.27). These tests hold what a reader relies on: every state has a name
// and a sentence, neither is the contract's identifier, and the sentence repeats the name so the state does
// not depend on a colour.
describe("LLR-FE-040 the derived state in words", () => {
  it("has a name and a meaning for every state, and nothing else", () => {
    expect(Object.keys(STATE_NAMES).sort()).toEqual([...PLEDGE_STATES].sort());
    expect(Object.keys(STATE_MEANINGS).sort()).toEqual([...PLEDGE_STATES].sort());
    for (const state of PLEDGE_STATES) {
      expect(STATE_NAMES[state].trim()).not.toBe("");
      expect(STATE_MEANINGS[state].trim()).not.toBe("");
    }
  });

  it("gives each state a name of its own, so two states are never confused", () => {
    expect(new Set(PLEDGE_STATES.map((s) => STATE_NAMES[s])).size).toBe(PLEDGE_STATES.length);
  });

  it("has its own sentence for an Active pledge whose deadline chain time has reached", () => {
    expect(ACTIVE_PAST_DEADLINE_MEANING.trim()).not.toBe("");
    expect(ACTIVE_PAST_DEADLINE_MEANING).not.toBe(STATE_MEANINGS.Active);
    expect(ACTIVE_PAST_DEADLINE_MEANING.toLowerCase()).toContain("deadline");
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
