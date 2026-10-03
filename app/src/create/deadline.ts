/**
 * A custom deadline must be this far past chain time. The contract's own floor is 60 seconds (LLR-SC-005);
 * the extra 30 absorb the time a transaction takes to be included.
 *
 * @trace LLR-FE-031
 */
export const MIN_LEAD_SECONDS = 90n;

/** MAX_DURATION of LLR-SC-005, which the contract refuses a deadline beyond. */
export const MAX_LEAD_SECONDS = 365n * 86_400n;

export type PresetId = "2m" | "1d" | "7d" | "30d";

/** @trace LLR-FE-031 */
export const PRESETS: readonly { id: PresetId; label: string; seconds: bigint }[] = [
  { id: "2m", label: "2 minutes", seconds: 120n },
  { id: "1d", label: "1 day", seconds: 86_400n },
  { id: "7d", label: "7 days", seconds: 604_800n },
  { id: "30d", label: "30 days", seconds: 2_592_000n },
];

export type DeadlineChoice = { kind: "none" } | { kind: "preset"; id: PresetId } | { kind: "custom"; local: string };

export type CustomCheck = "ok" | "invalid" | "tooSoon" | "tooFar" | "noClock";

/**
 * A preset is an offset from chain time, and the caller reads chain time just before sending, so time spent
 * on an approval is not taken out of it.
 *
 * @trace LLR-FE-031
 */
export function presetDeadline(chainNow: bigint, seconds: bigint): bigint {
  return chainNow + seconds;
}

const pad = (n: number) => String(n).padStart(2, "0");

// The value a datetime-local input takes for a Unix second: the visitor's own zone, to the minute.
function toLocalInput(timestamp: bigint): string {
  const d = new Date(Number(timestamp) * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The earliest and latest time the date field should offer for a chain time. The field works to the minute, so
 * each bound moves inward to the next whole minute and never outward: every time it offers passes the check.
 *
 * @trace LLR-FE-031
 */
export function deadlineBounds(chainNow: bigint): { min: string; max: string } {
  const earliest = chainNow + MIN_LEAD_SECONDS;
  const latest = chainNow + MAX_LEAD_SECONDS;
  return {
    min: toLocalInput(((earliest + 59n) / 60n) * 60n), // LLR-FE-031
    max: toLocalInput((latest / 60n) * 60n), // LLR-FE-031
  };
}

// A date and time with no zone, which is what a datetime-local input produces. A date alone is refused: the
// Date parser reads it as UTC and every other form as local time, which would move the deadline by the offset.
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

/**
 * The Unix second a datetime-local value names in the visitor's own time zone. The device's clock is not read:
 * only its zone rules are used, to say what the visitor's "2:30 pm" is.
 *
 * @trace LLR-FE-031
 */
export function localToTimestamp(local: string): bigint | null {
  if (!LOCAL.test(local)) return null;
  const ms = new Date(local).getTime();
  return Number.isNaN(ms) ? null : BigInt(Math.floor(ms / 1000));
}

/**
 * Judges a custom deadline against chain time and not the device's clock (01 V-10).
 *
 * @trace LLR-FE-031
 */
export function checkCustomDeadline(timestamp: bigint | null, chainNow: bigint | null): CustomCheck {
  if (timestamp === null) return "invalid";
  if (chainNow === null) return "noClock";
  if (timestamp < chainNow + MIN_LEAD_SECONDS) return "tooSoon"; // LLR-FE-031
  if (timestamp > chainNow + MAX_LEAD_SECONDS) return "tooFar"; // LLR-FE-031
  return "ok";
}
