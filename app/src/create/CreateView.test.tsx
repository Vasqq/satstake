import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { type Abi, encodeErrorResult, getAddress, parseUnits } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { satStakeAbi } from "../abi";
import { formatLocalTime } from "../format";
import { REJECTED_MESSAGE, FAILED_MESSAGE } from "../wallet/failure";
import {
  ACK_TEXT,
  BENEFICIARY,
  REFEREE,
  chooseDeadline,
  cirbtc,
  click,
  field,
  fill,
  isDisabled,
  localInput,
  openCreate,
  ready,
  submit,
  tickAcknowledgement,
  type,
  usdc,
} from "../test/createHarness";
import { type FakeWallet, rejection, walletError } from "../test/fakeWallet";
import { ACCOUNT, FOREIGN_CHAIN, findConnected, network, teardownWallets } from "../test/walletHarness";

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
  teardownWallets();
});

const T0 = 1_789_500_000n;

const describedBy = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id));
const describedText = (element: HTMLElement) => describedBy(element).map((e) => e?.textContent ?? "").join(" ");
const errorElement = (label: string) => describedBy(field(label)).find((e) => e?.classList.contains("field-error")) as HTMLElement;
const warningElement = (label: string) => describedBy(field(label)).find((e) => e?.classList.contains("field-warning")) as HTMLElement;
const errorFor = (label: string) => errorElement(label)?.textContent ?? "";
const notices = () => screen.getByRole("status", { name: "Create notices" });
const progress = () => screen.getByRole("status", { name: "Promise progress" });
const prompts = (wallet: { count: (m: string) => number }) => wallet.count("eth_sendTransaction");

function touchAll() {
  for (const label of ["Promise", "Amount", "Referee address", "Beneficiary address"]) fireEvent.blur(field(label));
  fireEvent.blur(screen.getByRole("radio", { name: "2 minutes" }));
  fireEvent.blur(screen.getByRole("checkbox", { name: ACK_TEXT }));
}

/** Makes the nth transaction the wallet is asked to send fail with the error, and lets the others through. */
function failSend(wallet: FakeWallet, nth: number, error: Error): () => void {
  const original = wallet.onSend as NonNullable<FakeWallet["onSend"]>;
  let calls = 0;
  wallet.onSend = (tx) => {
    calls += 1;
    if (calls === nth) throw error;
    return original(tx);
  };
  return () => {
    wallet.onSend = original;
  };
}

/** Runs `after` once the wallet has returned the hash of the nth transaction it was asked to send. */
function afterSend(wallet: FakeWallet, nth: number, after: () => void): void {
  const original = wallet.onSend as NonNullable<FakeWallet["onSend"]>;
  let calls = 0;
  wallet.onSend = async (tx) => {
    const hash = await original(tx);
    calls += 1;
    if (calls === nth) after();
    return hash;
  };
}

const UNCONFIRMED = "Your promise was sent, but its confirmation could not be read. Check My promises before trying again.";
const keptApproval = (amount: string) => `Your approval of ${amount} is confirmed and stays in place, so trying again asks your wallet once.`;
const UNREAD_BALANCE = "Could not read your balance. Trying again every 5 seconds.";
const LEAVE_RESERVE = "Leave at least 0.05 USDC in this wallet for network fees, which Arc charges in USDC.";
const NEED_RESERVE = "You need at least 0.05 USDC in this wallet to pay network fees, which Arc charges in USDC.";
const PROMPT_HINT = "Your wallet may ask twice: first to let SatStake take exactly this amount, then to create the promise.";

const revertError = (errorName: string, args: unknown[] = []) =>
  Object.assign(new Error("execution reverted"), {
    code: 3,
    data: encodeErrorResult({ abi: satStakeAbi as Abi, errorName, args }),
  });
const tokenRevert = (reason: string) =>
  Object.assign(new Error(`execution reverted: ${reason}`), {
    code: 3,
    data: encodeErrorResult({
      abi: [{ type: "error", name: "Error", inputs: [{ type: "string", name: "message" }] }],
      errorName: "Error",
      args: [reason],
    }),
  });

describe("LLR-FE-030 the create form lays out its fields and shows each failure beside its own field", () => {
  it("has a labelled control for every field, in a form with a name", async () => {
    await openCreate();
    expect(screen.getByRole("heading", { level: 1, name: "New promise" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "New promise" })).toBeTruthy();
    for (const label of ["Promise", "Token", "Amount", "Referee address", "Beneficiary address"]) {
      expect(field(label), label).toBeTruthy();
    }
    expect(screen.getByRole("group", { name: "Deadline" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: ACK_TEXT })).toBeTruthy();
    expect(submit().tagName).toBe("BUTTON");
  });

  it("offers the configured tokens by symbol", async () => {
    await openCreate();
    const options = within(field("Token")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(network.tokens.map((t) => t.symbol));
  });

  it("shows no failure on a form nobody has touched, and submit is disabled", async () => {
    await openCreate();
    for (const label of ["Promise", "Amount", "Referee address", "Beneficiary address"]) expect(errorFor(label), label).toBe("");
    expect(isDisabled(submit())).toBe(true);
  });

  it.each([
    ["Promise", { promise: "" }, "Write the promise you are making."],
    ["Promise", { promise: "a".repeat(281) }, "Shorten the promise to 280 bytes or fewer."],
    ["Promise", { promise: "é".repeat(141) }, "Shorten the promise to 280 bytes or fewer."],
    ["Amount", { amount: "0" }, "Enter an amount above zero."],
    ["Amount", { amount: "1,5" }, "Use digits and at most one decimal point."],
    ["Amount", { amount: "1.1234567" }, "USDC has 6 decimal places. Remove the extra digits."],
    ["Amount", { amount: "100.000001" }, "Your balance is 100 USDC, which is less than this amount."],
    ["Referee address", { referee: "0x12" }, "Enter the referee's address: 0x followed by 40 letters and digits."],
    ["Referee address", { referee: ACCOUNT }, "You cannot be your own referee or beneficiary."],
    ["Referee address", { referee: network.contract }, "The SatStake contract cannot be a party. Enter a person's address."],
    ["Beneficiary address", { beneficiary: "" }, "Enter the beneficiary's address: 0x followed by 40 letters and digits."],
    ["Beneficiary address", { beneficiary: ACCOUNT }, "You cannot be your own referee or beneficiary."],
    ["Beneficiary address", { beneficiary: REFEREE }, "The referee and the beneficiary must be different people."],
  ] as const)("shows the failure of %s beside it for %j", async (label, entry, message) => {
    const { wallet } = await openCreate();
    fill(entry);
    touchAll();
    expect(errorFor(label)).toBe(message);
    expect(field(label).getAttribute("aria-invalid")).toBe("true");
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    expect(prompts(wallet)).toBe(0);
  });

  it("shows a failure for the deadline when none is chosen", async () => {
    await openCreate();
    fill({ deadline: "none" });
    touchAll();
    const group = screen.getByRole("group", { name: "Deadline" });
    expect(describedText(group)).toContain("Choose a deadline.");
    expect(isDisabled(submit())).toBe(true);
  });

  it("shows no failure beside a field that is correct, and does not mark it invalid", async () => {
    await openCreate();
    fill({ promise: "" });
    touchAll();
    expect(errorFor("Amount")).toBe("");
    expect(field("Amount").getAttribute("aria-invalid")).not.toBe("true");
    expect(errorFor("Promise")).not.toBe("");
  });

  it("keeps submit disabled until every check passes, and enables it when the last one does", async () => {
    await openCreate();
    fill();
    await ready();
    const breakers: [string, () => void, () => void][] = [
      ["promise", () => type("Promise", ""), () => type("Promise", "Run 5 km")],
      ["amount", () => type("Amount", "0"), () => type("Amount", "1.5")],
      ["referee", () => type("Referee address", "0x1"), () => type("Referee address", REFEREE)],
      ["beneficiary", () => type("Beneficiary address", REFEREE), () => type("Beneficiary address", BENEFICIARY)],
      ["acknowledgement", () => click(screen.getByRole("checkbox", { name: ACK_TEXT })), () => tickAcknowledgement()],
    ];
    for (const [name, spoil, mend] of breakers) {
      act(spoil);
      expect(isDisabled(submit()), `${name} spoiled`).toBe(true);
      act(mend);
      expect(isDisabled(submit()), `${name} mended`).toBe(false);
    }
  });

  it("names the fields still to complete beside the submit control, and only those", async () => {
    await openCreate();
    fill({ promise: "", amount: "0" });
    const text = describedText(submit());
    expect(text).toContain("Promise");
    expect(text).toContain("Amount");
    expect(text).not.toContain("Referee address");
    expect(text).not.toContain("Deadline");
  });

  it("announces each failure in a region that is in the page before the failure, and links it to its control", async () => {
    await openCreate();
    const before = errorElement("Promise");
    expect(before.getAttribute("aria-live")).toBe("polite");
    fill({ promise: "" });
    touchAll();
    const after = errorElement("Promise");
    expect(after).toBe(before);
    expect(after.textContent).toBe("Write the promise you are making.");
    expect(describedBy(field("Promise"))).toContain(after);
  });
});

describe("LLR-FE-030 a wallet with no tokens cannot start a pledge, and is told why (UJ-04)", () => {
  it("explains a zero balance at once, keeps submit disabled, and raises no wallet prompt", async () => {
    const { wallet, chain } = await openCreate({ balance: 0n });
    fill();
    await waitFor(() => expect(errorFor("Amount")).toBe("You have no USDC in this wallet. Add some, or choose another token."));
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    expect(prompts(wallet)).toBe(0);
    expect(wallet.count("eth_requestAccounts")).toBe(0);
    expect(chain.count("eth_getBalance")).toBe(0);
  });

  it("explains it before anything is typed", async () => {
    await openCreate({ balance: 0n });
    await waitFor(() => expect(errorFor("Amount")).toContain("You have no USDC"));
  });

  it("shows the balance of the chosen token in that token's units, and follows the token", async () => {
    const { chain } = await openCreate({ balance: 150_000_000n });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 150 USDC."));
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 1.5 cirBTC (150,000,000 sats)."));
    expect(chain.count("eth_getBalance")).toBe(0);
    const reads = chain.requests.filter((r) => r.functionName === "balanceOf").map((r) => r.to);
    expect(reads).toContain(usdc.address.toLowerCase());
    expect(reads).toContain(cirbtc.address.toLowerCase());
  });

  it("says the balance could not be read, and keeps submit disabled, when the read fails", async () => {
    const { chain } = await openCreate();
    fill();
    await ready();
    chain.callError = new Error("down");
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await waitFor(() => expect(errorFor("Amount")).toBe(UNREAD_BALANCE));
    expect(isDisabled(submit())).toBe(true);
  });
});

describe("LLR-FE-030 Arc pays fees from the USDC balance, so a USDC stake leaves 0.05 USDC and any other stake needs it", () => {
  it("refuses a USDC amount that leaves less than 0.05 USDC, says why beside the amount, and accepts one that leaves exactly that", async () => {
    const { wallet } = await openCreate({ balance: 1_000_000n });
    fill({ amount: "0.950001" });
    fireEvent.blur(field("Amount"));
    expect(errorFor("Amount")).toBe(LEAVE_RESERVE);
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    expect(prompts(wallet)).toBe(0);
    type("Amount", "0.95");
    expect(errorFor("Amount")).toBe("");
    await ready();
  });

  it("needs 0.05 USDC for a stake in another token, and says so at once beside the amount, before anything is typed", async () => {
    const { wallet } = await openCreate({
      balance: 1_000_000_000n,
      prepare: ({ chain }) => chain.setBalance(usdc.address, ACCOUNT, 49_999n),
    });
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await waitFor(() => expect(errorFor("Amount")).toBe(NEED_RESERVE));
    fill({ token: cirbtc.address, amount: "0.5" });
    expect(errorFor("Amount")).toBe(NEED_RESERVE);
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    expect(prompts(wallet)).toBe(0);
  });

  it("accepts a stake in another token when the USDC balance is exactly 0.05", async () => {
    await openCreate({
      balance: 1_000_000_000n,
      prepare: ({ chain }) => chain.setBalance(usdc.address, ACCOUNT, 50_000n),
    });
    fill({ token: cirbtc.address, amount: "0.5" });
    await ready();
    expect(errorFor("Amount")).toBe("");
  });

  it("reads the USDC balance as the ERC-20 balance of the configured USDC token, never the native balance", async () => {
    const { chain } = await openCreate({ balance: 1_000_000_000n });
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 10 cirBTC"));
    const reads = chain.requests.filter((r) => r.functionName === "balanceOf").map((r) => r.to);
    expect(reads).toContain(usdc.address.toLowerCase());
    expect(reads).toContain(cirbtc.address.toLowerCase());
    expect(chain.count("eth_getBalance")).toBe(0);
  });

  it("reads the USDC balance once when the stake is in USDC, since it is the same balance", async () => {
    const { chain } = await openCreate();
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 100 USDC"));
    expect(chain.requests.filter((r) => r.functionName === "balanceOf" && r.to === usdc.address.toLowerCase())).toHaveLength(1);
  });

  it("says a wallet with none of the token has none, and how to go on", async () => {
    await openCreate({ balance: 0n });
    await waitFor(() => expect(errorFor("Amount")).toBe("You have no USDC in this wallet. Add some, or choose another token."));
  });

  it("calls a balance still being read a hint, and not a failure or a thing still to complete", async () => {
    let open = () => {};
    await openCreate({ prepare: ({ chain }) => void (chain.gate = new Promise<void>((resolve) => (open = resolve))) });
    fill();
    fireEvent.blur(field("Amount"));
    expect(describedText(field("Amount"))).toContain("Reading your balance.");
    expect(errorFor("Amount")).toBe("");
    expect(field("Amount").getAttribute("aria-invalid")).not.toBe("true");
    expect(describedText(submit())).not.toContain("Amount");
    expect(isDisabled(submit())).toBe(true);
    open();
    await ready();
    expect(describedText(field("Amount"))).not.toContain("Reading your balance.");
  });

  it("says a balance that could not be read could not be read, at once, and reads it again every 5 seconds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"], shouldAdvanceTime: true });
    const { chain } = await openCreate({ prepare: ({ chain: c }) => void (c.balanceError = new Error("down")) });
    await waitFor(() => expect(errorFor("Amount")).toBe(UNREAD_BALANCE));
    expect(isDisabled(submit())).toBe(true);
    const reads = () => chain.requests.filter((r) => r.functionName === "balanceOf").length;
    const before = reads();
    chain.balanceError = undefined;
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(reads()).toBe(before);
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 100 USDC"));
    expect(reads()).toBe(before + 1);
    expect(errorFor("Amount")).toBe("");
  });
});

