import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLocalTime } from "../format";
import {
  BENEFICIARY,
  REFEREE,
  cirbtc,
  click,
  field,
  fill,
  isDisabled,
  openCreate,
  ready,
  signedPanel,
  submit,
  type,
  usdc,
} from "../test/createHarness";
import { network, teardownWallets } from "../test/walletHarness";
import { rejection } from "../test/fakeWallet";
import { FAILED_MESSAGE } from "../wallet/failure";
import { shareLink } from "./signed";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
  teardownWallets();
});

const T0 = 1_789_500_000n;
const progress = () => screen.getByRole("status", { name: "Promise progress" });

/** What a person meets before the promise exists: no signature box and no signed panel. */
function expectUnsigned() {
  expect(document.querySelector(".pad-area")).toBeNull();
  expect(document.querySelector(".baseline")).toBeNull();
  expect(screen.queryByRole("img", { name: /signed/i })).toBeNull();
  expect(screen.queryByRole("region", { name: "Signed promise" })).toBeNull();
}

function stubClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return writeText;
}

/** Fills a correct promise, presses the sign control, and waits for the panel that replaces the form's foot. */
async function sign(options: Parameters<typeof openCreate>[0] = {}, entry: Parameters<typeof fill>[0] = {}) {
  const opened = await openCreate({ allowance: 0n, ...options });
  fill(entry);
  await ready();
  click(submit());
  const panel = await signedPanel();
  return { ...opened, panel };
}

