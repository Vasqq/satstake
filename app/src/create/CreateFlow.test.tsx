import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { hexToBytes } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Seal } from "../design/Seal";
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
  sealedPanel,
  submit,
  type,
  usdc,
} from "../test/createHarness";
import { network, teardownWallets } from "../test/walletHarness";
import { FAILED_MESSAGE } from "../wallet/failure";
import { sealLabelOf, shareLink } from "./sealed";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
  teardownWallets();
});

const T0 = 1_789_500_000n;
const progress = () => screen.getByRole("status", { name: "Promise progress" });
const sealSvg = () => document.querySelector("svg.seal-svg");
const marksOf = (root: ParentNode) => Array.from(root.querySelectorAll("svg.seal-svg path, svg.seal-svg circle")).map((el) => el.outerHTML.replace(/ id="[^"]*"/g, ""));

function stubClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return writeText;
}

/** Fills a correct promise, presses the seal control, and waits for the panel that replaces the form's foot. */
async function seal(options: Parameters<typeof openCreate>[0] = {}, entry: Parameters<typeof fill>[0] = {}) {
  const opened = await openCreate({ allowance: 0n, ...options });
  fill(entry);
  await ready();
  click(submit());
  const panel = await sealedPanel();
  return { ...opened, panel };
}

