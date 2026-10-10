import { describe, expect, it } from "vitest";
import type { PledgeState } from "../../chain/reads";
import type { Role } from "../roles";
import { type ActionPlan, SETTLE_LABEL, SETTLE_NOTES, planActions } from "./actions";

type Wallet = "none" | "pending" | "connected";
const plan = (state: PledgeState, role: Role | "other" | null, over: { wallet?: Wallet; deadlineReached?: boolean | null } = {}) =>
  planActions({ state, role: role === "other" ? null : role, wallet: over.wallet ?? "connected", deadlineReached: "deadlineReached" in over ? (over.deadlineReached as boolean | null) : false });
const settle = (goesTo: "staker" | "beneficiary"): ActionPlan => ({ kind: "settle", goesTo });

describe("LLR-FE-042 LLR-VV-006 the action matrix of 05 section 2.1", () => {
  it("offers a referee of an Active pledge Kept and Broken before the deadline", () => {
    expect(plan("Active", "referee")).toEqual({ kind: "verdict" });
  });

  it("gives a staker of an Active pledge a hint and no button", () => {
    expect(plan("Active", "staker")).toEqual({
      kind: "hint",
      text: "Your referee must mark this promise kept before the deadline.",
    });
  });

  it("offers a beneficiary or another account nothing on an Active pledge", () => {
    expect(plan("Active", "beneficiary")).toEqual({ kind: "none" });
    expect(plan("Active", "other")).toEqual({ kind: "none" });
  });

  it("offers every role a payout to the beneficiary on an Expired or Broken pledge", () => {
    for (const state of ["Expired", "Broken"] as const) {
      for (const role of ["staker", "referee", "beneficiary", "other"] as const) {
        expect(plan(state, role)).toEqual(settle("beneficiary"));
      }
    }
  });

  it("offers every role a payout to the staker on a Kept pledge", () => {
    for (const role of ["staker", "referee", "beneficiary", "other"] as const) {
      expect(plan("Kept", role)).toEqual(settle("staker"));
    }
  });

  it("gives the payout control one label, whoever sends it and wherever it goes", () => {
    expect(SETTLE_LABEL).toBe("Send payout");
    expect(Object.keys(plan("Kept", "staker")).sort()).toEqual(["goesTo", "kind"]);
  });

  it("offers nothing on a settled pledge to anyone", () => {
    for (const state of ["SettledToStaker", "SettledToBeneficiary"] as const) {
      for (const role of ["staker", "referee", "beneficiary", "other", null] as const) {
        expect(plan(state, role)).toEqual({ kind: "none" });
      }
      expect(plan(state, null, { wallet: "none" })).toEqual({ kind: "none" });
      expect(plan(state, null, { wallet: "pending" })).toEqual({ kind: "none" });
    }
  });

  it("tells a visitor with no wallet to connect, in the matrix's words", () => {
    expect(plan("Active", null, { wallet: "none" })).toEqual({ kind: "connect", text: "Connect a wallet to act." });
    for (const state of ["Expired", "Kept", "Broken"] as const) {
      expect(plan(state, null, { wallet: "none" })).toEqual({ kind: "connect", text: "Connect a wallet to settle." });
    }
  });

  it("says it is waiting for the wallet while it connects, wherever the matrix offers something", () => {
    for (const state of ["Active", "Expired", "Kept", "Broken"] as const) {
      expect(plan(state, null, { wallet: "pending" })).toEqual({ kind: "waiting", text: "Waiting for your wallet to connect." });
    }
  });

  it("hides Kept and Broken once chain time reaches the deadline, whatever the last poll said", () => {
    expect(plan("Active", "referee", { deadlineReached: true })).toEqual({ kind: "none" });
  });

  it("hides them while chain time is not yet known, so a verdict is never offered on a guess", () => {
    expect(plan("Active", "referee", { deadlineReached: null })).toEqual({ kind: "none" });
  });

  it("drops the staker's hint at the deadline, since it would promise a window that has closed", () => {
    expect(plan("Active", "staker", { deadlineReached: true })).toEqual({ kind: "none" });
  });

  it("does not let the deadline hide settlement", () => {
    expect(plan("Expired", "staker", { deadlineReached: true })).toEqual(settle("beneficiary"));
  });

  it("says where the stake goes, in the brief's words", () => {
    expect(SETTLE_NOTES.staker).toBe("Anyone can send this. The full stake goes only to the staker.");
    expect(SETTLE_NOTES.beneficiary).toBe("Anyone can send this. The full stake goes only to the beneficiary.");
  });
});