describe("LLR-FE-030 a failure shows once its field has been left, and then follows every change", () => {
  it.each([
    ["Promise", "", "Run 5 km", "Write the promise you are making."],
    ["Amount", "0", "1.5", "Enter an amount above zero."],
    ["Referee address", "0x12", REFEREE, "Enter the referee's address: 0x followed by 40 letters and digits."],
    ["Beneficiary address", "0x12", BENEFICIARY, "Enter the beneficiary's address: 0x followed by 40 letters and digits."],
  ])("%s: nothing while it is typed in, the failure when it is left, and then on every change", async (label, bad, good, message) => {
    await openCreate();
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance"));
    type(label, "x");
    type(label, bad);
    expect(errorFor(label)).toBe("");
    expect(field(label).getAttribute("aria-invalid")).not.toBe("true");
    fireEvent.blur(field(label));
    expect(errorFor(label)).toBe(message);
    type(label, good);
    expect(errorFor(label)).toBe("");
    type(label, bad);
    expect(errorFor(label)).toBe(message);
  });

  it("shows the acknowledgement's failure on the change that unticks it, with no blur", async () => {
    await openCreate();
    const box = screen.getByRole("checkbox", { name: ACK_TEXT });
    click(box);
    expect(describedText(box)).not.toContain("Tick the box");
    click(box);
    expect(describedText(box)).toContain("Tick the box to confirm you understand.");
  });

  it("does not report a custom deadline that is still being chosen, and reports it once the deadline is left", async () => {
    await openCreate();
    chooseDeadline("Custom");
    const group = () => describedText(screen.getByRole("group", { name: "Deadline" }));
    expect(group()).not.toContain("Pick a date and time.");
    const custom = screen.getByLabelText("Custom date and time");
    // Moving from the Custom choice to its date field stays inside the deadline.
    fireEvent.blur(screen.getByRole("radio", { name: "Custom" }), { relatedTarget: custom });
    expect(group()).not.toContain("Pick a date and time.");
    fireEvent.change(custom, { target: { value: localInput(T0 + 60n) } });
    expect(group()).not.toContain("at least 90 seconds");
    fireEvent.blur(custom);
    expect(group()).toContain("at least 90 seconds");
    fireEvent.change(custom, { target: { value: localInput(T0 + 3_600n) } });
    expect(group()).not.toContain("at least 90 seconds");
  });

  it("reports a deadline when focus leaves the choices without one being made", async () => {
    await openCreate();
    fireEvent.blur(screen.getByRole("radio", { name: "2 minutes" }));
    expect(describedText(screen.getByRole("group", { name: "Deadline" }))).toContain("Choose a deadline.");
  });
});

describe("LLR-FE-030 activating the disabled submit shows every failure and moves focus to the first field at fault", () => {
  it("shows every failure of an empty form at once and moves focus to the promise", async () => {
    const { wallet } = await openCreate();
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance"));
    expect(errorFor("Promise")).toBe("");
    click(submit());
    expect(errorFor("Promise")).toBe("Write the promise you are making.");
    expect(errorFor("Amount")).toBe("Enter an amount above zero.");
    expect(errorFor("Referee address")).toBe("Enter the referee's address: 0x followed by 40 letters and digits.");
    expect(errorFor("Beneficiary address")).toBe("Enter the beneficiary's address: 0x followed by 40 letters and digits.");
    expect(describedText(screen.getByRole("group", { name: "Deadline" }))).toContain("Choose a deadline.");
    expect(describedText(screen.getByRole("checkbox", { name: ACK_TEXT }))).toContain("Tick the box to confirm you understand.");
    expect(document.activeElement).toBe(field("Promise"));
    expect(prompts(wallet)).toBe(0);
  });

  it.each([
    ["the amount", { amount: "0" }, () => field("Amount")],
    ["the referee", { referee: "0x12" }, () => field("Referee address")],
    ["the beneficiary", { beneficiary: "0x12" }, () => field("Beneficiary address")],
    ["the first deadline choice", { deadline: "none" }, () => screen.getByRole("radio", { name: "2 minutes" })],
    ["the acknowledgement", { acknowledge: false }, () => screen.getByRole("checkbox", { name: ACK_TEXT })],
  ] as const)("moves focus to %s when it is the first field at fault", async (_name, entry, target) => {
    await openCreate();
    fill(entry);
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance"));
    click(submit());
    expect(document.activeElement).toBe(target());
  });

  it("moves focus to the custom date field when a custom deadline is the fault", async () => {
    await openCreate();
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance"));
    click(submit());
    expect(document.activeElement).toBe(screen.getByLabelText("Custom date and time"));
  });

  it("moves focus to the token when the token is the first fault", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" }) });
    fill();
    await waitFor(() => expect(errorFor("Token")).toContain("cannot be used"));
    click(submit());
    expect(document.activeElement).toBe(field("Token"));
  });

  it("moves focus to the first of several faults, in the order of the form", async () => {
    await openCreate();
    fill({ amount: "0", referee: "0x12" });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance"));
    click(submit());
    expect(document.activeElement).toBe(field("Amount"));
  });

  it("moves no focus when the form is complete and the submit is disabled for another reason", async () => {
    const { wallet } = await openCreate({ walletChain: FOREIGN_CHAIN });
    fill();
    await waitFor(() => expect(describedText(submit())).toContain("another network"));
    click(submit());
    expect(document.activeElement).toBe(document.body);
    expect(prompts(wallet)).toBe(0);
  });
});

