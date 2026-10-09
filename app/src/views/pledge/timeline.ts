import type { PledgeState } from "../../chain/reads";

/** done: complete; passed: over without the thing it names happening; now: where the promise stands; ahead: still to come. */
export type StepStatus = "done" | "passed" | "now" | "ahead";

const JUDGED = "Judged";

/**
 * How far the promise has come, as three steps. The second step is called judged only when a verdict is known:
 * an expired promise had none, and after a payout to the beneficiary the page cannot tell a broken verdict
 * from silence, because it reads no event logs. Once paid, the last step stays marked as where it ended.
 *
 * @trace LLR-FE-040
 */
export function timelineOf(state: PledgeState): { label: string; status: StepStatus }[] {
  const made = { label: "Made", status: "done" as const };
  if (state === "Active") return [made, { label: JUDGED, status: "now" }, { label: "Paid out", status: "ahead" }]; // LLR-FE-040
  const second =
    state === "Expired"
      ? { label: "No answer", status: "passed" as const } // LLR-FE-040
      : state === "SettledToBeneficiary"
        ? { label: "Broken or no answer", status: "passed" as const } // LLR-FE-040
        : { label: JUDGED, status: "done" as const };
  return [made, second, { label: "Paid out", status: "now" }];
}
