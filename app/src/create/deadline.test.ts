import { describe, expect, it } from "vitest";
import {
  MAX_LEAD_SECONDS,
  MIN_LEAD_SECONDS,
  PRESETS,
  checkCustomDeadline,
  deadlineBounds,
  localToTimestamp,
  presetDeadline,
} from "./deadline";

const NOW = 1_789_500_000n;

describe("LLR-FE-031 LLR-VV-006 the deadline input offers four presets and a custom date and time", () => {
  it("offers 2 minutes, 1 day, 7 days, and 30 days, in that order, and nothing else", () => {
    expect(PRESETS.map((p) => [p.label, p.seconds])).toEqual([
      ["2 minutes", 120n],
      ["1 day", 86_400n],
      ["7 days", 604_800n],
      ["30 days", 2_592_000n],
    ]);
  });

  it("gives each preset an identifier of its own", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it("computes a preset deadline as the chain time it is given plus the preset's seconds", () => {
    for (const preset of PRESETS) expect(presetDeadline(NOW, preset.seconds)).toBe(NOW + preset.seconds);
    expect(presetDeadline(NOW + 500n, 120n)).toBe(NOW + 620n);
  });
});

describe("LLR-FE-031 a custom deadline earlier than chain time plus 90 seconds is rejected", () => {
  it("states the two limits: 90 seconds ahead and one year (365 days) ahead", () => {
    expect(MIN_LEAD_SECONDS).toBe(90n);
    expect(MAX_LEAD_SECONDS).toBe(365n * 86_400n);
  });

  it("rejects 89 seconds ahead and accepts 90 and 91", () => {
    expect(checkCustomDeadline(NOW + 89n, NOW)).toBe("tooSoon");
    expect(checkCustomDeadline(NOW + 90n, NOW)).toBe("ok");
    expect(checkCustomDeadline(NOW + 91n, NOW)).toBe("ok");
  });

  it("rejects a time already past, and the chain time itself", () => {
    expect(checkCustomDeadline(NOW - 1n, NOW)).toBe("tooSoon");
    expect(checkCustomDeadline(NOW, NOW)).toBe("tooSoon");
    expect(checkCustomDeadline(0n, NOW)).toBe("tooSoon");
  });

  it("accepts exactly 365 days ahead and rejects one second more", () => {
    expect(checkCustomDeadline(NOW + MAX_LEAD_SECONDS, NOW)).toBe("ok");
    expect(checkCustomDeadline(NOW + MAX_LEAD_SECONDS + 1n, NOW)).toBe("tooFar");
  });

  it("says it cannot judge before chain time is known, and that nothing was entered when it was not", () => {
    expect(checkCustomDeadline(NOW + 3_600n, null)).toBe("noClock");
    expect(checkCustomDeadline(null, NOW)).toBe("invalid");
    expect(checkCustomDeadline(null, null)).toBe("invalid");
  });
});

describe("LLR-FE-031 the custom date and time is read as the visitor's local time", () => {
  it("reads a local date and time to the Unix second it names there", () => {
    expect(localToTimestamp("2026-10-03T12:30")).toBe(BigInt(Math.floor(new Date(2026, 9, 3, 12, 30).getTime() / 1000)));
    expect(localToTimestamp("2026-10-03T12:30:15")).toBe(BigInt(Math.floor(new Date(2026, 9, 3, 12, 30, 15).getTime() / 1000)));
  });

  it("refuses anything that is not a local date and time, including a date alone, which a browser reads as UTC", () => {
    for (const text of ["", "garbage", "2026-10-03", "2026-13-45T00:00", "2026-10-03T25:00", "2026-10-03T12:30Z", "2026-10-03T12:30+02:00", " 2026-10-03T12:30"]) {
      expect(localToTimestamp(text), text).toBeNull();
    }
  });
});

describe("LLR-FE-031 the date field offers only times the form would accept", () => {
  // The field has a precision of a minute, so each bound is moved inward to the next minute and never outward.
  const chainNows = [NOW, NOW + 1n, NOW + 59n, NOW + 31n * 86_400n + 17n];

  it.each(chainNows)("gives a minimum no earlier than 90 seconds past chain time %s, and within a minute of it", (now) => {
    const { min } = deadlineBounds(now);
    expect(min).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const at = localToTimestamp(min) as bigint;
    expect(at).toBeGreaterThanOrEqual(now + MIN_LEAD_SECONDS);
    expect(at).toBeLessThan(now + MIN_LEAD_SECONDS + 60n);
  });

  it.each(chainNows)("gives a maximum no later than a year past chain time %s, and within a minute of it", (now) => {
    const { max } = deadlineBounds(now);
    expect(max).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    const at = localToTimestamp(max) as bigint;
    expect(at).toBeLessThanOrEqual(now + MAX_LEAD_SECONDS);
    expect(at).toBeGreaterThan(now + MAX_LEAD_SECONDS - 60n);
  });

  it("gives bounds that the check itself accepts at both ends", () => {
    const { min, max } = deadlineBounds(NOW + 41n);
    expect(checkCustomDeadline(localToTimestamp(min), NOW + 41n)).toBe("ok");
    expect(checkCustomDeadline(localToTimestamp(max), NOW + 41n)).toBe("ok");
  });
});