describe("LLR-FE-030 the submit control names what is still to complete", () => {
  it("lists the visible names of the fields still to complete, in the order of the form", async () => {
    await openCreate();
    await waitFor(() => expect(describedText(submit())).not.toContain("Checking the tokens."));
    expect(describedText(submit())).toContain(
      "Still to complete: Promise, Amount, Referee address, Beneficiary address, Deadline, the box confirming you understand.",
    );
  });

  it("does not list a token that is switched off, since the field itself says so", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" }) });
    fill();
    await waitFor(() => expect(errorFor("Token")).toContain("cannot be used"));
    expect(describedText(submit())).not.toContain("Token");
    expect(describedText(submit())).not.toContain("Still to complete");
    expect(isDisabled(submit())).toBe(true);
  });

  it("says the tokens are being checked until their first reading has come back", async () => {
    let open = () => {};
    await openCreate({ prepare: ({ chain }) => void (chain.gate = new Promise<void>((resolve) => (open = resolve))) });
    fill();
    expect(describedText(submit())).toContain("Checking the tokens.");
    expect(isDisabled(submit())).toBe(true);
    open();
    await ready();
    expect(describedText(submit())).not.toContain("Checking the tokens.");
  });
});

describe("LLR-FE-031 the deadline is a preset or a custom date and time, judged against chain time", () => {
  it("offers the four presets and a custom choice, as radio buttons in one group", async () => {
    await openCreate();
    const group = screen.getByRole("group", { name: "Deadline" });
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("aria-label") ?? r.closest("label")?.textContent)).toEqual([
      "2 minutes",
      "1 day",
      "7 days",
      "30 days",
      "Custom",
    ]);
  });

  it("shows the date and time field only for the custom choice", async () => {
    await openCreate();
    expect(screen.queryByLabelText("Custom date and time")).toBeNull();
    chooseDeadline("Custom");
    expect((screen.getByLabelText("Custom date and time") as HTMLInputElement).type).toBe("datetime-local");
    chooseDeadline("7 days");
    expect(screen.queryByLabelText("Custom date and time")).toBeNull();
  });

  it("rejects a custom time less than 90 seconds from chain time and accepts one two minutes on", async () => {
    await openCreate();
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 60n) } });
    touchAll();
    fireEvent.blur(screen.getByLabelText("Custom date and time"));
    await waitFor(() => expect(describedText(screen.getByRole("group", { name: "Deadline" }))).toContain("at least 90 seconds"));
    expect(isDisabled(submit())).toBe(true);
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 120n) } });
    await ready();
    expect(describedText(screen.getByRole("group", { name: "Deadline" }))).not.toContain("at least 90 seconds");
  });

  it("judges a custom time against chain time and not the device's clock", async () => {
    // The device says 2030, five years after the chain. A time a few minutes after the chain's is then in the
    // device's past, and must still pass; a time before the chain's must still fail.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2031-01-01T00:00:00Z") });
    await openCreate();
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 3_600n) } });
    await ready();
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 - 3_600n) } });
    fireEvent.blur(screen.getByLabelText("Custom date and time"));
    await waitFor(() => expect(isDisabled(submit())).toBe(true));
    expect(describedText(screen.getByRole("group", { name: "Deadline" }))).toContain("at least 90 seconds");
  });

  it("sends a custom deadline as the Unix time of the date and time chosen", async () => {
    const { world } = await openCreate({ allowance: 10_000_000n });
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 7_200n) } });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    const sent = world.sent.find((s) => s.functionName === "createPledge");
    expect(sent?.args[4]).toBe(T0 + 7_200n);
  });

  it.each([
    ["2 minutes", 120n],
    ["1 day", 86_400n],
    ["7 days", 604_800n],
    ["30 days", 2_592_000n],
  ])("computes the %s preset from chain time read after the approval has confirmed", async (label, seconds) => {
    // Each mined transaction moves the chain 300 seconds on, as a slow approval would. A deadline computed
    // when the form was opened, or when the button was pressed, would be 300 seconds short.
    const { world } = await openCreate({ prepare: ({ world: w }) => void (w.blockAdvance = 300n) });
    fill({ deadline: label });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(world.sent.map((s) => s.functionName)).toEqual(["approve", "createPledge"]);
    const sent = world.sent[1];
    expect(sent?.functionName === "createPledge" && sent.args[4]).toBe(T0 + 300n + seconds);
  });

  it("computes it from a block read after the button was pressed, when no approval is needed", async () => {
    const { world, chain } = await openCreate({ allowance: 10_000_000n });
    fill({ deadline: "1 day" });
    await ready();
    chain.blockTimestamp = T0 + 1_000n;
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    const sent = world.sent[0];
    expect(sent?.functionName === "createPledge" && sent.args[4]).toBe(T0 + 1_000n + 86_400n);
  });
});

describe("LLR-FE-031 a custom deadline is checked again when submit is activated and before the creation is sent", () => {
  const group = () => describedText(screen.getByRole("group", { name: "Deadline" }));
  const chooseCustom = (timestamp: bigint) => {
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(timestamp) } });
  };

  it("sends nothing, and says so beside the deadline, when time has passed since the form was last drawn", async () => {
    // Only the monotonic clock is faked: 40 seconds go by with nothing to draw the page again.
    vi.useFakeTimers({ toFake: ["performance"] });
    const { wallet, world } = await openCreate({ allowance: 5_000_000n });
    chooseCustom(T0 + 120n);
    await ready();
    expect(group()).not.toContain("at least 90 seconds");
    vi.advanceTimersByTime(40_000);
    expect(isDisabled(submit())).toBe(false);
    click(submit());
    await waitFor(() => expect(group()).toContain("The deadline must be at least 90 seconds from now. Pick a later time."));
    expect(prompts(wallet)).toBe(0);
    expect(world.sent).toEqual([]);
    expect(within(notices()).queryByText(FAILED_MESSAGE)).toBeNull();
  });

  it("checks again after the approval has confirmed, sends no creation if it then fails, and keeps the approval", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const { chain, wallet, world } = await openCreate();
    chooseCustom(T0 + 120n);
    await ready();
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    click(submit());
    await waitFor(() => expect(world.count("approve")).toBe(1));
    // The approval takes 40 seconds to confirm, which leaves 80 of the 120.
    vi.advanceTimersByTime(40_000);
    open();
    await waitFor(() => expect(group()).toContain("at least 90 seconds"));
    expect(world.count("createPledge")).toBe(0);
    expect(prompts(wallet)).toBe(1);
    expect(progress().textContent).toContain("Step 1 of 2: let SatStake take 1.5 USDC. Done.");
    expect(progress().textContent).toContain(keptApproval("1.5 USDC"));
    expect(within(notices()).queryByText(FAILED_MESSAGE)).toBeNull();
    expect(chain.allowanceOf(usdc.address, ACCOUNT, network.contract)).toBe(1_500_000n);
  });

  it("sends the creation when the time that passed leaves the deadline in range", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const { world } = await openCreate({ allowance: 5_000_000n });
    chooseCustom(T0 + 3_600n);
    await ready();
    vi.advanceTimersByTime(40_000);
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
  });

  it("removes the failure when the deadline is changed", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    await openCreate({ allowance: 5_000_000n });
    chooseCustom(T0 + 120n);
    await ready();
    vi.advanceTimersByTime(40_000);
    click(submit());
    await waitFor(() => expect(group()).toContain("at least 90 seconds"));
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 7_200n) } });
    await waitFor(() => expect(group()).not.toContain("at least 90 seconds"));
  });

  it("removes the failure when a new attempt starts, though the deadline has not changed", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    chooseCustom(T0 + 120n);
    await ready();
    vi.advanceTimersByTime(40_000);
    click(submit());
    await waitFor(() => expect(group()).toContain("at least 90 seconds"));
    // Returning to the tab reads the chain again. The node answers with a block earlier than the page's own
    // estimate of chain time, so the deadline is in range once more while the earlier failure is still said.
    act(() => void window.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(isDisabled(submit())).toBe(false));
    expect(group()).toContain("at least 90 seconds");
    const release = wallet.hold("eth_sendTransaction");
    click(submit());
    await waitFor(() => expect(prompts(wallet)).toBe(1));
    expect(group()).not.toContain("at least 90 seconds");
    release();
  });
});

describe("LLR-FE-012 chain time counts from the arrival of the block, not from the request for it", () => {
  it("does not count the time the read took, so a slow answer does not use up the deadline", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    let arrive = () => {};
    await openCreate({
      prepare: ({ chain }) => {
        chain.latency = (record) => (record.method === "eth_getBlockByNumber" ? new Promise<void>((resolve) => (arrive = resolve)) : undefined);
      },
    });
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 120n) } });
    // The block is a minute in coming. Counted from the request, chain time would read a minute late and the
    // deadline, 120 seconds ahead, would look 60 seconds ahead.
    vi.advanceTimersByTime(60_000);
    arrive();
    await ready();
    expect(describedText(screen.getByRole("group", { name: "Deadline" }))).not.toContain("at least 90 seconds");
  });
});

