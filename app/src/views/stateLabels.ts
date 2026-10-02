import type { PledgeState } from "../chain/reads";

/**
 * The derived state in the words a staker would use. The contract's names (SettledToStaker) are for code,
 * not for the page. They are the display of the polled state, so they sit under LLR-FE-011 until the
 * pledge-page group, where the requirement for displaying the derived state takes them over.
 *
 * @trace LLR-FE-011
 */
export const STATE_LABELS: Record<PledgeState, string> = {
  Active: "Active",
  Expired: "Expired",
  Kept: "Kept",
  Broken: "Broken",
  SettledToStaker: "Settled: stake returned to the staker",
  SettledToBeneficiary: "Settled: stake sent to the beneficiary",
};
