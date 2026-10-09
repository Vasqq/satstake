import type { PledgeState } from "../../chain/reads";
import type { Role } from "../roles";

/** @trace LLR-FE-043 */
export const REFEREE_WARNING =
  "Less than 10 minutes left. If you do not record a verdict before the deadline, the stake goes to the person named to get it.";
/** @trace LLR-FE-043 */
export const STAKER_WARNING =
  "Less than 10 minutes left. If the person judging it does not mark this promise kept before the deadline, your stake goes to the person named to get it.";

const WARNING_SECONDS = 600n;

/**
 * Only the staker and the referee have something to lose or do in the last minutes, so only they are warned.
 * `remaining` is chain time, and a warning is never shown on a guess: before the clock has synced it is null.
 *
 * @trace LLR-FE-043
 */
export function deadlineWarning(input: { state: PledgeState; remaining: bigint | null; role: Role | null }): string | null {
  const { state, remaining, role } = input;
  if (state !== "Active" || remaining === null) return null; // LLR-FE-043
  if (remaining <= 0n || remaining >= WARNING_SECONDS) return null; // LLR-FE-043
  if (role === "referee") return REFEREE_WARNING;
  if (role === "staker") return STAKER_WARNING;
  return null; // LLR-FE-043
}