describe("LLR-FE-031 the time of the network, when it cannot be read, is said so and read again every 5 seconds", () => {
  it("says so beside the deadline at once, keeps the form invalid, and recovers on the next read", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval"], shouldAdvanceTime: true });
    const { chain } = await openCreate({ prepare: ({ chain: c }) => void (c.blockError = new Error("down")) });
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    const group = () => describedText(screen.getByRole("group", { name: "Deadline" }));
    await waitFor(() => expect(group()).toContain("Could not read the network's time. Trying again every 5 seconds."));
    expect(isDisabled(submit())).toBe(true);
    const before = chain.count("eth_getBlockByNumber");
    chain.blockError = undefined;
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(chain.count("eth_getBlockByNumber")).toBe(before);
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 3_600n) } });
    await ready();
    expect(group()).not.toContain("Could not read");
  });

  it("says nothing of it for a preset, which is computed from a fresh reading when the creation is sent", async () => {
    await openCreate({ prepare: ({ chain }) => void (chain.blockError = new Error("down")) });
    fill();
    await waitFor(() => expect(isDisabled(submit())).toBe(false));
    expect(describedText(screen.getByRole("group", { name: "Deadline" }))).not.toContain("Could not read");
  });
});

describe("LLR-FE-031 the date field offers the range chain time allows, in the visitor's own time", () => {
  it("sets its minimum to 90 seconds past chain time and its maximum to a year, and says the time is local", async () => {
    await openCreate();
    chooseDeadline("Custom");
    const input = screen.getByLabelText("Custom date and time");
    await waitFor(() => expect(input.getAttribute("min")).toBe(localInput(T0 + 120n)));
    expect(input.getAttribute("max")).toBe(localInput(T0 + 365n * 86_400n));
    expect(describedText(input)).toContain("In your local time.");
  });

  it("sets neither bound before chain time has been read", async () => {
    await openCreate({ prepare: ({ chain }) => void (chain.blockError = new Error("down")) });
    chooseDeadline("Custom");
    const input = screen.getByLabelText("Custom date and time");
    expect(input.getAttribute("min")).toBeNull();
    expect(input.getAttribute("max")).toBeNull();
  });
});

describe("LLR-FE-031 a preset deadline shows roughly when it ends, from chain time", () => {
  const ends = (seconds: bigint) => `Ends about ${formatLocalTime(T0 + seconds)}.`;
  const shownEnd = () => screen.queryByText(/^Ends about /)?.textContent;

  it.each([
    ["2 minutes", 120n],
    ["1 day", 86_400n],
    ["7 days", 604_800n],
    ["30 days", 2_592_000n],
  ])("says when the %s preset ends, in the visitor's own time", async (label, seconds) => {
    await openCreate();
    chooseDeadline(label);
    await waitFor(() => expect(shownEnd()).toBe(ends(seconds)));
  });

  it("says nothing before a choice and nothing for a custom time", async () => {
    await openCreate();
    await waitFor(() => expect(screen.getByLabelText("Amount")).toBeTruthy());
    expect(shownEnd()).toBeUndefined();
    chooseDeadline("7 days");
    await waitFor(() => expect(shownEnd()).toBeDefined());
    chooseDeadline("Custom");
    expect(shownEnd()).toBeUndefined();
  });

  it("says nothing while chain time has not been read, and never from the device's clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2031-01-01T00:00:00Z") });
    await openCreate({ prepare: ({ chain }) => void (chain.blockError = new Error("down")) });
    chooseDeadline("7 days");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(shownEnd()).toBeUndefined();
  });

  it("moves with chain time between reads", async () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    await openCreate();
    chooseDeadline("1 day");
    await waitFor(() => expect(shownEnd()).toBe(ends(86_400n)));
    vi.advanceTimersByTime(3_600_000);
    await waitFor(() => expect(shownEnd()).toBe(ends(86_400n + 3_600n)), { timeout: 3_000 });
  });

  it("says no chain-time failure beside the deadline while no choice has been made", async () => {
    await openCreate({ prepare: ({ chain }) => void (chain.blockError = new Error("down")) });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(describedText(screen.getByRole("group", { name: "Deadline" }))).not.toContain("Could not read");
  });
});

describe("LLR-FE-034 the statement the staker ticks says who decides and where the stake goes", () => {
  it("is worded as decided: the referee alone decides, and a broken or missed promise pays the beneficiary for good", async () => {
    await openCreate();
    const box = screen.getByRole("checkbox", { name: ACK_TEXT });
    expect(box.closest("label")?.textContent).toBe(
      "I understand that the referee alone decides whether I kept this promise. If the referee marks it broken, or has not marked it kept by the deadline, my stake goes to the beneficiary and cannot be recovered.",
    );
  });
});

describe("LLR-FE-034 the form warns beside the beneficiary field that an address nobody controls loses the stake", () => {
  const LOST = /nobody controls it, the stake is lost for good/;

  it("shows the warning before anything is typed, next to the beneficiary field and not only on error", async () => {
    await openCreate();
    const input = field("Beneficiary address");
    expect(input.closest(".field")?.textContent).toMatch(LOST);
    expect(errorFor("Beneficiary address")).toBe("");
  });

  it("links the warning to the field, so its accessible description includes it", async () => {
    await openCreate();
    expect(describedText(field("Beneficiary address"))).toMatch(LOST);
  });

  it("does not put the warning on the referee field", async () => {
    await openCreate();
    expect(describedText(field("Referee address"))).not.toMatch(LOST);
  });

  it("stays while the field shows a failure and while the contract-code warning shows", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.code.add(BENEFICIARY.toLowerCase()) });
    fill();
    await waitFor(() => expect(warningElement("Beneficiary address").textContent).not.toBe(""));
    expect(describedText(field("Beneficiary address"))).toMatch(LOST);
    type("Beneficiary address", "0x12");
    fireEvent.blur(field("Beneficiary address"));
    expect(errorFor("Beneficiary address")).not.toBe("");
    expect(describedText(field("Beneficiary address"))).toMatch(LOST);
  });
});

describe("LLR-FE-030 the form says what it is for, and what each field is asked for", () => {
  it("opens with one sentence under the heading", async () => {
    await openCreate();
    const heading = screen.getByRole("heading", { level: 1, name: "New promise" });
    expect(heading.nextElementSibling?.textContent).toBe("Lock a stake against a promise. Your referee decides whether you kept it.");
  });

  it("tells the staker who can read the promise and that it cannot change, and counts its bytes as they type", async () => {
    await openCreate();
    expect(describedText(field("Promise"))).toContain("Anyone can read this, and it cannot be changed later.");
    expect(describedText(field("Promise"))).toContain("0 of 280 bytes");
    type("Promise", "Run 5 km before Friday");
    expect(describedText(field("Promise"))).toContain("22 of 280 bytes");
    type("Promise", "é".repeat(100));
    expect(describedText(field("Promise"))).toContain("200 of 280 bytes");
    expect(describedText(field("Promise"))).not.toContain("22 of 280 bytes");
  });

  it("describes the referee and the beneficiary in the words decided, linked to their fields", async () => {
    await openCreate();
    expect(describedText(field("Referee address"))).toContain("The person who decides. They must mark the promise kept before the deadline.");
    expect(describedText(field("Beneficiary address"))).toContain(
      "Receives your stake if the promise is broken or not confirmed in time.",
    );
  });

  it("gives the submit control the class of the primary action", async () => {
    await openCreate();
    expect(submit().className).toContain("button-primary");
  });
});

describe("LLR-FE-045 cirBTC amounts are also shown in satoshis on the create form", () => {
  it("shows the balance in sats beside it for cirBTC, and not for USDC", async () => {
    await openCreate({ balance: 150_000_000n });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 150 USDC."));
    expect(describedText(field("Amount"))).not.toContain("sats");
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 1.5 cirBTC (150,000,000 sats)."));
  });

  it("shows a valid amount in sats, follows each change, and shows nothing for an amount that is not valid", async () => {
    await openCreate({ balance: 150_000_000n });
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 1.5 cirBTC"));
    type("Amount", "0.25");
    expect(describedText(field("Amount"))).toContain("This amount: 0.25 cirBTC (25,000,000 sats).");
    type("Amount", "0.5");
    expect(describedText(field("Amount"))).toContain("(50,000,000 sats)");
    expect(describedText(field("Amount"))).not.toContain("(25,000,000 sats)");
    type("Amount", "abc");
    expect(describedText(field("Amount"))).not.toContain("This amount");
    type("Amount", "0");
    expect(describedText(field("Amount"))).not.toContain("This amount");
  });

  it("shows no amount in sats for an amount that has a failure, such as one above the balance", async () => {
    await openCreate({ balance: 150_000_000n });
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 1.5 cirBTC"));
    type("Amount", "2");
    fireEvent.blur(field("Amount"));
    expect(errorFor("Amount")).toContain("Your balance is 1.5 cirBTC");
    expect(describedText(field("Amount"))).not.toContain("This amount");
  });

  it("shows no amount in sats for USDC", async () => {
    await openCreate();
    await waitFor(() => expect(describedText(field("Amount"))).toContain("Your balance: 100 USDC."));
    type("Amount", "1.5");
    expect(describedText(field("Amount"))).not.toContain("sats");
  });
});

