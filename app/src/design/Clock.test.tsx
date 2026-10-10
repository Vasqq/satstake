import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Clock } from "./Clock";

afterEach(cleanup);

const base = { createdAt: 1_000n, deadline: 2_000n, amountLabel: "$5.00 in USDC" };

describe("LLR-FE-040 the example clock is labelled as an example and can be played with", () => {
  it("says it is an example, offers the three referee scenarios, and has a time slider", () => {
    render(<Clock mode="demo" />);
    expect(screen.getByText(/example/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { pressed: true }).length).toBe(1);
    expect(screen.getByRole("button", { name: "Says Kept on day 4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Says Broken on day 4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Says nothing" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Time" })).toBeTruthy();
  });

  it("moves the slider with the arrow keys and Home and End, and tells the ending on the way", () => {
    render(<Clock mode="demo" />);
    const slider = screen.getByRole("slider", { name: "Time" });
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider.getAttribute("aria-valuenow")).toBe("10");
    expect(screen.getAllByText("Paid back").length).toBeGreaterThan(0);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuenow")).toBe("0.3");
  });

  it("replays the same week under the scenario chosen", () => {
    render(<Clock mode="demo" />);
    const slider = screen.getByRole("slider", { name: "Time" });
    fireEvent.click(screen.getByRole("button", { name: "Says Broken on day 4" }));
    fireEvent.keyDown(slider, { key: "End" });
    expect(screen.getAllByText("Paid out").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Says nothing" }));
    expect(screen.getAllByText(/Silence counts as broken|No answer|Paid out/).length).toBeGreaterThan(0);
    expect(document.querySelector(".mk")).toBeTruthy();
  });
});

describe("LLR-FE-040 the live clock shows the pledge as it is and invents nothing", () => {
  it("has no scenario buttons, no slider, no verdict mark, no payout mark and no example label", () => {
    render(<Clock mode="live" {...base} now={1_500n} state="Active" />);
    expect(screen.queryByRole("button", { name: /Says/ })).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /Play/ })).toBeNull();
    expect(screen.queryByText(/example/i)).toBeNull();
    const marks = [...document.querySelectorAll(".mk")].map((m) => m.textContent);
    expect(marks).toEqual(["deadline"]);
  });

  it("states the pledge's own state and amount", () => {
    render(<Clock mode="live" {...base} now={1_500n} state="Active" />);
    expect(screen.getByRole("heading", { name: "Open" })).toBeTruthy();
    expect(document.body.textContent).toContain("$5.00 in USDC");
  });

  it("maps each derived state to its heading", () => {
    const expected: [Parameters<typeof Clock>[0] extends infer P ? (P extends { state: infer S } ? S : never) : never, string][] = [
      ["Expired", "No answer"],
      ["Kept", "Kept"],
      ["Broken", "Broken"],
      ["SettledToStaker", "Paid back"],
      ["SettledToBeneficiary", "Paid out"],
    ];
    for (const [state, heading] of expected) {
      const view = render(<Clock mode="live" {...base} now={2_500n} state={state} />);
      expect(screen.getByRole("heading", { name: heading }), state).toBeTruthy();
      view.unmount();
    }
  });

  it("puts the knob by chain time, halfway to the deadline at half the duration", () => {
    render(<Clock mode="live" {...base} now={1_500n} state="Active" />);
    const knob = document.querySelector(".knob") as HTMLElement;
    expect(knob.style.left).toBe("35%");
  });

  it("says the time is being read, and places no knob guess, until chain time is known", () => {
    render(<Clock mode="live" {...base} now={null} state="Active" />);
    expect(screen.getByText("Reading the time from the network")).toBeTruthy();
    expect((document.querySelector(".knob") as HTMLElement).style.left).toBe("0%");
  });

  it("says the deadline has passed once chain time is at the deadline", () => {
    render(<Clock mode="live" {...base} now={2_000n} state="Expired" />);
    expect(document.querySelector(".day")?.textContent).toBe("Deadline passed");
  });

  it("keeps the referee's address while the pledge is open and says the referee can no longer vote once it is not", () => {
    const parties = { staker: "0xaaaa…bbbb", referee: "0xcccc…dddd", beneficiary: "0xeeee…ffff" };
    const open = render(<Clock mode="live" {...base} now={1_500n} state="Active" {...parties} />);
    expect(open.container.textContent).toContain("0xcccc…dddd");
    expect(open.container.textContent).not.toContain("can’t vote now");
    open.unmount();
    for (const state of ["Expired", "Kept", "Broken", "SettledToStaker", "SettledToBeneficiary"] as const) {
      const view = render(<Clock mode="live" {...base} now={2_500n} state={state} {...parties} />);
      expect(view.container.textContent, state).toContain("can’t vote now");
      view.unmount();
    }
  });

  it("names the parties when it is given them, and says nothing about them when it is not", () => {
    const view = render(
      <Clock mode="live" {...base} now={1_500n} state="Active" staker="0xaaaa…bbbb" referee="0xcccc…dddd" beneficiary="0xeeee…ffff" />,
    );
    expect(view.container.textContent).toContain("0xaaaa…bbbb");
    expect(view.container.textContent).toContain("0xeeee…ffff");
    view.unmount();
    const bare = render(<Clock mode="live" {...base} now={1_500n} state="Active" />);
    expect(bare.container.textContent).not.toContain("0x");
  });

  it("ticks time as chain time, with no device clock involved", async () => {
    const view = render(<Clock mode="live" {...base} now={1_500n} state="Active" />);
    view.rerender(<Clock mode="live" {...base} now={1_800n} state="Active" />);
    await act(async () => {});
    expect((document.querySelector(".knob") as HTMLElement).style.left).toBe("56%");
  });

  it("announces nothing by itself in live mode, since the page keeps its own status line", () => {
    render(<Clock mode="live" {...base} now={1_500n} state="Active" />);
    expect(document.querySelector("[aria-live]")).toBeNull();
  });

  it("keeps the time-left line outside the announced region in the example, so scrubbing does not read it out twice", () => {
    render(<Clock mode="demo" />);
    const day = document.querySelector(".day") as HTMLElement;
    expect(day.closest("[aria-live]")).toBeNull();
    expect(document.querySelector(".state [aria-live=polite] h3")).not.toBeNull();
  });

  it("counts down only while a deadline still decides something, and says nothing about time after a verdict or a payout", () => {
    for (const state of ["Kept", "Broken", "SettledToStaker", "SettledToBeneficiary"] as const) {
      const view = render(<Clock mode="live" {...base} now={1_500n} state={state} />);
      expect(document.querySelector(".day"), state).toBeNull();
      view.unmount();
    }
    const open = render(<Clock mode="live" {...base} now={1_500n} state="Active" />);
    expect(document.querySelector(".day")?.textContent).toBe("Deadline in 8 minutes 20 seconds");
    open.unmount();
  });

  it("reads Expired as passed whatever chain time says, even before it is known", () => {
    const early = render(<Clock mode="live" {...base} now={1_500n} state="Expired" />);
    expect(document.querySelector(".day")?.textContent).toBe("Deadline passed");
    early.unmount();
    render(<Clock mode="live" {...base} now={null} state="Expired" />);
    expect(document.querySelector(".day")?.textContent).toBe("Deadline passed");
  });

  it("says it is checking, not that there was no answer, when asked to by the page", () => {
    render(<Clock mode="live" {...base} now={2_100n} state="Active" checking />);
    expect(screen.getByRole("heading", { name: "Checking" })).toBeTruthy();
    expect(document.querySelector(".state")?.textContent).toContain("Checking the network for the outcome");
    expect(document.querySelector(".state")?.textContent).not.toMatch(/No answer|Silence counts/);
    expect(document.querySelector(".bubble")).toBeNull();
  });

  it("says checking only for an Active state, never over a verdict or a payout that is already known", () => {
    for (const state of ["Expired", "Kept", "Broken", "SettledToStaker", "SettledToBeneficiary"] as const) {
      const view = render(<Clock mode="live" {...base} now={2_100n} state={state} checking />);
      expect(screen.queryByRole("heading", { name: "Checking" }), state).toBeNull();
      view.unmount();
    }
  });
});

