import type { PledgeState } from "../chain/reads";

/** The axis of the example week: days 0 to 10, the deadline on day 7, the example verdict on day 4. */
export const DEADLINE = 7;
export const MAX = 10;
export const VERDICT_DAY = 4;

export type Scenario = "kept" | "broken" | "silent";

export interface DemoState {
  k: "locking" | "open" | "kept" | "broken" | "noanswer" | "paidback" | "paidout";
  h: string;
  c: "" | "g" | "r";
  d: string;
  /** The day the payout happens in this scenario. */
  pay: number;
}

/** The design's example week. The words are the design's. */
export function demoState(scenario: Scenario, t: number): DemoState {
  const pay = scenario === "silent" ? DEADLINE + 1 : VERDICT_DAY + 1;
  if (t < 0.6) return { k: "locking", h: "Locking", c: "", d: "The stake moves from the staker’s wallet into the contract.", pay };
  if ((scenario !== "silent" && t < VERDICT_DAY) || (scenario === "silent" && t < DEADLINE)) {
    return { k: "open", h: "Open", c: "", d: "Locked and waiting. Only the referee can rule, and only until day 7.", pay };
  }
  if (scenario === "kept" && t < pay) {
    return { k: "kept", h: "Kept", c: "g", d: "The referee confirmed it. The stake waits for someone to send the payout.", pay };
  }
  if (scenario === "broken" && t < pay) {
    return { k: "broken", h: "Broken", c: "r", d: "The referee ruled it broken. Final, and they never touched the money.", pay };
  }
  if (scenario === "silent" && t < pay) {
    return { k: "noanswer", h: "No answer", c: "r", d: "The deadline passed with no verdict. Silence counts as broken.", pay };
  }
  if (scenario === "kept") {
    return { k: "paidback", h: "Paid back", c: "g", d: "Sent back to the staker in one transaction. Final the moment it lands.", pay };
  }
  return { k: "paidout", h: "Paid out", c: "r", d: "Sent to the beneficiary in one transaction. Final the moment it lands.", pay };
}

export interface LiveStage {
  heading: string;
  tone: "" | "g" | "r";
  text: string;
  /** Where the stake sits on the diagram. */
  stake: "vault" | "staker" | "beneficiary";
  /** The verdict bubble, only where the state proves what was said. */
  bubble: string | null;
  /** The stages this pledge can have been through, ending at the current one. */
  chain: string[];
}

const STAGES: Readonly<Record<PledgeState, LiveStage>> = {
  Active: {
    heading: "Open",
    tone: "",
    text: "Locked and waiting. Only the referee can rule, and only before the deadline.",
    stake: "vault",
    bubble: null,
    chain: ["Open"],
  },
  Expired: {
    heading: "No answer",
    tone: "r",
    text: "The deadline passed with no verdict. Silence counts as broken.",
    stake: "vault",
    bubble: "No answer",
    chain: ["Open", "No answer"],
  },
  Kept: {
    heading: "Kept",
    tone: "g",
    text: "The referee confirmed it. The stake waits for someone to send the payout.",
    stake: "vault",
    bubble: "Kept",
    chain: ["Open", "Kept"],
  },
  Broken: {
    heading: "Broken",
    tone: "r",
    text: "The referee ruled it broken. Final, and they never touched the money.",
    stake: "vault",
    bubble: "Broken",
    chain: ["Open", "Broken"],
  },
  SettledToStaker: {
    heading: "Paid back",
    tone: "g",
    text: "Sent back to the staker in one transaction. Final the moment it landed.",
    stake: "staker",
    bubble: "Kept",
    chain: ["Open", "Kept", "Paid back"],
  },
  SettledToBeneficiary: {
    heading: "Paid out",
    tone: "r",
    text: "Sent to the beneficiary in one transaction. Final the moment it landed.",
    stake: "beneficiary",
    // A payout to the beneficiary follows a Broken verdict or silence, and the contract does not say which.
    bubble: null,
    chain: ["Open", "Paid out"],
  },
};

/**
 * What the page says in the moment chain time has passed the deadline and the next poll has not yet shown whether
 * a verdict was mined just before it. Neither Open nor No answer is true, so it says it is looking.
 */
const CHECKING: LiveStage = {
  heading: "Checking",
  tone: "",
  text: "The deadline has passed. Checking the network for the outcome.",
  stake: "vault",
  bubble: null,
  chain: ["Open"],
};

/** @trace LLR-FE-040 */
export function liveStage(state: PledgeState, checking = false): LiveStage {
  if (checking && state === "Active") return CHECKING; // LLR-FE-040
  return STAGES[state];
}

/**
 * Where chain time falls on the example's axis, so the live clock reuses the design's layout: creation at day
 * 0 and the deadline at day 7, with the same scale carried on to the end. Null while chain time is unknown.
 *
 * @trace LLR-FE-012
 */
export function liveTime(createdAt: bigint, deadline: bigint, now: bigint | null): number | null {
  if (now === null) return null; // LLR-FE-012
  const span = deadline - createdAt;
  if (span <= 0n) return now >= deadline ? DEADLINE : 0;
  const elapsed = Number(now - createdAt) / Number(span);
  return Math.min(MAX, Math.max(0, elapsed * DEADLINE));
}