describe("LLR-FE-035 the warning for a contract says what could go wrong, and gives way to a failure of the field", () => {
  const REFEREE_WARNING =
    "This address is a contract. If it cannot call SatStake, it cannot mark your promise kept, and your stake goes to the beneficiary after the deadline.";
  const BENEFICIARY_WARNING = "This address is a contract. If it cannot move tokens, a stake paid to it cannot be recovered.";

  it("says in those words what a contract referee cannot do", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.code.add(REFEREE.toLowerCase()) });
    fill();
    await waitFor(() => expect(warningElement("Referee address").textContent).toBe(REFEREE_WARNING));
  });

  it("says in those words what a contract beneficiary cannot do", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.code.add(BENEFICIARY.toLowerCase()) });
    fill();
    await waitFor(() => expect(warningElement("Beneficiary address").textContent).toBe(BENEFICIARY_WARNING));
  });

  it("is hidden while the field shows a failure, and returns when the failure goes", async () => {
    // The SatStake contract has code and is refused as a party: the failure is the thing to read.
    await openCreate({ prepare: ({ chain }) => void chain.code.add(network.contract.toLowerCase()) });
    type("Referee address", network.contract);
    await waitFor(() => expect(warningElement("Referee address").textContent).toBe(REFEREE_WARNING));
    fireEvent.blur(field("Referee address"));
    expect(errorFor("Referee address")).toContain("cannot be a party");
    expect(warningElement("Referee address").textContent).toBe("");
  });
});

describe("LLR-FE-035 the beneficiary's warning also gives way to a failure of its field", () => {
  it("is hidden while the beneficiary field shows a failure", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.code.add(network.contract.toLowerCase()) });
    type("Beneficiary address", network.contract);
    await waitFor(() => expect(warningElement("Beneficiary address").textContent).toContain("If it cannot move tokens"));
    fireEvent.blur(field("Beneficiary address"));
    expect(errorFor("Beneficiary address")).toContain("cannot be a party");
    expect(warningElement("Beneficiary address").textContent).toBe("");
  });
});

describe("LLR-FE-037 the copy-link control says what it is for, and its confirmation does not move it", () => {
  it("says what to do with the link above a button named for it, then the confirmation", async () => {
    await openCreate();
    fill();
    await ready();
    click(submit());
    await screen.findByRole("heading", { level: 1, name: "Promise #42" });
    // The page now opens with its banner and keeps the status line in the card, so the block is found by its
    // own frame; what this test holds is the order inside it.
    const button = screen.getByRole("button", { name: "Copy the link to this promise" });
    const block = button.closest(".copy-link") as HTMLElement;
    expect(block).not.toBeNull();
    const text = within(block).getByText("Your promise is created. Send this link to your referee and your beneficiary.");
    const confirmation = within(block).getByRole("status", { name: "Link copy status" });
    const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(text, button)).toBe(true);
    expect(follows(button, confirmation)).toBe(true);
    expect(confirmation.className).toContain("copy-status");
  });
});

describe("LLR-FE-032 amounts are converted with the token's own decimals, never the native balance or 18", () => {
  it("converts a USDC amount with 6 decimals, in the approval and in the creation", async () => {
    const { world } = await openCreate();
    fill({ amount: "1.5" });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(world.sent.map((s) => [s.functionName, s.to.toLowerCase()])).toEqual([
      ["approve", usdc.address.toLowerCase()],
      ["createPledge", network.contract.toLowerCase()],
    ]);
    expect(world.sent[0]?.args[1]).toBe(parseUnits("1.5", 6));
    expect(world.sent[1]?.args[1]).toBe(1_500_000n);
  });

  it("converts a cirBTC amount with 8 decimals, and approves and pledges that token", async () => {
    const { world, chain } = await openCreate({ balance: 1_000_000_000n });
    fill({ token: cirbtc.address, amount: "1.5" });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(world.sent[0]?.to.toLowerCase()).toBe(cirbtc.address.toLowerCase());
    expect(world.sent[0]?.args[1]).toBe(150_000_000n);
    expect(world.sent[1]?.args[0]).toBe(cirbtc.address);
    expect(world.sent[1]?.args[1]).toBe(150_000_000n);
    expect(chain.count("eth_getBalance")).toBe(0);
  });

  it("reads the allowance of the chosen token from the contract the pledge goes to", async () => {
    const { chain } = await openCreate({ balance: 1_000_000_000n });
    fill({ token: cirbtc.address });
    await ready();
    click(submit());
    await waitFor(() => expect(chain.count("eth_call", "allowance")).toBeGreaterThan(0));
    const read = chain.requests.find((r) => r.functionName === "allowance");
    expect(read?.to).toBe(cirbtc.address.toLowerCase());
  });
});

describe("LLR-FE-033 creation is preceded by an approval of exactly the amount, only when the allowance is short", () => {
  it("asks the wallet twice, approval first and creation second, with the form's values", async () => {
    const { world, wallet } = await openCreate();
    fill({ promise: "Run 5 km before Friday", amount: "1.5", deadline: "7 days" });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(prompts(wallet)).toBe(2);
    const [approval, creation] = world.sent;
    expect(approval?.functionName).toBe("approve");
    expect(approval?.args).toEqual([network.contract, 1_500_000n]);
    expect(approval?.from.toLowerCase()).toBe(ACCOUNT.toLowerCase());
    expect(creation?.args.slice(0, 4)).toEqual([usdc.address, 1_500_000n, REFEREE, BENEFICIARY]);
    expect(creation?.args[4]).toBe(T0 + 604_800n);
    expect(creation?.args[5]).toBe("Run 5 km before Friday");
  });

  it("skips the approval and asks the wallet once when the allowance already covers the amount (UJ-13)", async () => {
    const { world, wallet } = await openCreate({ allowance: 1_500_000n });
    fill({ amount: "1.5" });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(prompts(wallet)).toBe(1);
    expect(world.count("approve")).toBe(0);
  });

  it("sends the promise exactly as it was typed, spaces included", async () => {
    const { world } = await openCreate({ allowance: 10_000_000n });
    fill({ promise: "  Run 5 km  " });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(world.sent[0]?.functionName === "createPledge" && world.sent[0].args[5]).toBe("  Run 5 km  ");
  });

  it("approves exactly the amount when the allowance is one unit short, and never an unlimited one", async () => {
    const { world, chain } = await openCreate({ allowance: 1_499_999n });
    fill({ amount: "1.5" });
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(world.sent[0]?.args).toEqual([network.contract, 1_500_000n]);
    // The creation spent it, so nothing is left over to be spent by anyone else.
    expect(chain.allowanceOf(usdc.address, ACCOUNT, network.contract)).toBe(0n);
  });

  it("shows numbered progress for both steps, with the step that is waiting for the wallet", async () => {
    const { wallet, world } = await openCreate();
    const releaseApproval = wallet.hold("eth_sendTransaction");
    const releaseCreation = wallet.hold("eth_sendTransaction");
    fill({ amount: "1.5" });
    await ready();
    expect(progress().textContent).toBe("");
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Step 1 of 2: let SatStake take 1.5 USDC. Confirm in your wallet."));
    expect(progress().textContent).toContain("Step 2 of 2: create the promise. Starts after step 1.");
    releaseApproval();
    await waitFor(() => expect(progress().textContent).toContain("Step 1 of 2: let SatStake take 1.5 USDC. Done."));
    expect(progress().textContent).toContain("Step 2 of 2: create the promise. Confirm in your wallet.");
    releaseCreation();
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
  });

  it("shows the creation alone, unnumbered, when no approval is needed", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    const release = wallet.hold("eth_sendTransaction");
    fill({ amount: "1.5" });
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Create the promise. Confirm in your wallet."));
    expect(progress().textContent).not.toContain("Step");
    expect(progress().textContent).not.toContain("let SatStake take");
    release();
  });

  it("shows that it is waiting for the network while a step is being confirmed", async () => {
    const { chain, world } = await openCreate({ allowance: 5_000_000n });
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill({ amount: "1.5" });
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Create the promise. Waiting for the network to confirm."));
    open();
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
  });

  it("takes the prompt-count hint away once the steps are shown, so the two do not say different things", async () => {
    const { wallet } = await openCreate();
    const release = wallet.hold("eth_sendTransaction");
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Step 1 of 2"));
    expect(submit().nextElementSibling?.textContent).toBe("");
    release();
    await waitFor(() => expect(window.location.hash).toBe("#/p/42"));
  });

  it("says before the first prompt that the wallet may ask twice, under the submit control and linked to it", async () => {
    await openCreate();
    expect(submit().nextElementSibling?.textContent).toBe(PROMPT_HINT);
    expect(describedText(submit())).toContain(PROMPT_HINT);
  });

  it("puts nothing in the progress area before a request and clears it when a request fails", async () => {
    const { wallet } = await openCreate();
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(within(notices()).getByText(REJECTED_MESSAGE)).toBeTruthy());
    expect(progress().textContent).toBe("");
  });
});

describe("LLR-FE-033 every send names the configured chain, so the wallet's chain is read when it is sent", () => {
  it("does not send an approval when the wallet moved to another network without telling the page", async () => {
    const { wallet } = await openCreate();
    fill();
    await ready();
    // A wallet that changes network and does not announce it, so the page still believes it is on the right one.
    wallet.chainId = FOREIGN_CHAIN;
    click(submit());
    await waitFor(() => expect(within(notices()).getByText(FAILED_MESSAGE)).toBeTruthy());
    expect(prompts(wallet)).toBe(0);
  });

  it("does not send the creation when the wallet moves after the approval was confirmed", async () => {
    const { wallet, chain, world } = await openCreate();
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("approve")).toBe(1));
    wallet.chainId = FOREIGN_CHAIN;
    open();
    await waitFor(() => expect(within(notices()).getByText(FAILED_MESSAGE)).toBeTruthy());
    expect(prompts(wallet)).toBe(1);
    expect(world.count("createPledge")).toBe(0);
  });
});

