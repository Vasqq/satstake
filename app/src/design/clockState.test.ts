import { describe, expect, it } from "vitest";
import { PLEDGE_STATES } from "../chain/reads";
import { DEADLINE, MAX, VERDICT_DAY, demoState, liveStage, liveTime } from "./clockState";

describe("LLR-FE-040 the example clock plays the three endings the contract has", () => {
  it("is locking, then open, then the verdict the referee gave, then paid", () => {
    expect(demoState("kept", 0.3).k).toBe("locking");
    expect(demoState("kept", 2.2).k).toBe("open");
    expect(demoState("kept", VERDICT_DAY).k).toBe("kept");
    expect(demoState("kept", VERDICT_DAY + 1).k).toBe("paidback");
    expect(demoState("broken", VERDICT_DAY).k).toBe("broken");
    expect(demoState("broken", MAX).k).toBe("paidout");
  });

  it("treats silence as broken only once the deadline has passed, and pays a day later", () => {
    expect(demoState("silent", VERDICT_DAY).k).toBe("open");
    expect(demoState("silent", DEADLINE).k).toBe("noanswer");
    expect(demoState("silent", DEADLINE).pay).toBe(DEADLINE + 1);
    expect(demoState("silent", DEADLINE + 1).k).toBe("paidout");
  });
});

describe("LLR-FE-040 the live clock maps each derived state to a stage without inventing a day", () => {
  it("maps every state the contract reports to a stage, and the stake sits where the state says", () => {
    const where = Object.fromEntries(PLEDGE_STATES.map((s) => [s, liveStage(s).stake]));
    expect(where).toEqual({
      Active: "vault",
      Expired: "vault",
      Kept: "vault",
      Broken: "vault",
      SettledToStaker: "staker",
      SettledToBeneficiary: "beneficiary",
    });
  });

  it("names the stage in the words of the design and colours a good ending green and a bad one red", () => {
    expect(liveStage("Active")).toMatchObject({ heading: "Open", tone: "" });
    expect(liveStage("Expired")).toMatchObject({ heading: "No answer", tone: "r" });
    expect(liveStage("Kept")).toMatchObject({ heading: "Kept", tone: "g" });
    expect(liveStage("Broken")).toMatchObject({ heading: "Broken", tone: "r" });
    expect(liveStage("SettledToStaker")).toMatchObject({ heading: "Paid back", tone: "g" });
    expect(liveStage("SettledToBeneficiary")).toMatchObject({ heading: "Paid out", tone: "r" });
  });

  it("shows a verdict bubble only for a recorded verdict or an expiry, never for an open pledge", () => {
    expect(liveStage("Active").bubble).toBeNull();
    expect(liveStage("Kept").bubble).toBe("Kept");
    expect(liveStage("Broken").bubble).toBe("Broken");
    expect(liveStage("Expired").bubble).toBe("No answer");
    expect(liveStage("SettledToStaker").bubble).toBe("Kept");
    expect(liveStage("SettledToBeneficiary").bubble).toBeNull();
  });

  it("keeps the chain to stages the pledge can have been through", () => {
    expect(liveStage("Active").chain).toEqual(["Open"]);
    expect(liveStage("SettledToStaker").chain).toEqual(["Open", "Kept", "Paid back"]);
    expect(liveStage("Expired").chain).toEqual(["Open", "No answer"]);
  });
});

describe("LLR-FE-012 the live timeline is placed by chain time and nothing else", () => {
  const created = 1_000n;
  const deadline = 2_000n;
  it("puts creation at the start and the deadline at the design's deadline mark", () => {
    expect(liveTime(created, deadline, created)).toBe(0);
    expect(liveTime(created, deadline, 1_500n)).toBe(DEADLINE / 2);
    expect(liveTime(created, deadline, deadline)).toBe(DEADLINE);
  });

  it("stops at the end of the axis and never goes before creation", () => {
    expect(liveTime(created, deadline, 99_999n)).toBe(MAX);
    expect(liveTime(created, deadline, 500n)).toBe(0);
  });

  it("is null while chain time is not known, so no position is guessed", () => {
    expect(liveTime(created, deadline, null)).toBeNull();
  });

  it("does not divide by zero when the deadline is not after creation", () => {
    expect(liveTime(created, created, created)).toBe(DEADLINE);
  });
});
