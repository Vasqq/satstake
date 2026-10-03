import type { PledgeState } from "../../chain/reads";
import type { Role } from "../roles";

export type ActionPlan =
  | { kind: "none" }
  | { kind: "connect" | "hint" | "waiting"; text: string }
  | { kind: "verdict" }
  | { kind: "settle"; label: string; goesTo: "staker" | "beneficiary" };

/** @trace LLR-FE-042 */
export const SETTLE_NOTES: Readonly<Record<"staker" | "beneficiary", string>> = {
  staker: "Anyone can send this. The full stake goes only to the staker.",
  beneficiary: "Anyone can send this. The full stake goes only to the beneficiary.",
};

const STAKER_HINT = "Your referee must mark this promise kept before the deadline.";

/**
 * The matrix of 05 section 2.1 for one derived state and role. `deadlineReached` is null while chain time is
 * unknown, which is treated like a reached deadline for a verdict: offering one on a guess could invite a call
 * the contract refuses.
 *
 * @trace LLR-FE-042
 */
export function planActions(input: {
  state: PledgeState;
  role: Role | null;
  wallet: "none" | "pending" | "connected";
  deadlineReached: boolean | null;
}): ActionPlan {
  const { state, role, wallet, deadlineReached } = input;
  if (state === "SettledToStaker" || state === "SettledToBeneficiary") return { kind: "none" }; // LLR-FE-042

  if (wallet === "pending") return { kind: "waiting", text: "Waiting for your wallet to connect." }; // LLR-FE-042
  if (wallet === "none") {
    // LLR-FE-042
    return { kind: "connect", text: state === "Active" ? "Connect a wallet to act." : "Connect a wallet to settle." };
  }

  if (state === "Active") {
    if (deadlineReached !== false) return { kind: "none" }; // LLR-FE-042
    if (role === "referee") return { kind: "verdict" }; // LLR-FE-042
    if (role === "staker") return { kind: "hint", text: STAKER_HINT }; // LLR-FE-042
    return { kind: "none" };
  }

  if (state === "Kept") {
    // LLR-FE-042
    return role === "staker"
      ? { kind: "settle", label: "Withdraw my stake", goesTo: "staker" }
      : { kind: "settle", label: "Send stake to staker", goesTo: "staker" };
  }
  // Expired and Broken both pay the beneficiary.
  return role === "beneficiary"
    ? { kind: "settle", label: "Claim stake", goesTo: "beneficiary" } // LLR-FE-042
    : { kind: "settle", label: "Send stake to beneficiary", goesTo: "beneficiary" }; // LLR-FE-042
}