describe("LLR-FE-033 a creation that fails after a confirmed approval keeps the approval on screen", () => {
  it("keeps the confirmed approval step and says it stays in place when the creation is refused", async () => {
    const { wallet } = await openCreate();
    fill({ amount: "1.5" });
    await ready();
    failSend(wallet, 2, walletError(4001, "User rejected the request."));
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect(progress().textContent).toContain("Step 1 of 2: let SatStake take 1.5 USDC. Done.");
    expect(progress().textContent).toContain(keptApproval("1.5 USDC"));
    expect(progress().textContent).not.toContain("Step 2");
  });

  it("does the same when the creation was mined and reverted", async () => {
    const { world } = await openCreate();
    world.outcomes = ["success", "reverted"];
    fill({ amount: "2" });
    await ready();
    click(submit());
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(progress().textContent).toContain("Step 1 of 2: let SatStake take 2 USDC. Done.");
    expect(progress().textContent).toContain(keptApproval("2 USDC"));
  });

  it("names the token's own symbol and the amount in its own units", async () => {
    const { wallet } = await openCreate({ balance: 1_000_000_000n });
    fill({ token: cirbtc.address, amount: "0.25" });
    await ready();
    failSend(wallet, 2, walletError(4001, "User rejected the request."));
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect(progress().textContent).toContain(keptApproval("0.25 cirBTC"));
  });

  it("says nothing of an approval when the approval itself was refused", async () => {
    const { wallet } = await openCreate();
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect(progress().textContent).toBe("");
  });

  it("says nothing of an approval when none was needed", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect(progress().textContent).toBe("");
  });

  it("removes the statement when a new attempt starts", async () => {
    const { wallet, world } = await openCreate();
    fill({ amount: "1.5" });
    await ready();
    const restore = failSend(wallet, 2, walletError(4001, "User rejected the request."));
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect(progress().textContent).toContain(keptApproval("1.5 USDC"));
    restore();
    const release = wallet.hold("eth_sendTransaction");
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Create the promise. Confirm in your wallet."));
    expect(progress().textContent).not.toContain("stays in place");
    release();
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
  });
});

describe("LLR-FE-033 the receipt wait follows a transaction the wallet replaces", () => {
  it("goes to the pledge of the replacement's event when the wallet's own hash never mines", async () => {
    const { world } = await openCreate({
      allowance: 5_000_000n,
      prepare: ({ world: w }) => {
        w.replaceNextCreate = true;
        w.nextPledgeId = 61n;
      },
    });
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(window.location.hash).toBe("#/p/61"), { timeout: 4000 });
    expect(world.count("createPledge")).toBe(1);
  });
});

describe("LLR-FE-062 once the wallet has returned the creation's hash, an unreadable receipt does not invite a second pledge", () => {
  it("does not keep the approval statement on screen when the creation was sent and its outcome is unknown", async () => {
    const opened = await openCreate();
    afterSend(opened.wallet, 2, () => void (opened.chain.receiptError = new Error("rpc down")));
    fill({ amount: "1.5" });
    await ready();
    click(submit());
    await within(notices()).findByText(UNCONFIRMED, undefined, { timeout: 4000 });
    expect(progress().textContent).toBe("");
    expect(opened.world.count("approve")).toBe(1);
  });

  async function sentButUnreadable() {
    const opened = await openCreate({ allowance: 5_000_000n });
    afterSend(opened.wallet, 1, () => void (opened.chain.receiptError = new Error("rpc down")));
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(UNCONFIRMED, undefined, { timeout: 4000 });
    return opened;
  }

  it("says the pledge was sent, with the hash and a link to My pledges, when the receipt cannot be read", async () => {
    const { world } = await sentButUnreadable();
    const hash = world.sent[0]?.hash as string;
    expect(within(notices()).getByText(hash)).toBeTruthy();
    const link = within(notices()).getByRole("link", { name: "My promises" });
    expect(link.getAttribute("href")).toBe("#/mine");
  });

  it("does not say that nothing was changed, and offers no raw error to copy", async () => {
    await sentButUnreadable();
    expect(within(notices()).queryByText(FAILED_MESSAGE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy the error" })).toBeNull();
  });

  it("stays on the form and does not offer submit again, so a second pledge cannot be sent", async () => {
    const { wallet, world, chain } = await sentButUnreadable();
    expect(window.location.hash).toBe("#/create");
    expect(isDisabled(submit())).toBe(true);
    chain.receiptError = undefined;
    click(submit());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(prompts(wallet)).toBe(1);
    expect(world.count("createPledge")).toBe(1);
  });

  it("says the same when the receipt has no PledgeCreated event, as a replacement that is not the creation would", async () => {
    const { world } = await openCreate({ allowance: 5_000_000n });
    world.omitCreatedEvent = true;
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(UNCONFIRMED);
    expect(within(notices()).getByText(world.sent[0]?.hash as string)).toBeTruthy();
    expect(isDisabled(submit())).toBe(true);
    expect(window.location.hash).toBe("#/create");
  });

  it("does not say it for a creation that was mined and reverted, since that is a failure to explain", async () => {
    const { world } = await openCreate({ allowance: 5_000_000n });
    world.outcomes = ["reverted"];
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(within(notices()).queryByText(UNCONFIRMED)).toBeNull();
    expect(isDisabled(submit())).toBe(false);
  });

  it("does not say it when the approval's receipt cannot be read, since no pledge was sent", async () => {
    const opened = await openCreate();
    afterSend(opened.wallet, 1, () => void (opened.chain.receiptError = new Error("rpc down")));
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(FAILED_MESSAGE, undefined, { timeout: 4000 });
    expect(within(notices()).queryByText(UNCONFIRMED)).toBeNull();
    expect(opened.world.count("createPledge")).toBe(0);
  });

  it("keeps the message and offers no second creation after the account changes and changes back", async () => {
    const { wallet, world } = await sentButUnreadable();
    const other = getAddress("0x" + "ee".repeat(20));
    act(() => wallet.changeAccounts([other]));
    await findConnected(other);
    act(() => wallet.changeAccounts([ACCOUNT]));
    await findConnected(ACCOUNT);
    expect(within(notices()).getByText(UNCONFIRMED)).not.toBeNull();
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    expect(world.count("createPledge")).toBe(1);
  });
});

describe("LLR-FE-034 submission requires the statement about the referee and the beneficiary to be ticked", () => {
  it("states that the referee alone decides and that a broken or missed promise pays the beneficiary for good", async () => {
    await openCreate();
    const box = screen.getByRole("checkbox", { name: ACK_TEXT }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(ACK_TEXT).toMatch(/referee alone decides/);
    expect(ACK_TEXT).toMatch(/beneficiary/);
    expect(ACK_TEXT).toMatch(/cannot be recovered/);
  });

  it("keeps submit disabled with everything else correct until the box is ticked, and says what to do", async () => {
    await openCreate();
    fill({ acknowledge: false });
    await waitFor(() => expect(describedText(submit())).toContain("the box confirming you understand"));
    expect(isDisabled(submit())).toBe(true);
    touchAll();
    expect(describedText(screen.getByRole("checkbox", { name: ACK_TEXT }))).toContain("Tick the box to confirm you understand.");
    tickAcknowledgement();
    await ready();
  });

  it("untick disables it again", async () => {
    await openCreate();
    fill();
    await ready();
    click(screen.getByRole("checkbox", { name: ACK_TEXT }));
    expect(isDisabled(submit())).toBe(true);
  });
});

describe("LLR-FE-035 the form warns, without blocking, when the referee or beneficiary has deployed code", () => {
  it("warns beside the referee, still allows creation, and creates", async () => {
    const { world } = await openCreate({ prepare: ({ chain }) => void chain.code.add(REFEREE.toLowerCase()) });
    fill();
    await waitFor(() => expect(warningElement("Referee address").textContent).toMatch(/is a contract/));
    expect(warningElement("Beneficiary address").textContent).toBe("");
    await ready();
    expect(isDisabled(submit())).toBe(false);
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
  });

  it("warns beside the beneficiary, and says it may be unable to act on the stake", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.code.add(BENEFICIARY.toLowerCase()) });
    fill();
    await waitFor(() => expect(warningElement("Beneficiary address").textContent).toMatch(/is a contract/));
    expect(warningElement("Referee address").textContent).toBe("");
    await ready();
  });

  it("is not an error: the field is not marked invalid and the warning is announced politely", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.code.add(REFEREE.toLowerCase()) });
    fill();
    await waitFor(() => expect(warningElement("Referee address").textContent).toMatch(/is a contract/));
    expect(field("Referee address").getAttribute("aria-invalid")).not.toBe("true");
    expect(warningElement("Referee address").getAttribute("aria-live")).toBe("polite");
    expect(describedBy(field("Referee address"))).toContain(warningElement("Referee address"));
  });

  it("does not warn for an address with no code, and asks the chain only about an address that is well formed", async () => {
    const { chain } = await openCreate();
    type("Referee address", "0x12");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chain.count("eth_getCode")).toBe(0);
    type("Referee address", REFEREE);
    await waitFor(() => expect(chain.count("eth_getCode")).toBe(1));
    expect(chain.requests.find((r) => r.method === "eth_getCode")?.to).toBe(REFEREE.toLowerCase());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warningElement("Referee address").textContent).toBe("");
  });
});

describe("LLR-FE-035 an account that delegates to code under EIP-7702 is a person's wallet, so it gets no warning", () => {
  const DELEGATED = "0xef0100" + "ab".repeat(20);

  it.each([
    ["Referee address", REFEREE],
    ["Beneficiary address", BENEFICIARY],
  ])("does not warn beside %s for code that is a delegation designator", async (label, address) => {
    const { chain } = await openCreate({ prepare: ({ chain }) => void chain.codeBytes.set(address.toLowerCase(), DELEGATED) });
    type(label, address);
    await waitFor(() => expect(chain.count("eth_getCode")).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(warningElement(label).textContent).toBe("");
  });

  it("still warns for code that only resembles the designator", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.codeBytes.set(REFEREE.toLowerCase(), "0xef0101" + "ab".repeat(20)) });
    type("Referee address", REFEREE);
    await waitFor(() => expect(warningElement("Referee address").textContent).toMatch(/is a contract/));
  });
});

