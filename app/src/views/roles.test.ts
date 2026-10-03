import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import type { Pledge } from "../chain/reads";
import { ROLE_NAMES, roleOf } from "./roles";

const addr = (byte: string) => getAddress(`0x${byte.repeat(20)}`);
// Letters in the hex digits, so a checksum differs from the lower-case form and a case-sensitive comparison fails.
const STAKER = addr("ab");
const REFEREE = addr("cd");
const BENEFICIARY = addr("ef");
const pledge: Pick<Pledge, "staker" | "referee" | "beneficiary"> = { staker: STAKER, referee: REFEREE, beneficiary: BENEFICIARY };

describe("LLR-FE-041 the connected account's role on a pledge", () => {
  it.each([
    [STAKER, "staker"],
    [REFEREE, "referee"],
    [BENEFICIARY, "beneficiary"],
  ] as const)("names %s as the %s", (account, role) => {
    expect(roleOf(pledge, account)).toBe(role);
  });

  it("compares addresses without regard to the case of the letters", () => {
    expect(roleOf(pledge, REFEREE.toLowerCase())).toBe("referee");
    expect(roleOf({ ...pledge, referee: REFEREE.toLowerCase() as typeof REFEREE }, REFEREE)).toBe("referee");
    expect(roleOf(pledge, `0x${REFEREE.slice(2).toUpperCase()}`)).toBe("referee");
  });

  it("gives no role to an account that is not a party", () => {
    expect(roleOf(pledge, addr("44"))).toBeNull();
  });

  it("gives no role when there is no account", () => {
    expect(roleOf(pledge, undefined)).toBeNull();
    expect(roleOf(pledge, null)).toBeNull();
    expect(roleOf(pledge, "")).toBeNull();
  });

  it("does not give a role to an account that only shares a prefix or suffix with a party", () => {
    expect(roleOf(pledge, `${STAKER.slice(0, 41)}0`)).toBeNull();
    expect(roleOf(pledge, `0x0${STAKER.slice(3)}`)).toBeNull();
  });

  it("writes each role as a capitalised word", () => {
    expect(ROLE_NAMES).toEqual({ staker: "Staker", referee: "Referee", beneficiary: "Beneficiary" });
  });
});
