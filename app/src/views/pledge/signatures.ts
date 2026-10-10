import type { PledgeState } from "../../chain/reads";

/** What sits on the staker's line. Creating the promise was their transaction, so it is signed on every promise. */
export const STAKER_MARK = "signed";

/**
 * What the referee's line says, only where the derived state proves it. A payout to the staker follows a Kept
 * verdict and nothing else. A payout to the beneficiary follows either a Broken verdict or silence and the page,
 * which reads no event logs, cannot tell which, so that line stays empty rather than guess.
 *
 * @trace LLR-FE-040
 */
export function refereeMark(state: PledgeState | null): string {
  if (state === "Kept" || state === "SettledToStaker") return "Kept"; // LLR-FE-040
  if (state === "Broken") return "Broken"; // LLR-FE-040
  if (state === "Expired") return "no answer"; // LLR-FE-040
  return "";
}