describe("LLR-FE-036 while a transaction from the form is pending, submit is disabled and a second press does nothing (UJ-16)", () => {
  it("ignores presses while the wallet's prompt is open, and creates exactly once", async () => {
    const { wallet, world } = await openCreate({ allowance: 5_000_000n });
    const release = wallet.hold("eth_sendTransaction");
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(prompts(wallet)).toBe(1));
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    click(submit());
    expect(prompts(wallet)).toBe(1);
    release();
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(prompts(wallet)).toBe(1);
  });

  it("ignores presses while the approval is being confirmed", async () => {
    const { chain, wallet, world } = await openCreate();
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(world.count("approve")).toBe(1));
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    expect(prompts(wallet)).toBe(1);
    open();
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(world.count("approve")).toBe(1);
  });

  it("ignores presses while the creation's prompt is open and while the creation is being confirmed, after a confirmed approval", async () => {
    const { chain, wallet, world } = await openCreate();
    const releaseApproval = wallet.hold("eth_sendTransaction");
    const releaseCreation = wallet.hold("eth_sendTransaction");
    fill();
    await ready();
    click(submit());
    releaseApproval();
    await waitFor(() => expect(progress().textContent).toContain("Step 2 of 2: create the promise. Confirm in your wallet."));
    expect(prompts(wallet)).toBe(2);
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    click(submit());
    expect(prompts(wallet)).toBe(2);
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    releaseCreation();
    await waitFor(() => expect(progress().textContent).toContain("Step 2 of 2: create the promise. Waiting for the network to confirm."));
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    click(submit());
    expect(prompts(wallet)).toBe(2);
    open();
    await waitFor(() => expect(window.location.hash).toBe("#/p/42"));
    expect(world.count("approve")).toBe(1);
    expect(world.count("createPledge")).toBe(1);
    expect(prompts(wallet)).toBe(2);
  });

  it("makes every field read-only while a transaction is pending", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    const release = wallet.hold("eth_sendTransaction");
    fill({ deadline: "Custom" });
    chooseDeadline("Custom");
    fireEvent.change(screen.getByLabelText("Custom date and time"), { target: { value: localInput(T0 + 3_600n) } });
    await ready();
    const frozen = () => ({
      text: ["Promise", "Amount", "Referee address", "Beneficiary address", "Custom date and time"].map(
        (label) => (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).readOnly,
      ),
      select: (field("Token") as HTMLSelectElement).disabled,
      choices: screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).disabled),
      box: (screen.getByRole("checkbox", { name: ACK_TEXT }) as HTMLInputElement).disabled,
    });
    expect(frozen()).toEqual({ text: [false, false, false, false, false], select: false, choices: [false, false, false, false, false], box: false });
    click(submit());
    await waitFor(() => expect(prompts(wallet)).toBe(1));
    expect(frozen()).toEqual({ text: [true, true, true, true, true], select: true, choices: [true, true, true, true, true], box: true });
    release();
    await waitFor(() => expect(window.location.hash).toBe("#/p/42"));
  });

  it("makes the fields editable again when the request fails", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect((field("Promise") as HTMLTextAreaElement).readOnly).toBe(false);
    expect((field("Token") as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByRole("checkbox", { name: ACK_TEXT }) as HTMLInputElement).disabled).toBe(false);
  });

  it("answers two presses made before the page can render in between with one request", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    fill();
    await ready();
    const button = submit();
    act(() => {
      button.click();
      button.click();
    });
    await waitFor(() => expect(prompts(wallet)).toBeGreaterThan(0));
    expect(prompts(wallet)).toBe(1);
  });

  it("is enabled again after a request fails, so the staker can try once more", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(within(notices()).getByText(REJECTED_MESSAGE)).toBeTruthy());
    expect(isDisabled(submit())).toBe(false);
  });
});

describe("LLR-FE-037 after creation the page goes to the pledge, decoded from the receipt, and offers a copy-link control", () => {
  function stubClipboard() {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    return writeText;
  }

  it("goes to the pledge page of the identifier in the receipt's event", async () => {
    await openCreate({ prepare: ({ world }) => void (world.nextPledgeId = 77n) });
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(window.location.hash).toBe("#/p/77"));
    expect(await screen.findByRole("heading", { level: 1, name: "Promise #77" })).toBeTruthy();
  });

  it("offers a control that copies the address of the pledge page, and says whether it worked", async () => {
    const writeText = stubClipboard();
    await openCreate();
    fill();
    await ready();
    click(submit());
    await screen.findByRole("heading", { level: 1, name: "Promise #42" });
    click(await screen.findByRole("button", { name: "Copy the link to this promise" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${window.location.pathname}#/p/42`);
    await screen.findByText("Link copied.");
  });

  it("says when the link could not be copied", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    await openCreate();
    fill();
    await ready();
    click(submit());
    click(await screen.findByRole("button", { name: "Copy the link to this promise" }));
    await screen.findByText("Could not copy the link.");
  });

  it("moves focus to the new page's heading, since the button pressed is gone", async () => {
    await openCreate();
    fill();
    await ready();
    click(submit());
    const heading = await screen.findByRole("heading", { level: 1, name: "Promise #42" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("offers the copy-link control for that pledge only, and not on a pledge page visited another way", async () => {
    await openCreate();
    fill();
    await ready();
    click(submit());
    await screen.findByRole("button", { name: "Copy the link to this promise" });
    act(() => {
      window.location.hash = "#/p/1";
    });
    await screen.findByRole("heading", { level: 1, name: "Promise #1" });
    expect(screen.queryByRole("button", { name: "Copy the link to this promise" })).toBeNull();
  });
});

describe("LLR-FE-023 every write control uses the write gate, with its reasons beside the control", () => {
  it("is disabled with the reason beside it when no wallet is connected, and raises no prompt", async () => {
    const { wallet } = await openCreate({ disconnected: true });
    fill();
    expect(isDisabled(submit())).toBe(true);
    // The wallet's reconnect attempt settles after the first render, and until it does the reason is that it is connecting.
    await waitFor(() => expect(describedText(submit())).toContain("Connect a wallet to act."));
    click(submit());
    expect(prompts(wallet)).toBe(0);
  });

  it("is disabled with the reason beside it when the wallet is on another network, though the form is complete", async () => {
    const { wallet } = await openCreate({ walletChain: FOREIGN_CHAIN });
    fill();
    await waitFor(() => expect(describedText(submit())).toContain(`Your wallet is on another network. Switch to ${network.name}.`));
    expect(isDisabled(submit())).toBe(true);
    click(submit());
    expect(prompts(wallet)).toBe(0);
  });

  it("is disabled with the reason beside it when the network check found another chain", async () => {
    await openCreate({ prepare: ({ chain }) => void (chain.chainId = 5042) });
    fill();
    await waitFor(() => expect(describedText(submit())).toContain("wrong network"));
    expect(isDisabled(submit())).toBe(true);
  });

  it("becomes enabled when the wallet is switched, with the reason gone", async () => {
    const { wallet } = await openCreate({ walletChain: FOREIGN_CHAIN });
    fill();
    await waitFor(() => expect(describedText(submit())).toContain("another network"));
    act(() => wallet.changeChain(network.chainId));
    await ready();
    expect(describedText(submit())).not.toContain("another network");
  });

  it("reads the token and network checks once, since the page uses the shell's checks and not a second set", async () => {
    const { chain } = await openCreate();
    fill();
    await ready();
    expect(chain.count("eth_call", "decimals")).toBe(network.tokens.length);
    expect(chain.count("eth_call", "symbol")).toBe(network.tokens.length);
    expect(chain.count("eth_chainId")).toBe(1);
  });
});

describe("LLR-FE-006 creation in a token is off while its reading does not match, and on in another", () => {
  it("disables submit and says so beside the token field when the chosen token reads differently", async () => {
    await openCreate({
      balance: 1_000_000_000n,
      prepare: ({ chain }) => void chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" }),
    });
    fill();
    await waitFor(() => expect(within(field("Token").parentElement as HTMLElement).getByText("USDC cannot be used for new pledges right now.")).toBeTruthy());
    expect(isDisabled(submit())).toBe(true);
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    await ready();
    expect(isDisabled(submit())).toBe(false);
  });

  it("says so beside the token field before anything in the form has been touched", async () => {
    await openCreate({ prepare: ({ chain }) => void chain.addToken(usdc.address, { decimals: 18, symbol: "USDC" }) });
    await waitFor(() => expect(errorFor("Token")).toBe("USDC cannot be used for new pledges right now."));
  });

  it("says nothing about a token before its first reading has come back", async () => {
    let open = () => {};
    const { chain } = await openCreate({
      prepare: ({ chain: held }) => void (held.gate = new Promise<void>((resolve) => (open = resolve))),
    });
    expect(errorFor("Token")).toBe("");
    expect(describedText(submit())).not.toContain("Token");
    open();
    await waitFor(() => expect(chain.count("eth_call", "symbol")).toBe(network.tokens.length));
    expect(errorFor("Token")).toBe("");
  });

  it("keeps it off for a token whose reading could not be completed", async () => {
    await openCreate({ prepare: ({ chain }) => void (chain.callError = new Error("down")) });
    fill();
    await waitFor(() => expect(within(field("Token").parentElement as HTMLElement).getByText("USDC cannot be used for new pledges right now.")).toBeTruthy());
    expect(isDisabled(submit())).toBe(true);
  });
});

describe("LLR-FE-060 a failure the contract or the token reported is shown with the message of section 2.2", () => {
  it("shows the message of a contract error the wallet returned, and keeps every value", async () => {
    const { wallet, world } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", revertError("DeadlineTooSoon", [T0 + 60n]));
    fill({ promise: "Run 5 km" });
    await ready();
    click(submit());
    await waitFor(() =>
      expect(within(notices()).getByText("The deadline must be at least one minute from now. Pick a later time.")).toBeTruthy(),
    );
    expect(within(notices()).queryByText(FAILED_MESSAGE)).toBeNull();
    expect((field("Promise") as HTMLTextAreaElement).value).toBe("Run 5 km");
    expect((field("Amount") as HTMLInputElement).value).toBe("1.5");
    expect((field("Referee address") as HTMLInputElement).value).toBe(REFEREE);
    expect(world.count("createPledge")).toBe(0);
    expect(isDisabled(submit())).toBe(false);
  });

  it("shows the token's message when the token refuses the approval, and sends no creation", async () => {
    const { wallet, world } = await openCreate();
    wallet.failNext("eth_sendTransaction", tokenRevert("Blacklistable: account is blacklisted"));
    fill();
    await ready();
    click(submit());
    await waitFor(() =>
      expect(within(notices()).getByText("The token issuer blocked this transfer. Nothing changed. You can try again later.")).toBeTruthy(),
    );
    expect(world.sent).toEqual([]);
  });

  it("shows the contract's message for a token that refused the transfer without a reason", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", revertError("SafeERC20FailedOperation", [usdc.address]));
    fill();
    await ready();
    click(submit());
    await waitFor(() =>
      expect(within(notices()).getByText("The token refused the transfer. Nothing changed. You can try again later.")).toBeTruthy(),
    );
  });

  it("styles a mapped failure as a failure, and offers no raw error to copy for it", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", revertError("ZeroAmount"));
    fill();
    await ready();
    click(submit());
    const message = await within(notices()).findByText("Enter an amount above zero.");
    expect(message.className).toContain("notice-failure");
  });
});

describe("LLR-FE-061 a rejection in the wallet keeps the form and shows the neutral message (UJ-14)", () => {
  it("shows the neutral message with no failure styling when the approval is refused, and requests nothing more", async () => {
    const { wallet, world } = await openCreate();
    wallet.failNext("eth_sendTransaction", rejection());
    fill({ promise: "Run 5 km" });
    await ready();
    click(submit());
    const message = await within(notices()).findByText(REJECTED_MESSAGE);
    expect(message.className).not.toContain("notice-failure");
    expect(within(notices()).queryByRole("button", { name: "Copy the error" })).toBeNull();
    expect(prompts(wallet)).toBe(1);
    expect(world.sent).toEqual([]);
    expect((field("Promise") as HTMLTextAreaElement).value).toBe("Run 5 km");
    expect((screen.getByRole("checkbox", { name: ACK_TEXT }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "7 days" }) as HTMLInputElement).checked).toBe(true);
  });

  it("keeps the exact allowance when the creation is refused after the approval, and retries with one prompt", async () => {
    const { wallet, world, chain } = await openCreate();
    fill({ amount: "1.5" });
    await ready();
    // The approval goes through; the second request, the creation, is refused.
    const restore = failSend(wallet, 2, walletError(4001, "User rejected the request."));
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect(world.count("approve")).toBe(1);
    expect(world.count("createPledge")).toBe(0);
    expect(chain.allowanceOf(usdc.address, ACCOUNT, network.contract)).toBe(1_500_000n);
    restore();
    const before = prompts(wallet);
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(prompts(wallet) - before).toBe(1);
    expect(world.count("approve")).toBe(1);
  });

  it("removes the message when a new request starts", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    const release = wallet.hold("eth_sendTransaction");
    click(submit());
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
    release();
  });

  it("removes the message when the wallet's chain changes", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    act(() => wallet.changeChain(FOREIGN_CHAIN));
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
  });

  it("removes the message when the wallet's account changes", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(REJECTED_MESSAGE);
    act(() => wallet.changeAccounts([("0x" + "ee".repeat(20)) as `0x${string}`]));
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
  });
});

