import type { PledgeState } from "../chain/reads";

/**
 * The derived state in short words for lists and badges. The contract's names (SettledToStaker) are for code,
 * not for the page.
 *
 * @trace LLR-FE-040
 */
export const STATE_NAMES: Readonly<Record<PledgeState, string>> = {
  Active: "Active",
  Expired: "Expired",
  Kept: "Kept",
  Broken: "Broken",
  SettledToStaker: "Settled to staker",
  SettledToBeneficiary: "Settled to beneficiary",
};

/**
 * The derived state as a sentence for the pledge page's status line. Each begins with its state's name so the
 * state is readable without its colour.
 *
 * @trace LLR-FE-040
 */
export const STATE_MEANINGS: Readonly<Record<PledgeState, string>> = {
  Active: "Active. Waiting for the referee's verdict.",
  Expired: "Expired. The deadline passed with no verdict. The stake can now be sent to the beneficiary.",
  Kept: "Kept. The referee confirmed the promise. The stake can now be returned to the staker.",
  Broken: "Broken. The referee marked the promise broken. The stake can now be sent to the beneficiary.",
  SettledToStaker: "Settled. The stake was returned to the staker.",
  SettledToBeneficiary: "Settled. The stake was sent to the beneficiary.",
};

/**
 * Chain time can reach the deadline before the next poll flips the state from Active, and the page must not
 * claim a verdict is still awaited in that gap.
 *
 * @trace LLR-FE-040
 */
export const ACTIVE_PAST_DEADLINE_MEANING = "The deadline has passed. Updating the status from the network.";
