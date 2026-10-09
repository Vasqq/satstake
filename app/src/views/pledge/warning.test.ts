import { describe, expect, it } from "vitest";
import type { PledgeState } from "../../chain/reads";
import type { Role } from "../roles";
import { REFEREE_WARNING, STAKER_WARNING, deadlineWarning } from "./warning";

const warn = (state: PledgeState, remaining: bigint | null, role: Role | null) => deadlineWarning({ state, remaining, role });

describe("LLR-FE-043 the warning when an Active pledge has under 10 minutes of chain time left", () => {
  it("names the people in plain words, not by their contract role", () => {
    expect(REFEREE_WARNING).toMatch(/^Less than 10 minutes left\./);
    expect(STAKER_WARNING).toMatch(/^Less than 10 minutes left\./);
    expect(REFEREE_WARNING).toMatch(/verdict/);
    expect(STAKER_WARNING).toMatch(/kept/);
    for (const text of [REFEREE_WARNING, STAKER_WARNING]) {
      expect(text).toMatch(/the person named to get it/);
      expect(text).not.toMatch(/beneficiary|referee|staker/i);
    }
  });

  it("warns the referee and the staker", () => {
    expect(warn("Active", 599n, "referee")).toBe(REFEREE_WARNING);
    expect(warn("Active", 599n, "staker")).toBe(STAKER_WARNING);
  });

  it("warns from 599 seconds down to 1 second and not at 600", () => {
    expect(warn("Active", 600n, "referee")).toBeNull();
    expect(warn("Active", 601n, "referee")).toBeNull();
    expect(warn("Active", 1n, "referee")).toBe(REFEREE_WARNING);
  });

  it("does not warn at or after the deadline", () => {
    expect(warn("Active", 0n, "referee")).toBeNull();
    expect(warn("Active", -5n, "staker")).toBeNull();
  });

  it("does not warn the beneficiary, another account, or a visitor", () => {
    expect(warn("Active", 100n, "beneficiary")).toBeNull();
    expect(warn("Active", 100n, null)).toBeNull();
  });

  it("does not warn before chain time is known", () => {
    expect(warn("Active", null, "referee")).toBeNull();
  });

  it("warns only for an Active pledge", () => {
    for (const state of ["Expired", "Kept", "Broken", "SettledToStaker", "SettledToBeneficiary"] as const) {
      expect(warn(state, 100n, "referee")).toBeNull();
      expect(warn(state, 100n, "staker")).toBeNull();
    }
  });
});
