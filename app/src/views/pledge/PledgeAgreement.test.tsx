import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalTime, shorten } from "../../format";
import { BENEFICIARY, REFEREE, STAKER, cirbtc, openPledge, signature, usdc } from "../../test/pledgeHarness";
import { network, shortOf, teardownWallets } from "../../test/walletHarness";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
  teardownWallets();
});

const main = () => within(screen.getByRole("main"));
const loaded = () => main().findByText(/^“/, { selector: ".ptitle" });
const lines = () => [...document.querySelectorAll(".doc ol > li")] as HTMLElement[];

describe("LLR-FE-040 the pledge page is the agreement, with this promise's values", () => {
  it("titles the document Promise #id and names the network and where the source is verified", async () => {
    await openPledge();
    await loaded();
    expect(document.querySelector(".doc h3")!.textContent).toBe("Promise #1");
    const meta = document.querySelector(".doc .meta")!.textContent!;
    expect(meta).toContain(network.name);
    expect(meta).toContain("Sourcify");
  });

  it("is not labelled an example, since it is a real promise", async () => {
    await openPledge();
    await loaded();
    expect(document.querySelector(".doc")!.textContent).not.toMatch(/example/i);
  });

  it("has the seven lines, with the real stake in the first and the real deadline in the second", async () => {
    const { pledge } = await openPledge({ token: usdc.address, amount: 7_250_000n });
    await loaded();
    expect(lines()).toHaveLength(7);
    expect(lines()[0]!.textContent).toContain("$7.25 in USDC");
    expect(lines()[1]!.textContent).toContain(formatLocalTime(pledge.deadline));
  });

  it("writes a cirBTC stake in sats with the cirBTC amount, and explains the unit under that line only", async () => {
    await openPledge({ token: cirbtc.address, amount: 10_000n });
    await loaded();
    expect(lines()[0]!.textContent).toContain("10,000 sats (0.0001 cirBTC)");
    expect(lines()[0]!.textContent).toContain("A sat is the smallest unit of Bitcoin.");
    expect(lines().filter((li) => li.textContent!.includes("smallest unit"))).toHaveLength(1);
  });

  it("shows neither the agreement nor the clock before the pledge is read", async () => {
    await openPledge({
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.functionName === "getPledge" ? new Promise<void>(() => {}) : undefined);
      },
    });
    expect(document.querySelector(".doc")).toBeNull();
    expect(document.querySelector(".clock-card")).toBeNull();
  });

  it("offers Read as with the four roles, none chosen to begin with", async () => {
    await openPledge();
    await loaded();
    const group = main().getByRole("group", { name: "Read as" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Staker", "Referee", "Beneficiary", "Anyone"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false"]);
  });

  it("lights the lines that apply to the role chosen, and puts them out again when it is chosen twice", async () => {
    await openPledge();
    await loaded();
    const referee = within(main().getByRole("group", { name: "Read as" })).getByRole("button", { name: "Referee" });
    fireEvent.click(referee);
    expect(lines().map((li) => li.classList.contains("hit"))).toEqual([false, true, true, true, false, false, true]);
    expect(document.querySelector(".doc")!.classList.contains("focus")).toBe(true);
    fireEvent.click(referee);
    expect(lines().some((li) => li.classList.contains("hit"))).toBe(false);
  });

  it("lights the lines for a role when its signature line is chosen", async () => {
    await openPledge();
    await loaded();
    fireEvent.click(signature("Beneficiary"));
    expect(lines().map((li) => li.classList.contains("hit"))).toEqual([false, false, false, true, false, false, true]);
  });

  it("keeps Read as unchosen for the connected role, so the document reads the same to everyone until they choose", async () => {
    await openPledge({ who: "referee" });
    await loaded();
    expect(lines().some((li) => li.classList.contains("hit"))).toBe(false);
  });

  it("copies an address from its signature line without choosing a role", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await openPledge();
    await loaded();
    fireEvent.click(within(signature("Referee")).getByRole("button", { name: "Copy the referee's address" }));
    await screen.findByText("Copied.");
    expect(writeText).toHaveBeenCalledWith(REFEREE);
    expect(document.querySelector(".doc")!.classList.contains("focus")).toBe(false);
  });

  it("does not choose a role when the explorer link is followed", async () => {
    await openPledge();
    await loaded();
    const link = within(signature("Staker")).getByRole("link", { name: "View on explorer, the staker" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(document.querySelector(".doc")!.classList.contains("focus")).toBe(false);
  });

  it("shows the three addresses in full on their titles, shortened in the text", async () => {
    await openPledge();
    await loaded();
    for (const [label, address] of [["Staker", STAKER], ["Referee", REFEREE], ["Beneficiary", BENEFICIARY]] as const) {
      expect(within(signature(label)).getByText(shortOf(address)).getAttribute("title")).toBe(address);
    }
  });
});