describe("LLR-FE-037 the creation ends where it was made", () => {
  it("does not leave the page: the address is unchanged, and the form's foot gives way to the signed panel inside the pad", async () => {
    const { panel } = await sign();
    expect(window.location.hash).toBe("#/create");
    expect(panel.closest(".pad")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Sign it/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Promise #/ })).toBeNull();
  });

  it("shows the hash of the creation transaction, not the approval's, with a copy control and an explorer link", async () => {
    const writeText = stubClipboard();
    const { panel, world } = await sign();
    const creation = world.sent.find((s) => s.functionName === "createPledge")!.hash;
    const approval = world.sent.find((s) => s.functionName === "approve")!.hash;
    const shown = panel.querySelector("code[title]");
    expect(shown?.getAttribute("title")).toBe(creation);
    expect(panel.textContent).not.toContain(approval.slice(2, 12));
    click(within(panel).getByRole("button", { name: "Copy the transaction hash" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(creation));
    const link = within(panel).getByRole("link", { name: /View on explorer/ });
    expect(link.getAttribute("href")).toBe(`${network.explorerUrl}/tx/${creation}`);
  });

  it("shows the promise number from the event of the receipt", async () => {
    const { panel } = await sign({ prepare: ({ world }) => void (world.nextPledgeId = 77n) });
    expect(within(panel).getByText("#77")).toBeTruthy();
    expect(within(panel).getByText("Promise number")).toBeTruthy();
  });

  it("says until when the stake is locked, in the visitor's time, from the deadline in the event", async () => {
    const { panel } = await sign({}, { deadline: "7 days" });
    const held = within(panel).getByText("Stake held").parentElement as HTMLElement;
    expect(held.textContent).toContain(formatLocalTime(T0 + 604_800n));
    expect(held.textContent).toContain("Until the payout is sent, after the referee rules or ");
  });

  it("does not say the stake is released by the verdict or the deadline alone, since only the payout moves it", async () => {
    const { panel } = await sign();
    expect(panel.textContent).not.toMatch(/Locked until/);
    expect(panel.textContent).not.toMatch(/Referee rules, or/);
  });

  it("gives the link to the promise in full, copies it, says so, and opens it", async () => {
    const writeText = stubClipboard();
    const { panel } = await sign();
    const link = shareLink(42n);
    expect(link).toBe(`${window.location.origin}${window.location.pathname}#/p/42`);
    expect(within(panel).getByText(link).tagName).toBe("CODE");
    click(within(panel).getByRole("button", { name: "Copy the link to this promise" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    await within(panel).findByText("Link copied.");
    expect(within(panel).getByRole("link", { name: "Open the promise" }).getAttribute("href")).toBe("#/p/42");
  });

  it("says when the link could not be copied", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } });
    const { panel } = await sign();
    click(within(panel).getByRole("button", { name: "Copy the link to this promise" }));
    await within(panel).findByText("Could not copy the link.");
  });

  it("moves focus to the signed panel, since the button that was pressed is gone", async () => {
    const { panel } = await sign();
    await waitFor(() => expect(document.activeElement).toBe(panel));
  });

  it("keeps the promise as it was written, locked, in the sentence above the pad", async () => {
    await sign({}, { promise: "Run 5 km before Friday" });
    const input = field("Promise") as HTMLTextAreaElement;
    expect(input.tagName).toBe("TEXTAREA");
    expect(input.value).toBe("Run 5 km before Friday");
    expect(input.readOnly).toBe(true);
  });

  it("offers to make another promise, which gives back an empty form", async () => {
    await sign();
    click(screen.getByRole("button", { name: "Make another promise" }));
    expect(screen.queryByRole("region", { name: "Signed promise" })).toBeNull();
    expect((field("Promise") as HTMLTextAreaElement).value).toBe("");
    expect((field("Amount") as HTMLInputElement).value).toBe("");
    expect(isDisabled(submit())).toBe(true);
    expect(window.location.hash).toBe("#/create");
    expectUnsigned();
  });

  it("shows the parties of the promise in the pad's head once it is signed, from the event", async () => {
    await sign({ prepare: ({ world }) => void (world.nextPledgeId = 9n) });
    const head = document.querySelector(".pad-head") as HTMLElement;
    expect(head.textContent).toContain("Promise #9");
    expect(head.textContent).toContain(REFEREE.slice(0, 6));
    expect(head.textContent).toContain(BENEFICIARY.slice(0, 6));
  });
});

describe("LLR-FE-037 the form shows no signature box, before or after the creation", () => {
  it("has no signature line at rest", async () => {
    await openCreate();
    expectUnsigned();
  });

  it("stays without one while the wallet is asked for the approval and for the creation", async () => {
    const { wallet } = await openCreate();
    const approval = wallet.hold("eth_sendTransaction");
    const creation = wallet.hold("eth_sendTransaction");
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Step 1 of 2"));
    expectUnsigned();
    approval();
    await waitFor(() => expect(progress().textContent).toContain("Step 2 of 2"));
    await waitFor(() => expect(wallet.count("eth_sendTransaction")).toBe(2));
    expectUnsigned();
    creation();
    await signedPanel();
    expect(document.querySelector(".pad-area")).toBeNull();
  });

  it("stays without one while the creation is sent and its receipt is awaited, then shows the panel", async () => {
    const { chain } = await openCreate({ allowance: 5_000_000n });
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Waiting for the network to confirm."));
    expectUnsigned();
    open();
    await signedPanel();
    expect(document.querySelector(".baseline")).toBeNull();
  });

  it("stays without one after the wallet refuses the request", async () => {
    const { wallet } = await openCreate({ allowance: 5_000_000n });
    wallet.failNext("eth_sendTransaction", rejection());
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(wallet.count("eth_sendTransaction")).toBe(1));
    await waitFor(() => expect(isDisabled(submit())).toBe(false));
    expectUnsigned();
  });

  it("stays without one for a creation whose receipt could not be used, or that reverted", async () => {
    const { world } = await openCreate({ allowance: 5_000_000n });
    world.omitCreatedEvent = true;
    fill();
    await ready();
    click(submit());
    await within(screen.getByRole("status", { name: "Create notices" })).findByText(/Your promise was sent/);
    expectUnsigned();
    cleanup();
    teardownWallets();
    const reverted = await openCreate({ allowance: 5_000_000n });
    reverted.world.outcomes = ["reverted"];
    fill();
    await ready();
    click(submit());
    await within(screen.getByRole("status", { name: "Create notices" })).findByText(FAILED_MESSAGE);
    expectUnsigned();
  });
});

describe("LLR-FE-037 once the creation is confirmed the panel appears, with no signature", () => {
  it("shows the panel as soon as the receipt confirms, and the sign button is gone", async () => {
    const { chain, wallet } = await openCreate({ allowance: 5_000_000n });
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Waiting for the network to confirm."));
    expectUnsigned();
    open();
    const panel = await signedPanel();
    expect(screen.queryByRole("button", { name: /^Sign it/ })).toBeNull();
    expect(screen.queryByRole("status", { name: "Signing" })).toBeNull();
    expect(document.querySelector(".pad-area")).toBeNull();
    expect(wallet.count("eth_sendTransaction")).toBe(1);
    await waitFor(() => expect(document.activeElement).toBe(panel));
  });

  it("shows the panel at once when the visitor asked for less motion", async () => {
    const { chain } = await openCreate({ allowance: 5_000_000n });
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Waiting for the network to confirm."));
    expectUnsigned();
    open();
    await screen.findByRole("region", { name: "Signed promise" }, { timeout: 500 });
    expect(document.querySelector(".baseline")).toBeNull();
  });

  it("gives the panel the promise number, the creation hash, the link to the promise and the control that copies it", async () => {
    const writeText = stubClipboard();
    const { panel, world } = await sign({ prepare: ({ world: w }) => void (w.nextPledgeId = 31n) });
    const creation = world.sent.find((s) => s.functionName === "createPledge")!.hash;
    expect(within(panel).getByText("#31")).toBeTruthy();
    expect(panel.querySelector("code[title]")?.getAttribute("title")).toBe(creation);
    expect(within(panel).getByRole("link", { name: "Open the promise" }).getAttribute("href")).toBe("#/p/31");
    expect(within(panel).getByText(shareLink(31n)).tagName).toBe("CODE");
    click(within(panel).getByRole("button", { name: "Copy the link to this promise" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(shareLink(31n)));
  });
});

describe("LLR-FE-037 the pad takes no drawing and signs nothing", () => {
  it("has no clear control and no drawing surface", async () => {
    await openCreate();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    expect(document.querySelector(".pad-area")).toBeNull();
    expect(document.querySelector(".pad canvas")).toBeNull();
  });

  it("makes the sign control an ordinary button that submits the form by click, tap or keyboard", async () => {
    await openCreate();
    const button = submit();
    expect(button.tagName).toBe("BUTTON");
    expect((button as HTMLButtonElement).type).toBe("submit");
    expect(button.closest("form")?.getAttribute("aria-label")).toBe("New promise");
  });
});

describe("LLR-FE-037 the sign control says what will be signed", () => {
  it("is plain until there is an amount to name", async () => {
    await openCreate();
    expect(submit().textContent).toBe("Sign it");
    type("Amount", "abc");
    expect(submit().textContent).toBe("Sign it");
    type("Amount", "0");
    expect(submit().textContent).toBe("Sign it");
  });

  it("names a USDC amount in dollars and a cirBTC amount in sats, and follows the amount and the token", async () => {
    await openCreate({ balance: 1_000_000_000n });
    type("Amount", "20");
    expect(submit().textContent).toBe("Sign it with $20 in USDC");
    type("Amount", "1.5");
    expect(submit().textContent).toBe("Sign it with $1.50 in USDC");
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    type("Amount", "0.00001");
    expect(submit().textContent).toBe("Sign it with 1,000 sats of cirBTC");
    fireEvent.change(field("Token"), { target: { value: usdc.address } });
    expect(submit().textContent).toBe("Sign it with $0.00001 in USDC");
  });
});

describe("LLR-FE-037 the pad holds the form: its head the stake and the parties, its foot the deadline, the statement and the steps", () => {
  it("puts token, amount, referee and beneficiary in the head and deadline, statement, button and progress in the foot", async () => {
    await openCreate();
    const head = document.querySelector(".pad-head") as HTMLElement;
    const foot = document.querySelector(".pad-foot") as HTMLElement;
    for (const label of ["Token", "Amount", "Referee address", "Beneficiary address"]) {
      expect(head.contains(field(label)), label).toBe(true);
    }
    expect(foot.contains(screen.getByRole("group", { name: "Deadline" }))).toBe(true);
    expect(foot.contains(screen.getByRole("checkbox", { name: /I understand that the referee alone decides/ }))).toBe(true);
    expect(foot.contains(submit())).toBe(true);
    expect(foot.contains(progress())).toBe(true);
  });

  it("keeps the status and the notes in one block beside the button, so the foot can be one row", async () => {
    await openCreate();
    const area = submit().closest(".submit-area") as HTMLElement;
    const notes = area.querySelector(".submit-notes") as HTMLElement;
    expect(notes).not.toBeNull();
    expect(notes.contains(submit())).toBe(false);
    expect(notes.contains(progress())).toBe(true);
    expect(notes.textContent).toContain("Your wallet may ask twice");
    expect(notes.parentElement).toBe(area);
  });

  it("keeps the promise itself in the hero's sentence, with its byte count and its failure beside it", async () => {
    await openCreate();
    const input = field("Promise");
    expect(input.closest("h1")).not.toBeNull();
    type("Promise", "é".repeat(141));
    click(submit());
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "");
    expect(described.join(" ")).toContain("282 of 280 bytes");
    expect(described.join(" ")).toContain("Shorten the promise to 280 bytes or fewer.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("LLR-FE-037 pledges are created only from the create page", () => {
  it("opens the create page on the sentence with the promise field ready, and with none of the landing's explanations", async () => {
    await openCreate();
    const input = screen.getByRole("textbox", { name: "Your promise" });
    // LLR-FE-072 leaves focus alone on a first load, so the skip link stays the first stop.
    expect(document.activeElement).not.toBe(input);
    expect(document.querySelector("#agreement")).toBeNull();
    expect(document.querySelector("#clock")).toBeNull();
    expect(screen.queryByRole("link", { name: /Write your own/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Write your own/ })).toBeNull();
    expect(document.title).toBe("New promise | SatStake");
  });

  it("asks for the promise again, and focuses it, when submit is pressed before one is written", async () => {
    await openCreate();
    click(submit());
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Your promise" }));
  });

  it("holds no form on the landing, so no promise can be made there", async () => {
    await openCreate({ hash: "#/" });
    expect(screen.queryByRole("form", { name: "New promise" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Sign it/ })).toBeNull();
    expect(document.querySelector(".pad")).toBeNull();
  });
});
