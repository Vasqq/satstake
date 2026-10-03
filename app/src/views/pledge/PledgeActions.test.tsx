import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { numberToHex } from "viem";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FAILED_MESSAGE, REJECTED_MESSAGE } from "../../wallet/failure";
import { installDialogPolyfill } from "../../test/dialogPolyfill";
import { rejection, walletError } from "../../test/fakeWallet";
import {
  advance,
  button,
  isDisabled,
  maybeButton,
  notices,
  openPledge,
  progress,
  revertedWith,
  statusLine,
} from "../../test/pledgeHarness";
import { ACCOUNT, FOREIGN_CHAIN, findConnected, network, teardownWallets } from "../../test/walletHarness";

beforeAll(installDialogPolyfill);

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
  teardownWallets();
});

const UNCONFIRMED =
  "Your transaction was sent, but its confirmation could not be read. This page shows the change as soon as the network does.";

const ACTION_NAMES = /^(Kept|Broken|Claim stake|Withdraw my stake|Send stake to (staker|beneficiary))$/;

const main = () => within(screen.getByRole("main"));
const loaded = () => main().findByText("Stake", { selector: "dt" });
const dialog = () => document.querySelector("dialog") as HTMLDialogElement;
const dialogOpen = () => document.querySelector("dialog[open]") !== null;
/** Lets the effects of a change of connection run in real time. */
const pause = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
const sent = (world: { acts: unknown[] }) => world.acts.length;