describe("LLR-FE-040 the signature lines say only what the contract's state proves", () => {
  const line = (label: "Staker" | "Referee" | "Beneficiary") => signature(label).querySelector(".line")!.textContent;

  it("shows the staker as signed on every promise, since creating it was their transaction", async () => {
    await openPledge();
    await loaded();
    expect(line("Staker")).toBe("signed");
  });

  it("leaves the referee's and the beneficiary's lines empty while open", async () => {
    await openPledge();
    await loaded();
    expect(line("Referee")).toBe("");
    expect(line("Beneficiary")).toBe("");
  });

  it("writes the verdict on the referee's line when the state proves it, and says no answer for silence", async () => {
    const expected = [
      [1, "no answer", -10n],
      [2, "Kept", 500_000n],
      [3, "Broken", 500_000n],
      [4, "Kept", 500_000n],
    ] as const;
    for (const [state, text, secondsLeft] of expected) {
      await openPledge({ state, secondsLeft });
      await loaded();
      expect(line("Referee"), `state ${state}`).toBe(text);
      teardownWallets();
    }
  });

  it("writes nothing on the referee's line after a payout to the beneficiary, since the state does not say which it was", async () => {
    await openPledge({ state: 5 });
    await loaded();
    expect(line("Referee")).toBe("");
  });

  it("writes nothing on the referee's line in the moment past the deadline before the state is confirmed", async () => {
    await openPledge({ secondsLeft: -5n });
    await screen.findByText("Deadline passed", { selector: ".clock-card .day" });
    expect(line("Referee")).toBe("");
  });
});

describe("LLR-FE-021 the promise page reads fully without a wallet", () => {
  it("shows the agreement, the clock and the three parties, and asks for nothing but a wallet to act", async () => {
    await openPledge({ who: "none" });
    await loaded();
    expect(document.querySelector(".doc")).not.toBeNull();
    expect(document.querySelector(".clock-card")).not.toBeNull();
    expect(document.querySelectorAll(".sig")).toHaveLength(3);
    expect(main().queryByRole("button", { name: /^(Kept|Broken|Send payout)$/ })).toBeNull();
    expect(main().getByText("Connect a wallet to act.")).toBeTruthy();
  });
});

describe("LLR-FE-040 a signature line reads as the design's: the note follows the address on its line, and (you) follows the role", () => {
  it("puts the referee's and the beneficiary's note on the line of the address, before its copy controls", async () => {
    await openPledge({ who: "none" });
    await loaded();
    for (const [label, party, note] of [
      ["Referee", REFEREE, "rules once"],
      ["Beneficiary", BENEFICIARY, "receives if broken or silent"],
    ] as const) {
      const row = signature(label);
      const inline = row.querySelector(".hash-line") as HTMLElement;
      expect(inline.textContent, label).toBe(`${shorten(party)}\u00a0· ${note}`);
      // The dot is bound to the address, so a line that wraps never begins with it.
      expect(inline.querySelector(".hash-text")?.nextSibling?.textContent).toBe(`\u00a0· ${note}`);
      const controls = row.querySelector(".hash-controls") as HTMLElement;
      expect(inline.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING, label).toBeTruthy();
      expect(row.textContent!.split(note), label).toHaveLength(2);
    }
  });

  it("gives the staker no note", async () => {
    await openPledge({ who: "none" });
    await loaded();
    expect(signature("Staker").querySelector(".hash-line")?.textContent).toBe(shorten(STAKER));
  });

  it("writes (you) in the role's name, and not after the address", async () => {
    await openPledge({ who: "referee" });
    await loaded();
    const mark = within(signature("Referee")).getByText("(you)");
    expect(mark.parentElement?.tagName).toBe("B");
    expect(mark.parentElement?.textContent).toBe("Referee (you)");
    expect(signature("Referee").querySelector(".hash-value")?.textContent).not.toContain("(you)");
  });
});
