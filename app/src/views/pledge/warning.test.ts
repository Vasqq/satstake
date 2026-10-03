import { describe, expect, it } from "vitest";
import type { PledgeState } from "../../chain/reads";
import type { Role } from "../roles";
import { REFEREE_WARNING, STAKER_WARNING, deadlineWarning } from "./warning";

const warn = (state: PledgeState, remaining: bigint | null, role: Role | null) => deadlineWarning({ state, remaining, role });

describe("LLR-FE-043 the warning when an Active pledge has under 10 minutes of chain time left", () => {
  it("uses the brief's words for the referee and for the staker", () => {
    expect(REFEREE_WARNING).toBe(
      "Less than 10 minutes left. If you do not record a verdict before the deadline, the stake goes to the beneficiary.",
    );
    expect(STAKER_WARNING).toBe(
      "Less than 10 minutes left. If your referee does not mark this promise kept before the deadline, your stake goes to the beneficiary.",
    );
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
