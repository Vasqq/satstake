/** @trace LLR-FE-012 */
export const NOT_SYNCED = "Reading the time from the network";
/** @trace LLR-FE-012 */
export const DEADLINE_PASSED = "Deadline passed";

const MINUTE = 60n;
const HOUR = 3600n;
const DAY = 86_400n;

const unit = (count: bigint, word: string) => `${count.toString()} ${word}${count === 1n ? "" : "s"}`;

const twoDigits = (n: bigint) => n.toString().padStart(2, "0");

/**
 * The time left as four units for the large clock face. Days are not capped and take as many digits as they
 * need; the other units carry at their boundary. Zero or below reads as all zeros, since a clock never counts
 * past the deadline.
 *
 * @trace LLR-FE-012
 */
export function formatClock(remaining: bigint): { d: string; h: string; m: string; s: string } {
  const left = remaining > 0n ? remaining : 0n; // LLR-FE-012
  return {
    d: twoDigits(left / DAY),
    h: twoDigits((left % DAY) / HOUR),
    m: twoDigits((left % HOUR) / MINUTE),
    s: twoDigits(left % MINUTE),
  };
}

/**
 * The time left as the two largest units that apply, so a reader sees the part that changes the plan: days and
 * hours far out, seconds close in. The input is chain time remaining, never the device clock.
 *
 * @trace LLR-FE-012
 */
export function formatRemaining(remaining: bigint | null): string {
  if (remaining === null) return NOT_SYNCED; // LLR-FE-012
  if (remaining <= 0n) return DEADLINE_PASSED; // LLR-FE-012
  if (remaining >= DAY) return `${unit(remaining / DAY, "day")} ${unit((remaining % DAY) / HOUR, "hour")}`;
  if (remaining >= HOUR) return `${unit(remaining / HOUR, "hour")} ${unit((remaining % HOUR) / MINUTE, "minute")}`;
  if (remaining >= MINUTE) return `${unit(remaining / MINUTE, "minute")} ${unit(remaining % MINUTE, "second")}`;
  return unit(remaining, "second");
}