describe("LLR-FE-042 the pledge page offers exactly the actions of the matrix", () => {
  it("tells a visitor with no wallet to connect, in a paragraph with no button", async () => {
    await openPledge({ who: "none", state: 0 });
    await loaded();
    expect(main().getByText("Connect a wallet to act.").tagName).toBe("P");
    expect(maybeButton("Kept")).toBeNull();
  });

  it("tells a visitor with no wallet to connect to settle on every state that can be settled", async () => {
    for (const state of [1, 2, 3]) {
      await openPledge({ who: "none", state });
      await loaded();
      expect(main().getByText("Connect a wallet to settle.").tagName).toBe("P");
      teardownWallets();
    }
  });

  it("offers nothing to a visitor on a settled pledge", async () => {
    await openPledge({ who: "none", state: 4 });
    await loaded();
    expect(main().queryByText(/Connect a wallet/)).toBeNull();
    expect(screen.queryByRole("group", { name: "Did the staker keep this promise?" })).toBeNull();
  });

  it("says it is waiting while the wallet connects, with no button", async () => {
    let release = () => {};
    await openPledge({
      who: "referee",
      waitForWallet: false,
      prepare: ({ wallet }) => void (release = wallet.hold("eth_accounts")),
    });
    await loaded();
    expect(main().getByText("Waiting for your wallet to connect.")).toBeTruthy();
    expect(maybeButton("Kept")).toBeNull();
    expect(main().queryByText("Connect a wallet to act.")).toBeNull();
    // wagmi keeps one reconnect going for the whole process, so a held one would stop every later test from connecting.
    release();
    await findConnected(ACCOUNT);
  });

  it("offers the referee of an Active pledge Kept and Broken, in a group, with the finality note", async () => {
    await openPledge({ who: "referee" });
    await loaded();
    const group = await screen.findByRole("group", { name: "Did the staker keep this promise?" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Kept", "Broken"]);
    expect(
      main().getByText("Your verdict is final. Record it before the deadline, or the stake goes to the beneficiary."),
    ).toBeTruthy();
  });

  it("gives the staker of an Active pledge a hint and no button", async () => {
    await openPledge({ who: "staker" });
    await loaded();
    expect(main().getByText("Your referee must mark this promise kept before the deadline.")).toBeTruthy();
    expect(maybeButton("Kept")).toBeNull();
  });

  it("offers an unrelated account nothing on an Active pledge", async () => {
    await openPledge({ who: "other" });
    await loaded();
    expect(screen.queryByRole("group", { name: "Did the staker keep this promise?" })).toBeNull();
    expect(maybeButton("Kept")).toBeNull();
    expect(maybeButton("Broken")).toBeNull();
    expect(main().queryByRole("button", { name: ACTION_NAMES })).toBeNull();
  });

  it("offers the beneficiary Claim stake on a Broken pledge, with where the stake goes", async () => {
    await openPledge({ who: "beneficiary", state: 3 });
    await loaded();
    expect(button("Claim stake")).toBeTruthy();
    expect(main().getByText("Anyone can send this. The full stake goes only to the beneficiary.")).toBeTruthy();
  });

  it("offers the staker Withdraw my stake on a Kept pledge, with where the stake goes", async () => {
    await openPledge({ who: "staker", state: 2 });
    await loaded();
    expect(button("Withdraw my stake")).toBeTruthy();
    expect(main().getByText("Anyone can send this. The full stake goes only to the staker.")).toBeTruthy();
  });

  it("offers an unrelated account Send stake to beneficiary on an Expired pledge", async () => {
    await openPledge({ who: "other", state: 1, secondsLeft: -10n });
    await loaded();
    expect(button("Send stake to beneficiary")).toBeTruthy();
  });

  it("offers nothing on a settled pledge to the connected parties", async () => {
    for (const who of ["staker", "referee", "beneficiary", "other"] as const) {
      await openPledge({ who, state: 5 });
      await loaded();
      expect(main().queryByRole("button", { name: ACTION_NAMES })).toBeNull();
      teardownWallets();
    }
  });

  it("shows the button disabled, with the gate's reason under it, when the wallet is on another network", async () => {
    await openPledge({ who: "referee", walletChain: FOREIGN_CHAIN });
    await loaded();
    expect(isDisabled(button("Kept"))).toBe(true);
    expect(isDisabled(button("Broken"))).toBe(true);
    expect(main().getByText(`Your wallet is on another network. Switch to ${network.name}.`)).toBeTruthy();
  });

  it("sends nothing and opens no dialog when a gated control is activated", async () => {
    const { wallet, world } = await openPledge({ who: "referee", walletChain: FOREIGN_CHAIN });
    await loaded();
    fireEvent.click(button("Kept"));
    fireEvent.click(button("Broken"));
    await pause();
    expect(dialogOpen()).toBe(false);
    expect(wallet.count("eth_sendTransaction")).toBe(0);
    expect(sent(world)).toBe(0);
  });

  it("sends nothing when the network check, and not the wallet, is what holds the controls", async () => {
    const { wallet, world } = await openPledge({ who: "referee", prepare: ({ chain }) => void (chain.chainId = 5042) });
    await loaded();
    await main().findByText("This site is connected to the wrong network, so sending transactions is turned off.");
    fireEvent.click(button("Kept"));
    fireEvent.click(button("Broken"));
    await pause();
    expect(dialogOpen()).toBe(false);
    expect(wallet.count("eth_sendTransaction")).toBe(0);
    expect(sent(world)).toBe(0);
  });

  it("does not show the gate's reasons when the controls are usable", async () => {
    await openPledge({ who: "referee" });
    await loaded();
    await waitFor(() => expect(isDisabled(button("Kept"))).toBe(false));
    expect(main().queryByText(/Your wallet is on another network/)).toBeNull();
    expect(main().queryByText(/Checking the network/)).toBeNull();
  });

  it("hides Kept and Broken when chain time is already past the deadline although the poll says Active", async () => {
    await openPledge({ who: "referee", secondsLeft: -1n });
    await loaded();
    expect(maybeButton("Kept")).toBeNull();
    expect(maybeButton("Broken")).toBeNull();
  });

  it("hides Kept and Broken while the countdown reaches zero, with no new reading", async () => {
    vi.useFakeTimers();
    await openPledge({ who: "referee", secondsLeft: 3n, fakeTimers: true });
    await advance(0);
    expect(maybeButton("Kept")).not.toBeNull();
    await advance(3000);
    expect(maybeButton("Kept")).toBeNull();
    expect(maybeButton("Broken")).toBeNull();
  });

  it("offers no verdict until the time of the network has been read", async () => {
    vi.useFakeTimers();
    await openPledge({
      who: "referee",
      fakeTimers: true,
      prepare: ({ chain }) => {
        chain.latency = (r) => (r.method === "eth_getBlockByNumber" ? new Promise<void>((resolve) => setTimeout(resolve, 5000)) : undefined);
      },
    });
    await advance(100);
    expect(maybeButton("Kept")).toBeNull();
    await advance(5000);
    expect(maybeButton("Kept")).not.toBeNull();
  });

  it("sends markKept for the pledge when Kept is activated, with no confirmation", async () => {
    const { world } = await openPledge({ who: "referee" });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await waitFor(() => expect(world.acts).toHaveLength(1));
    expect(world.acts[0]).toMatchObject({ functionName: "markKept", id: 1n });
    expect(dialogOpen()).toBe(false);
  });

  it("sends settle for the pledge when a settle button is activated", async () => {
    const { world } = await openPledge({ who: "other", state: 3 });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Send stake to beneficiary" }));
    await waitFor(() => expect(world.acts).toHaveLength(1));
    expect(world.acts[0]).toMatchObject({ functionName: "settle", id: 1n });
  });
});

describe("LLR-FE-044 Broken asks for confirmation first", () => {
  async function openDialog(options: Parameters<typeof openPledge>[0] = {}) {
    const parts = await openPledge({ who: "referee", ...options });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Broken" }));
    return parts;
  }

  it("opens a modal dialog stating where the stake goes and that the verdict is final, and sends nothing", async () => {
    const { world } = await openDialog();
    expect(dialogOpen()).toBe(true);
    expect(dialog().dataset.modal).toBe("true");
    expect(within(dialog()).getByRole("heading", { name: "Mark this promise broken?" })).toBeTruthy();
    expect(dialog().textContent).toContain("The stake of 2.5 USDC will go to the beneficiary, 0x3333…3333. Your verdict cannot be changed.");
    expect(sent(world)).toBe(0);
  });

  it("is labelled by its heading and described by its body", async () => {
    await openDialog();
    const heading = within(dialog()).getByRole("heading");
    expect(dialog().getAttribute("aria-labelledby")).toBe(heading.id);
    const body = document.getElementById(dialog().getAttribute("aria-describedby") ?? "");
    expect(body?.textContent).toBe("The stake of 2.5 USDC will go to the beneficiary, 0x3333…3333. Your verdict cannot be changed.");
  });

  it("has Cancel then Mark it broken, with focus on Cancel", async () => {
    await openDialog();
    expect(within(dialog()).getAllByRole("button", { hidden: true }).map((b) => b.textContent)).toEqual(["Cancel", "Mark it broken"]);
    expect(document.activeElement).toBe(within(dialog()).getByRole("button", { name: "Cancel", hidden: true }));
  });

  it("closes on Cancel, sends nothing, and returns focus to Broken", async () => {
    const { world } = await openDialog();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel", hidden: true }));
    expect(dialogOpen()).toBe(false);
    expect(document.activeElement).toBe(button("Broken"));
    expect(sent(world)).toBe(0);
  });

  it("treats Escape as Cancel", async () => {
    const { world } = await openDialog();
    const escape = new Event("cancel", { cancelable: true });
    fireEvent(dialog(), escape);
    // The browser closes a dialog on Escape unless the event is cancelled, and the page closes it itself.
    expect(escape.defaultPrevented).toBe(true);
    expect(dialogOpen()).toBe(false);
    expect(document.activeElement).toBe(button("Broken"));
    expect(sent(world)).toBe(0);
  });

  it("closes and sends markBroken when Mark it broken is activated", async () => {
    const { world } = await openDialog();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Mark it broken", hidden: true }));
    expect(dialogOpen()).toBe(false);
    await waitFor(() => expect(world.acts).toHaveLength(1));
    expect(world.acts[0]).toMatchObject({ functionName: "markBroken", id: 1n });
  });

  it("closes without sending, and moves focus to the status line, when chain time reaches the deadline", async () => {
    vi.useFakeTimers();
    const { world } = await openPledge({ who: "referee", secondsLeft: 3n, fakeTimers: true });
    await advance(0);
    fireEvent.click(button("Broken"));
    expect(dialogOpen()).toBe(true);
    await advance(3000);
    expect(dialogOpen()).toBe(false);
    expect(document.activeElement).toBe(statusLine());
    expect(statusLine().getAttribute("tabindex")).toBe("-1");
    expect(sent(world)).toBe(0);
  });

  it("closes without sending when the polled state leaves Active", async () => {
    vi.useFakeTimers();
    const { world, chain } = await openPledge({ who: "referee", fakeTimers: true });
    await advance(0);
    fireEvent.click(button("Broken"));
    expect(dialogOpen()).toBe(true);
    chain.states.set(1n, 2);
    await advance(4000);
    expect(dialogOpen()).toBe(false);
    expect(document.activeElement).toBe(statusLine());
    expect(sent(world)).toBe(0);
  });

  it("is not opened by Kept", async () => {
    await openPledge({ who: "referee" });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    expect(dialogOpen()).toBe(false);
  });
});

describe("LLR-FE-046 progress and result of a verdict or settle request", () => {
  const kept = async (options: Parameters<typeof openPledge>[0] = {}) => {
    const parts = await openPledge({ who: "referee", ...options });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    return parts;
  };

  it("has a progress element and a notice area from the first render", async () => {
    await openPledge({ who: "referee" });
    expect(progress().getAttribute("tabindex")).toBe("-1");
    expect(notices().textContent).toBe("");
    expect(progress().textContent).toBe("");
  });

  it("asks to confirm in the wallet, disables every action control, and moves focus to the progress element", async () => {
    const { wallet } = await openPledge({
      who: "referee",
      prepare: ({ wallet }) => void wallet.hold("eth_sendTransaction"),
    });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(progress()).findByText("Confirm in your wallet.");
    expect(isDisabled(button("Kept"))).toBe(true);
    expect(isDisabled(button("Broken"))).toBe(true);
    expect(document.activeElement).toBe(progress());
    expect(progress().getAttribute("role")).not.toBe("status");
    expect(wallet.count("eth_sendTransaction")).toBe(1);
  });

  it("sends once however often the controls are activated while the request is pending", async () => {
    let release = () => {};
    const { wallet, world } = await openPledge({
      who: "referee",
      prepare: ({ wallet }) => void (release = wallet.hold("eth_sendTransaction")),
    });
    await loaded();
    const keptButton = await screen.findByRole("button", { name: "Kept" });
    fireEvent.click(keptButton);
    fireEvent.click(keptButton);
    fireEvent.click(button("Broken"));
    expect(dialogOpen()).toBe(false);
    release();
    await within(progress()).findByText("You marked this promise kept.");
    expect(wallet.count("eth_sendTransaction")).toBe(1);
    expect(world.acts).toHaveLength(1);
  });

  it("sends once when the control is activated twice before the page has re-rendered", async () => {
    const { wallet } = await openPledge({ who: "referee" });
    await loaded();
    const keptButton = await screen.findByRole("button", { name: "Kept" });
    act(() => {
      fireEvent.click(keptButton);
      fireEvent.click(keptButton);
    });
    await within(progress()).findByText("You marked this promise kept.");
    expect(wallet.count("eth_sendTransaction")).toBe(1);
  });

  it("shows the transaction hash with copy and explorer controls once the wallet returns it", async () => {
    const { chain } = await openPledge({ who: "referee" });
    chain.receiptGate = new Promise<void>(() => {});
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(progress()).findByText("Waiting for the network to confirm.");
    const hash = `0x${"0".repeat(63)}1`;
    expect(within(progress()).getByRole("button", { name: "Copy the transaction hash" })).toBeTruthy();
    const link = within(progress()).getByRole("link", { name: "View on explorer, the transaction" });
    expect(link.getAttribute("href")).toBe(`${network.explorerUrl}/tx/${hash}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(isDisabled(button("Kept"))).toBe(true);
  });

  it("states the result of a confirmed verdict, with the hash, and moves focus to that text", async () => {
    await kept();
    const result = await within(progress()).findByText("You marked this promise kept.");
    expect(document.activeElement).toBe(result);
    expect(within(progress()).getByRole("link", { name: "View on explorer, the transaction" })).toBeTruthy();
    expect(result.closest("[role=status]")).toBeNull();
  });

  it("states Broken for a confirmed Broken verdict", async () => {
    await openPledge({ who: "referee" });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Broken" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Mark it broken", hidden: true }));
    await within(progress()).findByText("You marked this promise broken.");
  });

  it("re-reads the state at once after a confirmed receipt instead of waiting for the next poll", async () => {
    vi.useFakeTimers();
    await openPledge({ who: "referee", fakeTimers: true });
    await advance(0);
    fireEvent.click(button("Kept"));
    await advance(2500);
    // The next scheduled poll is 4 seconds after the first, so only a re-read on confirmation can have shown this.
    expect(statusLine().textContent).toBe("Kept. The referee confirmed the promise. The stake can now be returned to the staker.");
  });

  it("says where a confirmed settlement went, to the staker or to the beneficiary", async () => {
    await openPledge({ who: "staker", state: 2 });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw my stake" }));
    await within(progress()).findByText("Done. The stake was sent to the staker.");
    teardownWallets();
    await openPledge({ who: "beneficiary", state: 3 });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Claim stake" }));
    await within(progress()).findByText("Done. The stake was sent to the beneficiary.");
  });

  it("shows the contract's message for a revert found before sending, in error style, and brings the controls back", async () => {
    const { wallet, world } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", revertedWith("NotActive", [2]));
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    const message = await within(notices()).findByText("A verdict has already been recorded for this pledge.");
    expect(message.className).toContain("notice-failure");
    expect(sent(world)).toBe(0);
    await waitFor(() => expect(isDisabled(button("Kept"))).toBe(false));
  });

  it("shows the section 2.2 message, with the hash, for a revert found after sending", async () => {
    const { world } = await openPledge({
      who: "referee",
      prepare: ({ wallet, chain, world }) => {
        world.outcomes = ["reverted"];
        // The replay of the call must find the error, so it starts failing once the transaction has been mined.
        const mine = wallet.onSend as NonNullable<typeof wallet.onSend>;
        wallet.onSend = (tx) => {
          const hash = mine(tx);
          chain.callRevert = { errorName: "VerdictWindowClosed", args: [100n] };
          return hash;
        };
      },
    });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    const message = await within(notices()).findByText(
      "The deadline has passed, so a verdict can no longer be recorded. The stake now goes to the beneficiary.",
    );
    expect(message.className).toContain("notice-failure");
    expect(sent(world)).toBe(1);
    expect(within(progress()).getByRole("link", { name: "View on explorer, the transaction" })).toBeTruthy();
    expect(document.activeElement).toBe(progress());
  });

  it("falls back to the general message when a reverted receipt cannot be explained", async () => {
    const { world } = await openPledge({ who: "referee" });
    world.outcomes = ["reverted"];
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(screen.getByRole("button", { name: "Copy the error" })).toBeTruthy();
  });

  it("keeps a revert message when the account or chain changes", async () => {
    const { wallet } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", revertedWith("NotActive", [2]));
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText("A verdict has already been recorded for this pledge.");
    act(() => wallet.changeChain(FOREIGN_CHAIN));
    await pause();
    expect(within(notices()).getByText("A verdict has already been recorded for this pledge.")).toBeTruthy();
  });

  it("shows the neutral message for a wallet rejection, with no error styling, and brings the controls back", async () => {
    const { wallet, world } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", rejection());
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    const message = await within(notices()).findByText(REJECTED_MESSAGE);
    expect(message.className).not.toContain("notice-failure");
    expect(sent(world)).toBe(0);
    expect(document.activeElement).toBe(progress());
    await waitFor(() => expect(isDisabled(button("Kept"))).toBe(false));
  });

  it("removes the rejection message when a new request starts", async () => {
    const { wallet } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", rejection());
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(REJECTED_MESSAGE);
    wallet.hold("eth_sendTransaction");
    fireEvent.click(button("Kept"));
    await within(progress()).findByText("Confirm in your wallet.");
    expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull();
  });

  it("removes the general failure message when the wallet's chain changes", async () => {
    const { wallet } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", walletError(-32603, "Internal error"));
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(FAILED_MESSAGE);
    act(() => wallet.changeChain(FOREIGN_CHAIN));
    await waitFor(() => expect(within(notices()).queryByText(FAILED_MESSAGE)).toBeNull());
  });

  it("removes the rejection message when the wallet's chain changes", async () => {
    const { wallet } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", rejection());
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(REJECTED_MESSAGE);
    act(() => wallet.changeChain(FOREIGN_CHAIN));
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
  });

  it("shows the general message with a copy control for any other failure", async () => {
    const { wallet } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", walletError(-32603, "Internal error"));
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    const message = await within(notices()).findByText(FAILED_MESSAGE);
    expect(message.className).toContain("notice-failure");
    expect(screen.getByRole("button", { name: "Copy the error" })).toBeTruthy();
  });

  it("says the transaction was sent but cannot be confirmed when the receipt cannot be read, with the hash", async () => {
    const { chain, world } = await openPledge({ who: "referee" });
    chain.receiptError = new Error("receipt endpoint down");
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(
      "Your transaction was sent, but its confirmation could not be read. This page shows the change as soon as the network does.",
    );
    expect(sent(world)).toBe(1);
    expect(within(progress()).getByRole("link", { name: "View on explorer, the transaction" })).toBeTruthy();
    expect(within(notices()).queryByText(FAILED_MESSAGE)).toBeNull();
  });

  it("keeps the unconfirmed message when the connection changes, and offers the action again as the state allows", async () => {
    const { chain, wallet } = await openPledge({ who: "referee" });
    chain.receiptError = new Error("receipt endpoint down");
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(/Your transaction was sent, but its confirmation could not be read/);
    act(() => wallet.changeChain(FOREIGN_CHAIN));
    act(() => wallet.changeChain(network.chainId));
    await pause();
    expect(within(notices()).getByText(/Your transaction was sent, but its confirmation/)).toBeTruthy();
    await waitFor(() => expect(isDisabled(button("Kept"))).toBe(false));
  });

  it("stops waiting for the receipt after 3 minutes and says the transaction was sent", async () => {
    vi.useFakeTimers();
    const { chain } = await openPledge({ who: "referee", fakeTimers: true });
    chain.receiptGate = new Promise<void>(() => {});
    await advance(0);
    fireEvent.click(button("Kept"));
    await advance(179_000);
    expect(within(progress()).getByText("Waiting for the network to confirm.")).toBeTruthy();
    await advance(2_000);
    expect(within(notices()).getByText(UNCONFIRMED)).toBeTruthy();
  }, 30_000);

  it("removes the previous result when a new request starts", async () => {
    const { wallet, world } = await openPledge({ who: "other", state: 3 });
    await loaded();
    world.outcomes = ["reverted"];
    fireEvent.click(await screen.findByRole("button", { name: "Send stake to beneficiary" }));
    await within(notices()).findByText(FAILED_MESSAGE);
    wallet.hold("eth_sendTransaction");
    fireEvent.click(button("Send stake to beneficiary"));
    await within(progress()).findByText("Confirm in your wallet.");
    expect(within(notices()).queryByText(FAILED_MESSAGE)).toBeNull();
  });

  it("disables the settle control while its request is pending", async () => {
    await openPledge({
      who: "other",
      state: 3,
      prepare: ({ wallet }) => void wallet.hold("eth_sendTransaction"),
    });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Send stake to beneficiary" }));
    await within(progress()).findByText("Confirm in your wallet.");
    expect(isDisabled(button("Send stake to beneficiary"))).toBe(true);
  });
});

describe("LLR-FE-046 the request names the configured chain", () => {
  it("does not send when the wallet moved to another network without telling the page", async () => {
    const { wallet, world } = await openPledge({ who: "referee" });
    await loaded();
    await waitFor(() => expect(isDisabled(button("Kept"))).toBe(false));
    wallet.chainId = FOREIGN_CHAIN;
    fireEvent.click(button("Kept"));
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(sent(world)).toBe(0);
    expect(wallet.count("eth_sendTransaction")).toBe(0);
  });
});

type Prepare = NonNullable<Parameters<typeof openPledge>[0]>["prepare"];

describe("LLR-FE-044 the Broken dialog follows the write gate", () => {
  async function dialogOpenThenNetworkFails() {
    vi.useFakeTimers();
    const parts = await openPledge({ who: "referee", fakeTimers: true });
    await advance(0);
    fireEvent.click(button("Broken"));
    expect(dialogOpen()).toBe(true);
    // The re-check of the network runs every 30 seconds and now finds another chain.
    parts.chain.chainId = 5042;
    await advance(31_000);
    return parts;
  }

  it("closes the open dialog, and moves focus to the status line, when the gate turns off", async () => {
    await dialogOpenThenNetworkFails();
    expect(main().getByText("This site is connected to the wrong network, so sending transactions is turned off.")).toBeTruthy();
    expect(dialogOpen()).toBe(false);
    expect(document.activeElement).toBe(statusLine());
  });

  it("sends nothing when Mark it broken is activated after the gate turned off", async () => {
    const { world, wallet } = await dialogOpenThenNetworkFails();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Mark it broken", hidden: true }));
    await advance(100);
    expect(sent(world)).toBe(0);
    expect(wallet.count("eth_sendTransaction")).toBe(0);
  });
});

describe("LLR-FE-046 a confirmed request hides the controls until the polled state changes", () => {
  /** A node that still answers with the old state after the transaction was mined, as a lagging endpoint does. */
  const lagging =
    (from: number): Prepare =>
    ({ wallet, chain }) => {
      const mine = wallet.onSend as NonNullable<typeof wallet.onSend>;
      wallet.onSend = (tx) => {
        const hash = mine(tx);
        chain.states.set(1n, from);
        return hash;
      };
    };

  it("hides Kept and Broken after a confirmed verdict while the re-read still returns Active, and offers what the new state allows once it changes", async () => {
    vi.useFakeTimers();
    const { chain } = await openPledge({ who: "referee", fakeTimers: true, prepare: lagging(0) });
    await advance(0);
    fireEvent.click(button("Kept"));
    await advance(2500);
    expect(within(progress()).getByText("You marked this promise kept.")).toBeTruthy();
    expect(maybeButton("Kept")).toBeNull();
    expect(maybeButton("Broken")).toBeNull();
    expect(screen.queryByRole("group", { name: "Did the staker keep this promise?" })).toBeNull();
    chain.states.set(1n, 2);
    await advance(5000);
    expect(statusLine().textContent).toContain("Kept.");
    expect(main().queryByRole("button", { name: ACTION_NAMES })).not.toBeNull();
    expect(within(progress()).getByText("You marked this promise kept.")).toBeTruthy();
  });

  it("hides the settle control after a confirmed settlement while the re-read still returns the old state", async () => {
    vi.useFakeTimers();
    await openPledge({ who: "other", state: 3, fakeTimers: true, prepare: lagging(3) });
    await advance(0);
    fireEvent.click(button("Send stake to beneficiary"));
    await advance(2500);
    expect(within(progress()).getByText("Done. The stake was sent to the beneficiary.")).toBeTruthy();
    expect(maybeButton("Send stake to beneficiary")).toBeNull();
  });

  it("brings the controls back for a request that did not confirm", async () => {
    const { wallet } = await openPledge({ who: "referee" });
    await loaded();
    wallet.failNext("eth_sendTransaction", rejection());
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(REJECTED_MESSAGE);
    await waitFor(() => expect(maybeButton("Kept")).not.toBeNull());
  });
});

describe("LLR-FE-042 a verdict is refused at click time once chain time has reached the deadline", () => {
  /** Moves the page's monotonic clock on by `ms` for the one synchronous action, so no tick re-renders in between. */
  function afterDeadline(action: () => void, ms = 120_000) {
    const spy = vi.spyOn(performance, "now").mockReturnValue(performance.now() + ms);
    try {
      action();
    } finally {
      spy.mockRestore();
    }
  }

  it("sends nothing when Kept is activated after the deadline passed since the last render", async () => {
    const { world, wallet } = await openPledge({ who: "referee", secondsLeft: 60n });
    await loaded();
    const kept = await screen.findByRole("button", { name: "Kept" });
    await waitFor(() => expect(isDisabled(kept)).toBe(false));
    afterDeadline(() => fireEvent.click(kept));
    await pause();
    expect(sent(world)).toBe(0);
    expect(wallet.count("eth_sendTransaction")).toBe(0);
  });

  it("sends nothing when Mark it broken is activated after the deadline passed since the dialog opened", async () => {
    const { world, wallet } = await openPledge({ who: "referee", secondsLeft: 60n });
    await loaded();
    const broken = await screen.findByRole("button", { name: "Broken" });
    await waitFor(() => expect(isDisabled(broken)).toBe(false));
    fireEvent.click(broken);
    expect(dialogOpen()).toBe(true);
    afterDeadline(() => fireEvent.click(within(dialog()).getByRole("button", { name: "Mark it broken", hidden: true })));
    await pause();
    expect(sent(world)).toBe(0);
    expect(wallet.count("eth_sendTransaction")).toBe(0);
  });

  it("still sends when the deadline is not yet reached at click time", async () => {
    const { world } = await openPledge({ who: "referee", secondsLeft: 600n });
    await loaded();
    const kept = await screen.findByRole("button", { name: "Kept" });
    await waitFor(() => expect(isDisabled(kept)).toBe(false));
    afterDeadline(() => fireEvent.click(kept), 5_000);
    await waitFor(() => expect(world.acts).toHaveLength(1));
  });
});

describe("LLR-FE-046 a mined revert is replayed where it happened", () => {
  const revertedAfterSending =
    (revert: { errorName: string; args?: unknown[]; block?: string }): Prepare =>
    ({ wallet, chain, world }) => {
      world.outcomes = ["reverted"];
      const mine = wallet.onSend as NonNullable<typeof wallet.onSend>;
      wallet.onSend = (tx) => {
        const hash = mine(tx);
        chain.callRevert = revert;
        return hash;
      };
    };

  it("replays at the block before the one that mined it, with that block's time", async () => {
    const { chain } = await openPledge({
      who: "referee",
      prepare: revertedAfterSending({ errorName: "VerdictWindowClosed", args: [100n] }),
    });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(
      "The deadline has passed, so a verdict can no longer be recorded. The stake now goes to the beneficiary.",
    );
    // The fake chain mines every transaction in block 0x10.
    const replays = chain.requests.filter((r) => r.method === "eth_call" && r.params?.[1] === "0xf");
    expect(replays).toHaveLength(1);
    expect(replays[0]?.params?.[3]).toEqual({ time: numberToHex(chain.blockTimestamp) });
    // The time comes from the block that mined the transaction, not from the latest one.
    expect(chain.requests.some((r) => r.method === "eth_getBlockByNumber" && r.params?.[0] === "0x10")).toBe(true);
  });

  it("does not name a reason that only the current state gives", async () => {
    await openPledge({
      who: "referee",
      prepare: revertedAfterSending({ errorName: "NotActive", args: [2], block: "latest" }),
    });
    await loaded();
    fireEvent.click(await screen.findByRole("button", { name: "Kept" }));
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(within(notices()).queryByText("A verdict has already been recorded for this pledge.")).toBeNull();
  });
});

describe("LLR-FE-046 progress lines are announced and then focused", () => {
  it("fills a status element that was already in the page, and moves focus after the text is there", async () => {
    await openPledge({ who: "referee", prepare: ({ wallet }) => void wallet.hold("eth_sendTransaction") });
    await loaded();
    const live = progress().querySelector(".pledge-pending") as HTMLElement;
    expect(live.getAttribute("role")).toBe("status");
    expect(live.textContent).toBe("");
    expect(progress().getAttribute("role")).toBe("group");
    const kept = await screen.findByRole("button", { name: "Kept" });
    await waitFor(() => expect(isDisabled(kept)).toBe(false));
    const area = progress();
    const original = area.focus.bind(area);
    let textAtFocus: string | null = null;
    vi.spyOn(area, "focus").mockImplementation((options) => {
      textAtFocus ??= live.textContent;
      original(options);
    });
    fireEvent.click(kept);
    await within(progress()).findByText("Confirm in your wallet.");
    expect(progress().querySelector(".pledge-pending")).toBe(live);
    expect(live.textContent).toBe("Confirm in your wallet.");
    expect(textAtFocus).toBe("Confirm in your wallet.");
  });
});
