import type { PledgeState } from "../../chain/reads";

/** @trace LLR-FE-040 */
export const STEPS = ["Made", "Judged", "Paid out"] as const;

/**
 * How far the promise has come: `done` steps are complete and `current` is the one marked as the present. Once
 * a verdict exists or the deadline has passed, judging is over and the stake waits to be paid, so the present
 * is the last step; after payment all three are done and it stays marked as where the promise ended.
 *
 * @trace LLR-FE-040
 */
export function timelineOf(state: PledgeState): { done: number; current: number } {
  if (state === "Active") return { done: 1, current: 1 }; // LLR-FE-040
  if (state === "SettledToStaker" || state === "SettledToBeneficiary") return { done: 3, current: 2 }; // LLR-FE-040
  return { done: 2, current: 2 }; // LLR-FE-040
}