describe("LLR-FE-062 any other failure says nothing was changed and offers the raw error (UJ-15)", () => {
  it("shows the message and a control to copy the error when the wallet fails in some other way", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", walletError(-32603, "Internal JSON-RPC error."));
    fill();
    await ready();
    click(submit());
    const message = await within(notices()).findByText(FAILED_MESSAGE);
    expect(message.className).toContain("notice-failure");
    // The copy control sits beside the status region and not in it, so it is not read as part of the message.
    expect(within(notices().parentElement as HTMLElement).getByRole("button", { name: "Copy the error" })).toBeTruthy();
  });

  it("explains a creation that was mined and reverted after the approval, keeps the exact allowance, and retries with one prompt", async () => {
    const { world, wallet, chain } = await openCreate();
    world.outcomes = ["success", "reverted"];
    fill({ amount: "1.5" });
    await ready();
    click(submit());
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(world.sent.map((s) => s.functionName)).toEqual(["approve", "createPledge"]);
    expect(chain.allowanceOf(usdc.address, ACCOUNT, network.contract)).toBe(1_500_000n);
    expect(window.location.hash).toBe("#/create");
    const before = prompts(wallet);
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(2));
    expect(prompts(wallet) - before).toBe(1);
    expect(world.count("approve")).toBe(1);
  });

  it("explains a token that blocked the creation after the approval, and keeps the allowance (UJ-15)", async () => {
    const { wallet, world, chain } = await openCreate();
    fill({ amount: "1.5" });
    await ready();
    const restore = failSend(wallet, 2, tokenRevert("Pausable: paused"));
    click(submit());
    await within(notices()).findByText("The token issuer blocked this transfer. Nothing changed. You can try again later.");
    expect(chain.allowanceOf(usdc.address, ACCOUNT, network.contract)).toBe(1_500_000n);
    restore();
    const before = prompts(wallet);
    click(submit());
    await waitFor(() => expect(world.count("createPledge")).toBe(1));
    expect(prompts(wallet) - before).toBe(1);
  });
});

describe("LLR-FE-072 the form is operable by keyboard and its changes are announced", () => {
  it("has the status regions in the page from the first render, so what fills them is announced", async () => {
    await openCreate();
    expect(progress().getAttribute("role")).toBe("status");
    expect(notices().getAttribute("role")).toBe("status");
    expect(errorElement("Promise").getAttribute("aria-live")).toBe("polite");
  });

  it("uses native controls throughout, which a keyboard reaches in order and operates", async () => {
    await openCreate();
    const form = screen.getByRole("form", { name: "New promise" });
    const controls = Array.from(form.querySelectorAll("input, textarea, select, button")) as HTMLElement[];
    expect(controls.length).toBeGreaterThanOrEqual(10);
    for (const control of controls) expect(control.getAttribute("tabindex"), control.outerHTML).not.toBe("-1");
  });

  it("lays the controls out in the order a person fills them in", async () => {
    await openCreate();
    const order = ["Promise", "Token", "Amount", "Referee address", "Beneficiary address"].map((l) => field(l));
    const all = Array.from(document.querySelectorAll("input, textarea, select, button"));
    const positions = order.map((el) => all.indexOf(el));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(all.indexOf(submit())).toBeGreaterThan(Math.max(...positions));
  });
});

describe("LLR-FE-033 and 062 an approval that was mined but left the allowance short does not lead to a creation request", () => {
  it("stops with the general message, never reads Done. for step 1, and asks the wallet once", async () => {
    const { wallet, world } = await openCreate({ prepare: ({ world: w }) => void (w.approvalTakesNoEffect = true) });
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(world.count("approve")).toBe(1);
    expect(world.count("createPledge")).toBe(0);
    expect(prompts(wallet)).toBe(1);
    expect(progress().textContent).not.toContain("Done.");
    expect(progress().textContent).not.toContain("stays in place");
    await waitFor(() => expect(isDisabled(submit())).toBe(false));
  });
});

describe("LLR-FE-030 the balances shown are read again after each transaction the form sends", () => {
  const hint = () => describedText(field("Amount"));

  it("reads them again once the approval has confirmed, while the creation prompt is still open", async () => {
    const { chain, wallet } = await openCreate({ prepare: ({ chain: c }) => void c.setBalance(usdc.address, ACCOUNT, 100_000_000n) });
    const first = wallet.hold("eth_sendTransaction");
    const second = wallet.hold("eth_sendTransaction");
    first();
    // The approval costs gas, which on Arc comes out of the USDC balance.
    afterSend(wallet, 1, () => chain.setBalance(usdc.address, ACCOUNT, 90_000_000n));
    fill();
    await ready();
    expect(hint()).toContain("Your balance: 100 USDC.");
    click(submit());
    await waitFor(() => expect(prompts(wallet)).toBe(2));
    await waitFor(() => expect(hint()).toContain("Your balance: 90 USDC."));
    second();
  });

  it("reads them again after a creation that was mined and reverted", async () => {
    const { chain, wallet } = await openCreate({
      allowance: 5_000_000n,
      prepare: ({ world }) => void (world.outcomes = ["reverted"]),
    });
    afterSend(wallet, 1, () => chain.setBalance(usdc.address, ACCOUNT, 80_000_000n));
    fill();
    await ready();
    click(submit());
    await within(notices()).findByText(FAILED_MESSAGE);
    await waitFor(() => expect(hint()).toContain("Your balance: 80 USDC."));
  });

  it("reads the USDC balance that pays the fee when a cirBTC stake fails, and says when it has run short", async () => {
    const { chain, wallet } = await openCreate({
      prepare: ({ chain: c, world }) => {
        c.setAllowance(cirbtc.address, ACCOUNT, network.contract, 100_000_000n);
        world.outcomes = ["reverted"];
      },
    });
    afterSend(wallet, 1, () => chain.setBalance(usdc.address, ACCOUNT, 20_000n));
    fill({ token: cirbtc.address, amount: "0.5" });
    await ready();
    click(submit());
    await within(notices()).findByText(FAILED_MESSAGE);
    await waitFor(() => expect(errorFor("Amount")).toContain("You need at least 0.05 USDC"));
  });
});
