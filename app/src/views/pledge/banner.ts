import type { PledgeState } from "../../chain/reads";
import type { Role } from "../roles";

export type BannerVariant =
  | "open-visitor"
  | "open-referee"
  | "open-staker"
  | "open-beneficiary"
  | "deadline-checking"
  | "expired"
  | "kept"
  | "broken"
  | "settled";

/**
 * Which text the banner shows. Chain time can reach the deadline before the next poll flips the state from
 * Active, and the banner must not tell a referee to decide in that gap. Nor may it claim there was no answer:
 * a verdict mined in the last block before the deadline is invisible until the next poll. So the gap gets a
 * neutral text. While chain time is unknown the open text stands, since the deadline is named in it.
 *
 * @trace LLR-FE-040 LLR-FE-041
 */
export function bannerVariant(input: { state: PledgeState; role: Role | null; deadlineReached: boolean | null }): BannerVariant {
  const { state, role, deadlineReached } = input;
  if (state === "Active") {
    if (deadlineReached === true) return "deadline-checking"; // LLR-FE-040
    return role === null ? "open-visitor" : `open-${role}`; // LLR-FE-041
  }
  if (state === "Expired") return "expired";
  if (state === "Kept") return "kept";
  if (state === "Broken") return "broken";
  return "settled";
}
