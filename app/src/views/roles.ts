import type { Pledge } from "../chain/reads";

export type Role = "staker" | "referee" | "beneficiary";

/**
 * What the connected account did or gets, in a sentence for the badge. Plain words: the contract's role names
 * are for code.
 *
 * @trace LLR-FE-041
 */
export const ROLE_STATEMENTS: Readonly<Record<Role, string>> = {
  staker: "You made this promise",
  referee: "You judge this promise",
  beneficiary: "You get the stake if it is broken or missed",
};

/**
 * What each party did or will get, for the pledge page's columns. Broken is named with missed: the beneficiary
 * gets the stake on a broken verdict as well as on silence.
 *
 * @trace LLR-FE-041
 */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  staker: "Made it",
  referee: "Judges it",
  beneficiary: "Gets it if broken or missed",
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
