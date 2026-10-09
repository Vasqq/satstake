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

  // A verdict mined in the last block before the deadline is invisible until the next poll, so the gap between
  // chain time reaching the deadline and the poll flipping the state must not claim there was no answer.
  it("shows a neutral checking text, not the no-answer text, once chain time reaches the deadline while the poll still says Active", () => {
    expect(bannerVariant({ state: "Active", role: "referee", deadlineReached: true })).toBe("deadline-checking");
    expect(bannerVariant({ state: "Active", role: null, deadlineReached: true })).toBe("deadline-checking");
  });

  it("maps each later state to its own text", () => {
    expect(bannerVariant({ state: "Expired", role: null, deadlineReached: true })).toBe("expired");
    expect(bannerVariant({ state: "Kept", role: null, deadlineReached: false })).toBe("kept");
    expect(bannerVariant({ state: "Broken", role: null, deadlineReached: false })).toBe("broken");
    expect(bannerVariant({ state: "SettledToStaker", role: "staker", deadlineReached: true })).toBe("settled");
    expect(bannerVariant({ state: "SettledToBeneficiary", role: null, deadlineReached: true })).toBe("settled");
  });
});
