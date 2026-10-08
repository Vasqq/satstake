import { describe, expect, it } from "vitest";
import { bannerVariant } from "./banner";

describe("LLR-FE-040 which banner the page shows", () => {
  it("shows the visitor text while open to a visitor with no role", () => {
    expect(bannerVariant({ state: "Active", role: null, deadlineReached: false })).toBe("open-visitor");
  });

  it.each(["staker", "referee", "beneficiary"] as const)("shows the %s's own text while open", (role) => {
    expect(bannerVariant({ state: "Active", role, deadlineReached: false })).toBe(`open-${role}`);
  });

  it("keeps the open text while chain time is not yet known", () => {
    expect(bannerVariant({ state: "Active", role: "referee", deadlineReached: null })).toBe("open-referee");
  });

  it("switches to the no-answer text as soon as chain time reaches the deadline, before the poll flips the state", () => {
    expect(bannerVariant({ state: "Active", role: "referee", deadlineReached: true })).toBe("expired");
    expect(bannerVariant({ state: "Active", role: null, deadlineReached: true })).toBe("expired");
  });

  it("maps each later state to its own text", () => {
    expect(bannerVariant({ state: "Expired", role: null, deadlineReached: true })).toBe("expired");
    expect(bannerVariant({ state: "Kept", role: null, deadlineReached: false })).toBe("kept");
    expect(bannerVariant({ state: "Broken", role: null, deadlineReached: false })).toBe("broken");
    expect(bannerVariant({ state: "SettledToStaker", role: "staker", deadlineReached: true })).toBe("settled");
    expect(bannerVariant({ state: "SettledToBeneficiary", role: null, deadlineReached: true })).toBe("settled");
  });
});
