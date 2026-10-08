import type { PledgeState } from "../chain/reads";

/**
 * The derived state in plain words for lists and badges. The contract's names (SettledToStaker) are for code,
 * not for the page.
 *
 * @trace LLR-FE-040
 */
export const STATE_NAMES: Readonly<Record<PledgeState, string>> = {
  Active: "Open",
  Expired: "No answer by the deadline",
  Kept: "Kept",
  Broken: "Broken",
  SettledToStaker: "Paid back",
  SettledToBeneficiary: "Paid out",
};

/**
 * The derived state as a sentence for the pledge page's status line. Each begins with its state's name so the
 * state is readable without its colour.
 *
 * @trace LLR-FE-040
 */
export const STATE_MEANINGS: Readonly<Record<PledgeState, string>> = {
  Active: "Open. Waiting for the referee's verdict.",
  Expired: "No answer by the deadline. The promise counts as broken, and the stake can be sent to the beneficiary.",
  Kept: "Kept. The referee confirmed it, and the stake can be sent back to the staker.",
  Broken: "Broken. The referee marked it broken, and the stake can be sent to the beneficiary.",
  SettledToStaker: "Paid back. The stake went back to the staker.",
  SettledToBeneficiary: "Paid out. The stake went to the beneficiary.",
};

/**
 * Chain time can reach the deadline before the next poll flips the state from Active, and the page must not
 * claim a verdict is still awaited in that gap.
 *
 * @trace LLR-FE-040
 */
export const ACTIVE_PAST_DEADLINE_MEANING = "The deadline has passed. Updating the status from the network.";
