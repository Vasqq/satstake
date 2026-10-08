import { describe, expect, it } from "vitest";
import { DEADLINE_PASSED, NOT_SYNCED, formatClock, formatRemaining } from "./countdown";

const MIN = 60n;
const HOUR = 3600n;
const DAY = 86_400n;

describe("LLR-FE-012 the countdown text from the time remaining", () => {
  it("says the time is being read while the clock has not synced", () => {
    expect(NOT_SYNCED).toBe("Reading the time from the network");
    expect(formatRemaining(null)).toBe("Reading the time from the network");
  });

  it("says the deadline passed at zero and below", () => {
    expect(DEADLINE_PASSED).toBe("Deadline passed");
    expect(formatRemaining(0n)).toBe("Deadline passed");
    expect(formatRemaining(-1n)).toBe("Deadline passed");
    expect(formatRemaining(-100_000n)).toBe("Deadline passed");
  });

  it("counts days and hours from one day up", () => {
    expect(formatRemaining(DAY)).toBe("1 day 0 hours");
    expect(formatRemaining(2n * DAY + 4n * HOUR)).toBe("2 days 4 hours");
    expect(formatRemaining(2n * DAY + 4n * HOUR + 59n * MIN + 59n)).toBe("2 days 4 hours");
    expect(formatRemaining(DAY + HOUR)).toBe("1 day 1 hour");
  });

  it("counts hours and minutes from one hour up to one day", () => {
    expect(formatRemaining(DAY - 1n)).toBe("23 hours 59 minutes");
    expect(formatRemaining(HOUR)).toBe("1 hour 0 minutes");
    expect(formatRemaining(3n * HOUR + 5n * MIN + 30n)).toBe("3 hours 5 minutes");
    expect(formatRemaining(HOUR + MIN)).toBe("1 hour 1 minute");
  });

  it("counts minutes and seconds from one minute up to one hour", () => {
    expect(formatRemaining(HOUR - 1n)).toBe("59 minutes 59 seconds");
    expect(formatRemaining(MIN)).toBe("1 minute 0 seconds");
    expect(formatRemaining(5n * MIN + 7n)).toBe("5 minutes 7 seconds");
    expect(formatRemaining(MIN + 1n)).toBe("1 minute 1 second");
  });

  it("counts seconds alone below one minute", () => {
    expect(formatRemaining(MIN - 1n)).toBe("59 seconds");
    expect(formatRemaining(2n)).toBe("2 seconds");
    expect(formatRemaining(1n)).toBe("1 second");
  });
});

describe("LLR-FE-012 the countdown as a clock of four units", () => {
  it("writes each unit with at least two digits", () => {
    expect(formatClock(26n * DAY + 4n * HOUR + 12n * MIN + 9n)).toEqual({ d: "26", h: "04", m: "12", s: "09" });
    expect(formatClock(5n * DAY + 3n * HOUR + 7n * MIN + 1n)).toEqual({ d: "05", h: "03", m: "07", s: "01" });
  });

  it("keeps three digits for a hundred days or more and does not cap the days", () => {
    expect(formatClock(100n * DAY)).toEqual({ d: "100", h: "00", m: "00", s: "00" });
    expect(formatClock(365n * DAY + 23n * HOUR + 59n * MIN + 59n)).toEqual({ d: "365", h: "23", m: "59", s: "59" });
  });

  it("carries each unit at its boundary", () => {
    expect(formatClock(59n)).toEqual({ d: "00", h: "00", m: "00", s: "59" });
    expect(formatClock(60n)).toEqual({ d: "00", h: "00", m: "01", s: "00" });
    expect(formatClock(3599n)).toEqual({ d: "00", h: "00", m: "59", s: "59" });
    expect(formatClock(3600n)).toEqual({ d: "00", h: "01", m: "00", s: "00" });
    expect(formatClock(86_399n)).toEqual({ d: "00", h: "23", m: "59", s: "59" });
    expect(formatClock(86_400n)).toEqual({ d: "01", h: "00", m: "00", s: "00" });
  });

  it("reads zero and anything below as all zeros", () => {
    const zero = { d: "00", h: "00", m: "00", s: "00" };
    expect(formatClock(0n)).toEqual(zero);
    expect(formatClock(-1n)).toEqual(zero);
    expect(formatClock(-100_000n)).toEqual(zero);
  });
});