describe("LLR-FE-037 the creation ends where it was made", () => {
  it("does not leave the page: the address is unchanged, and the form's foot gives way to the sealed panel inside the pad", async () => {
    const { panel } = await seal();
    expect(window.location.hash).toBe("#/create");
    expect(panel.closest(".pad")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /^Seal it/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /^Promise #/ })).toBeNull();
  });

  it("shows the hash of the creation transaction, not the approval's, with a copy control and an explorer link", async () => {
    const writeText = stubClipboard();
    const { panel, world } = await seal();
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
    const { panel } = await seal({ prepare: ({ world }) => void (world.nextPledgeId = 77n) });
    expect(within(panel).getByText("#77")).toBeTruthy();
    expect(within(panel).getByText("Promise number")).toBeTruthy();
  });

  it("says until when the stake is locked, in the visitor's time, from the deadline in the event", async () => {
    const { panel } = await seal({}, { deadline: "7 days" });
    const held = within(panel).getByText("Stake held").parentElement as HTMLElement;
    expect(held.textContent).toContain(formatLocalTime(T0 + 604_800n));
    expect(held.textContent).toContain("Until the payout is sent, after the referee rules or ");
  });

  it("does not say the stake is released by the verdict or the deadline alone, since only the payout moves it", async () => {
    const { panel } = await seal();
    expect(panel.textContent).not.toMatch(/Locked until/);
    expect(panel.textContent).not.toMatch(/Referee rules, or/);
  });

  it("gives the link to the promise in full, copies it, says so, and opens it", async () => {
    const writeText = stubClipboard();
    const { panel } = await seal();
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
    const { panel } = await seal();
    click(within(panel).getByRole("button", { name: "Copy the link to this promise" }));
    await within(panel).findByText("Could not copy the link.");
  });

  it("moves focus to the sealed panel, since the button that was pressed is gone", async () => {
    const { panel } = await seal();
    await waitFor(() => expect(document.activeElement).toBe(panel));
  });

  it("keeps the promise as it was written, locked, in the sentence above the pad", async () => {
    await seal({}, { promise: "Run 5 km before Friday" });
    const input = field("Promise") as HTMLTextAreaElement;
    expect(input.tagName).toBe("TEXTAREA");
    expect(input.value).toBe("Run 5 km before Friday");
    expect(input.readOnly).toBe(true);
  });

  it("offers to make another promise, which gives back an empty form and leaves the address as it is", async () => {
    await seal();
    click(screen.getByRole("button", { name: "Make another promise" }));
    expect(screen.queryByRole("region", { name: "Sealed promise" })).toBeNull();
    expect(sealSvg()).toBeNull();
    expect((field("Promise") as HTMLTextAreaElement).value).toBe("");
    expect((field("Amount") as HTMLInputElement).value).toBe("");
    expect(isDisabled(submit())).toBe(true);
    expect(window.location.hash).toBe("#/create");
  });

  it("shows the parties of the promise in the pad's head once it is sealed, from the event", async () => {
    await seal({ prepare: ({ world }) => void (world.nextPledgeId = 9n) });
    const head = document.querySelector(".pad-head") as HTMLElement;
    expect(head.textContent).toContain("Promise #9");
    expect(head.textContent).toContain(REFEREE.slice(0, 6));
    expect(head.textContent).toContain(BENEFICIARY.slice(0, 6));
  });
});

describe("LLR-FE-037 the seal is drawn from the creation hash and from no other value", () => {
  it("draws exactly the marks that the 32 bytes of the creation hash give, with the real words round the ring", async () => {
    const { world } = await seal({ prepare: ({ world: w }) => void (w.nextPledgeId = 42n) }, { amount: "1.5" });
    const hash = world.sent.find((s) => s.functionName === "createPledge")!.hash;
    const label = sealLabelOf({ id: 42n, stake: "$1.50 in USDC", networkName: network.name, hash });
    const inPage = marksOf(document.querySelector(".pad-area") as HTMLElement);
    expect(inPage.length).toBeGreaterThan(50);
    cleanup();
    const { container } = render(<Seal bytes={hexToBytes(hash)} label={label} on />);
    expect(inPage).toEqual(marksOf(container));
    expect(container.querySelector("textPath")?.textContent).toBe(label);
  });

  it("does not draw the approval's hash, and draws a different seal for a different creation", async () => {
    const first = await seal();
    const one = marksOf(document.querySelector(".pad-area") as HTMLElement);
    expect(first.world.sent.map((s) => s.functionName)).toEqual(["approve", "createPledge"]);
    cleanup();
    teardownWallets();
    // The counter of the fake wallet starts again with the new world, so the hash would repeat; a different
    // allowance makes the first transaction a creation, which is a different hash.
    await seal({ allowance: 5_000_000n });
    expect(marksOf(document.querySelector(".pad-area") as HTMLElement)).not.toEqual(one);
  });

  it("names the promise number, the stake, the network and the first digits of the hash round the ring", async () => {
    const { world } = await seal({ prepare: ({ world: w }) => void (w.nextPledgeId = 7n) }, { token: cirbtc.address, amount: "0.00001" });
    const hash = world.sent.find((s) => s.functionName === "createPledge")!.hash;
    const ring = document.querySelector("svg.seal-svg textPath")?.textContent;
    expect(ring).toBe(`PROMISE № 7 · 1,000 SATS OF CIRBTC · SEALED ON ${network.name.toUpperCase()} · ${hash.slice(2, 10).toUpperCase()}`);
  });

  it("shows no seal before the creation has landed, however far the steps have got", async () => {
    const { chain } = await openCreate({ allowance: 5_000_000n });
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Waiting for the network to confirm."));
    expect(sealSvg()).toBeNull();
    expect(screen.queryByRole("region", { name: "Sealed promise" })).toBeNull();
    open();
    await sealedPanel();
    expect(sealSvg()).not.toBeNull();
  });

  it("shows no seal for a creation whose receipt could not be used, or that reverted", async () => {
    const { world } = await openCreate({ allowance: 5_000_000n });
    world.omitCreatedEvent = true;
    fill();
    await ready();
    click(submit());
    await within(screen.getByRole("status", { name: "Create notices" })).findByText(/Your promise was sent/);
    expect(sealSvg()).toBeNull();
    expect(screen.queryByRole("region", { name: "Sealed promise" })).toBeNull();
    cleanup();
    teardownWallets();
    const reverted = await openCreate({ allowance: 5_000_000n });
    reverted.world.outcomes = ["reverted"];
    fill();
    await ready();
    click(submit());
    await within(screen.getByRole("status", { name: "Create notices" })).findByText(FAILED_MESSAGE);
    expect(sealSvg()).toBeNull();
    expect(screen.queryByRole("region", { name: "Sealed promise" })).toBeNull();
  });
});

describe("LLR-FE-037 the signature collapses into the ring before the seal appears", () => {
  it("writes the demonstration, then flies the ink onto the ring when the receipt lands, and only then shows the seal", async () => {
    const calls: string[] = [];
    const context = {
      arc: () => calls.push("arc"),
      beginPath: () => {},
      fill: () => {},
      clearRect: () => {},
      setTransform: () => {},
      drawImage: () => {},
      fillStyle: "",
      globalAlpha: 1,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const { chain, wallet } = await openCreate({ allowance: 5_000_000n });
    await waitFor(() => expect(document.querySelector(".baseline span")?.textContent).toBe("EXAMPLE SIGNATURE"), { timeout: 20_000 });
    let open = () => {};
    chain.receiptGate = new Promise<void>((resolve) => (open = resolve));
    fill();
    await ready();
    click(submit());
    await waitFor(() => expect(progress().textContent).toContain("Waiting for the network to confirm."));
    // The signature stays on the pad for as long as the creation is unconfirmed.
    expect(document.querySelector(".baseline")).not.toBeNull();
    const before = calls.length;
    open();
    await waitFor(() => expect(document.querySelector(".baseline")).toBeNull(), { timeout: 4000 });
    expect(sealSvg()).toBeNull();
    expect(screen.queryByRole("region", { name: "Sealed promise" })).toBeNull();
    // The button is still on the pad while the ink moves, and a second press must not make a second promise.
    const again = screen.getByRole("button", { name: /^Seal it/ });
    expect(again.getAttribute("aria-disabled")).toBe("true");
    click(again);
    expect(wallet.count("eth_sendTransaction")).toBe(1);
    await sealedPanel();
    expect(calls.length).toBeGreaterThan(before + 100);
    expect(sealSvg()).not.toBeNull();
  }, 60_000);
});

describe("LLR-FE-037 the pad takes no drawing and signs nothing", () => {
  it("is a picture of a signature writing itself: no clear control, no drawing surface, no pointer handler on the pad", async () => {
    await openCreate();
    expect(screen.queryByRole("button", { name: /clear/i })).toBeNull();
    const area = document.querySelector(".pad-area") as HTMLElement;
    expect(area.getAttribute("role")).toBe("img");
    expect(area.getAttribute("aria-label")).not.toMatch(/draw your/i);
    expect(document.querySelector(".pad canvas")?.getAttribute("aria-hidden")).toBe("true");
    expect(area.style.touchAction).toBe("");
  });

  it("makes the seal control an ordinary button that submits the form by click, tap or keyboard", async () => {
    await openCreate();
    const button = submit();
    expect(button.tagName).toBe("BUTTON");
    expect((button as HTMLButtonElement).type).toBe("submit");
    expect(button.closest("form")?.getAttribute("aria-label")).toBe("New promise");
  });
});

describe("LLR-FE-037 the seal control says what will be sealed", () => {
  it("is plain until there is an amount to name", async () => {
    await openCreate();
    expect(submit().textContent).toBe("Seal it");
    type("Amount", "abc");
    expect(submit().textContent).toBe("Seal it");
    type("Amount", "0");
    expect(submit().textContent).toBe("Seal it");
  });

  it("names a USDC amount in dollars and a cirBTC amount in sats, and follows the amount and the token", async () => {
    await openCreate({ balance: 1_000_000_000n });
    type("Amount", "20");
    expect(submit().textContent).toBe("Seal it with $20 in USDC");
    type("Amount", "1.5");
    expect(submit().textContent).toBe("Seal it with $1.50 in USDC");
    fireEvent.change(field("Token"), { target: { value: cirbtc.address } });
    type("Amount", "0.00001");
    expect(submit().textContent).toBe("Seal it with 1,000 sats of cirBTC");
    fireEvent.change(field("Token"), { target: { value: usdc.address } });
    expect(submit().textContent).toBe("Seal it with $0.00001 in USDC");
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
    fireEvent.blur(input);
    const described = (input.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent ?? "");
    expect(described.join(" ")).toContain("282 of 280 bytes");
    expect(described.join(" ")).toContain("Shorten the promise to 280 bytes or fewer.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("LLR-FE-070 the create page is the hero alone, with the promise in focus, and the landing keeps the pad live", () => {
  it("opens the create page on the sentence with focus in the promise, and with none of the landing's explanations", async () => {
    await openCreate();
    const input = screen.getByRole("textbox", { name: "Your promise" });
    expect(document.activeElement).toBe(input);
    expect(document.querySelector("#agreement")).toBeNull();
    expect(document.querySelector("#clock")).toBeNull();
    expect(screen.queryByRole("button", { name: /Write your own/ })).toBeNull();
    expect(document.title).toBe("New promise | SatStake");
  });

  it("opens the landing on rotating examples, with the whole explanation below and the same pad live", async () => {
    await openCreate({ hash: "#/" });
    expect(screen.queryByRole("textbox", { name: "Your promise" })).toBeNull();
    expect(document.querySelector("#agreement")).not.toBeNull();
    expect(document.querySelector("#clock")).not.toBeNull();
    expect(submit().closest("form")?.getAttribute("aria-label")).toBe("New promise");
    expect(document.activeElement).toBe(document.body);
  });

  it("creates a promise from the landing, and the landing stays", async () => {
    const { panel, world } = await seal({ hash: "#/" });
    expect(window.location.hash).toBe("#/");
    expect(world.count("createPledge")).toBe(1);
    expect(within(panel).getByText("#42")).toBeTruthy();
    expect(document.querySelector("#agreement")).not.toBeNull();
  });

  it("starts the landing's promise from the visitor's own words, never from a rotating example", async () => {
    await openCreate({ hash: "#/" });
    fill({ promise: "call my sister every Sunday" });
    expect((field("Promise") as HTMLTextAreaElement).value).toBe("call my sister every Sunday");
  });

  it("takes focus to the promise when submit is pressed on the landing before the visitor has written one", async () => {
    await openCreate({ hash: "#/" });
    click(submit());
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Your promise" }));
  });
});
