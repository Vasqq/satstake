import type { Pledge } from "../chain/reads";

export type Role = "staker" | "referee" | "beneficiary";

/** @trace LLR-FE-041 */
export const ROLE_NAMES: Readonly<Record<Role, string>> = {
  staker: "Staker",
  referee: "Referee",
  beneficiary: "Beneficiary",
};

/**
 * What each party did or will get, for the pledge page's columns. The nouns above stay for sentences.
 *
 * @trace LLR-FE-041
 */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  staker: "Made it",
  referee: "Judges it",
  beneficiary: "Gets it if missed",
};

/**
 * The contract refuses a pledge where one address holds two roles, so at most one matches. Wallets report
 * addresses in lower case and the chain in checksum case, so the comparison ignores case.
 *
 * @trace LLR-FE-041
 */
export function roleOf(
  pledge: Pick<Pledge, "staker" | "referee" | "beneficiary">,
  account: string | null | undefined,
): Role | null {
  if (!account) return null;
  const mine = account.toLowerCase();
  for (const role of ["staker", "referee", "beneficiary"] as const) {
    if (pledge[role].toLowerCase() === mine) return role; // LLR-FE-041
  }
  return null;
}
