import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { numberToHex } from "viem";
import { afterEach, describe, expect, it } from "vitest";
import { FakeWallet, installWindowEthereum, rejection, walletError } from "../test/fakeWallet";
import { ACCOUNT, FOREIGN_CHAIN, OTHER_ACCOUNT, mountApp, network, reloadPage, shortOf, teardownWallets, walletStatus } from "../test/walletHarness";
import { shortAddress } from "./address";
import { FAILED_MESSAGE, REJECTED_MESSAGE } from "./failure";

afterEach(teardownWallets);

const alpha = (wallet: FakeWallet) => ({ wallet, name: "Alpha Wallet", rdns: "test.alpha" });
const beta = (wallet: FakeWallet) => ({ wallet, name: "Beta Wallet", rdns: "test.beta" });
const fresh = (over: Partial<ConstructorParameters<typeof FakeWallet>[0]> = {}) =>
  new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], ...over });

const bar = () => screen.getByRole("region", { name: "Wallet" });
const notices = () => screen.getByRole("status", { name: "Wallet notices" });
const connectButton = (name: string) => screen.findByRole("button", { name: `Connect ${name}` });
const connectedAddress = (short = shortOf(ACCOUNT)) => screen.findByText(new RegExp(`^Connected: ${short}`));
const isPending = (button: HTMLElement) => button.getAttribute("aria-disabled") === "true";
const PROMPTS = ["eth_requestAccounts", "wallet_requestPermissions"];
const NO_WALLET =
  "Creating or settling a promise needs a browser wallet. On a phone, open this page in your wallet app's browser. You can read every page without one.";
const CONNECT_PROMPT = "Connect a wallet to create or settle a promise. You can read every page without one.";
// Lets a reconnect that finds nothing finish, so a test that expects no prompt has given one time to appear.
const settleReconnect = async (wallet: FakeWallet) => {
  await waitFor(() => expect(wallet.count("eth_accounts")).toBeGreaterThan(0));
  // A prompt a mistaken effect would send once the reconnect is over comes a moment after it.
  await new Promise((resolve) => setTimeout(resolve, 200));
};

describe("LLR-FE-020 the shortened address", () => {
  it("keeps the first six characters and the last four around an ellipsis", () => {
    expect(shortAddress(ACCOUNT)).toBe(`${ACCOUNT.slice(0, 6)}…${ACCOUNT.slice(-4)}`);
    expect(shortAddress(ACCOUNT)).toHaveLength(11);
    expect(shortAddress(ACCOUNT)).not.toContain(ACCOUNT.slice(6, -4));
  });
});

describe("LLR-FE-020 the application lists the wallets that announce themselves over EIP-6963", () => {
  it("lists each announced wallet by name, as a button", async () => {
    mountApp({ wallets: [alpha(fresh()), beta(fresh())] });
    expect((await connectButton("Alpha Wallet")).tagName).toBe("BUTTON");
    expect((await connectButton("Beta Wallet")).tagName).toBe("BUTTON");
    expect(within(bar()).getAllByRole("button")).toHaveLength(2);
  });

  it("adds a wallet that announces itself after the page has loaded", async () => {
    const { announceLate } = mountApp({ wallets: [alpha(fresh())] });
    await connectButton("Alpha Wallet");
    expect(screen.queryByRole("button", { name: "Connect Beta Wallet" })).toBeNull();
    act(() => announceLate(fresh(), "Beta Wallet", "test.beta"));
    await connectButton("Beta Wallet");
  });

  it("connects through the wallet the user picked, and no other", async () => {
    const first = fresh();
    const second = fresh({ accounts: [OTHER_ACCOUNT] });
    mountApp({ wallets: [alpha(first), beta(second)] });
    fireEvent.click(await connectButton("Beta Wallet"));
    await connectedAddress(shortOf(OTHER_ACCOUNT));
    expect(first.methods().filter((m) => PROMPTS.includes(m))).toEqual([]);
    expect(second.count("wallet_requestPermissions")).toBe(1);
  });
});

describe("LLR-FE-020 the window.ethereum fallback applies only when no wallet announces itself", () => {
  it("offers the browser's own wallet when it is all there is", async () => {
    const w = fresh();
    mountApp({ windowEthereum: w });
    fireEvent.click(await connectButton("browser wallet"));
    await connectedAddress();
    expect(w.count("wallet_requestPermissions")).toBe(1);
  });

  it("does not offer it beside a wallet that announces itself, even when both are the same provider", async () => {
    const w = fresh();
    mountApp({ wallets: [alpha(w)], windowEthereum: w });
    await connectButton("Alpha Wallet");
    expect(screen.queryByRole("button", { name: /browser wallet/i })).toBeNull();
    expect(within(bar()).getAllByRole("button")).toHaveLength(1);
  });

  it("drops the fallback when a wallet announces itself later", async () => {
    const { announceLate } = mountApp({ windowEthereum: fresh() });
    await connectButton("browser wallet");
    act(() => announceLate(fresh(), "Beta Wallet", "test.beta"));
    await connectButton("Beta Wallet");
    expect(screen.queryByRole("button", { name: /browser wallet/i })).toBeNull();
  });
});

describe("LLR-FE-020 with no wallet at all, the application says a browser wallet is needed", () => {
  it("says so, offers no connect control, and still shows the page", async () => {
    mountApp();
    expect(within(bar()).getByText(NO_WALLET)).toBeTruthy();
    expect(within(bar()).queryByRole("button")).toBeNull();
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Put money behind your promise.");
  });

  it("does not say it when a wallet is found", async () => {
    mountApp({ wallets: [alpha(fresh())] });
    await connectButton("Alpha Wallet");
    expect(screen.queryByText(NO_WALLET)).toBeNull();
  });
});

describe("LLR-FE-020 account access is requested only when the user picks a wallet", () => {
  it("sends no account-access prompt on load, whatever wallets are present", async () => {
    const w = fresh();
    const other = fresh();
    mountApp({ wallets: [alpha(w)], windowEthereum: other });
    await connectButton("Alpha Wallet");
    await settleReconnect(w);
    expect(w.methods().filter((m) => PROMPTS.includes(m))).toEqual([]);
    expect(other.methods().filter((m) => PROMPTS.includes(m))).toEqual([]);
  });

  it("sends no account-access prompt on load for the fallback wallet either", async () => {
    const w = fresh();
    mountApp({ windowEthereum: w });
    await connectButton("browser wallet");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(w.methods().filter((m) => PROMPTS.includes(m))).toEqual([]);
  });

  it("sends the prompt only after the click", async () => {
    const w = fresh();
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await connectedAddress();
    expect(w.count("wallet_requestPermissions")).toBe(1);
  });

  it("falls back to eth_requestAccounts for a wallet without wallet_requestPermissions, still after the click", async () => {
    const w = fresh();
    w.failNext("wallet_requestPermissions", walletError(4200, "unsupported"));
    mountApp({ wallets: [alpha(w)] });
    await connectButton("Alpha Wallet");
    expect(w.count("eth_requestAccounts")).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Connect Alpha Wallet" }));
    await connectedAddress();
    expect(w.count("eth_requestAccounts")).toBe(1);
  });

  it("restores a connection the user already made, with no prompt", async () => {
    const w = fresh({ authorized: true });
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    expect(w.methods().filter((m) => PROMPTS.includes(m))).toEqual([]);
    expect(screen.queryByRole("button", { name: /^Connect / })).toBeNull();
  });

  it("shows no address and no live connect control while a remembered connection is being confirmed, then the address", async () => {
    const first = fresh();
    mountApp({ wallets: [alpha(first)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await connectedAddress();
    reloadPage();
    const again = fresh({ authorized: true });
    const release = again.hold("eth_accounts");
    mountApp({ wallets: [alpha(again)] });
    await waitFor(() => expect(again.count("eth_accounts")).toBeGreaterThan(0));
    expect(walletStatus().textContent).not.toContain(shortOf(ACCOUNT));
    expect(within(bar()).getByText(CONNECT_PROMPT)).toBeTruthy();
    expect(walletStatus().textContent).toBe("Checking your wallet.");
    const buttons = within(bar()).queryAllByRole("button") as HTMLButtonElement[];
    expect(buttons.every(isPending)).toBe(true);
    release();
    await connectedAddress();
  });

  it("treats a connection that wagmi marks as reconnecting as not yet connected: no address, connect controls disabled", async () => {
    const w = fresh({ authorized: true });
    const { config } = mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    // The state wagmi itself sets when it confirms a connection it already holds, as after a reload.
    act(() => config.setState((x) => ({ ...x, status: "reconnecting" })));
    expect(walletStatus().textContent).toBe("Checking your wallet.");
    const buttons = within(bar()).getAllByRole("button") as HTMLButtonElement[];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(isPending)).toBe(true);
    act(() => config.setState((x) => ({ ...x, status: "connected" })));
    await connectedAddress();
  });

  it("does not offer a second connect while the first prompt is open, so the wallet is asked once", async () => {
    const w = fresh();
    const release = w.hold("wallet_requestPermissions");
    mountApp({ wallets: [alpha(w)] });
    const button = await connectButton("Alpha Wallet");
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(isPending(screen.getByRole("button", { name: "Connect Alpha Wallet" }))).toBe(true));
    // aria-disabled and not the disabled attribute, so the focus stays on the control the user pressed.
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.click(screen.getByRole("button", { name: "Connect Alpha Wallet" }));
    release();
    await connectedAddress();
    expect(w.count("wallet_requestPermissions")).toBe(1);
  });
});

describe("LLR-FE-020 the connected account is shown in shortened form and follows the wallet", () => {
  it("shows the shortened address, not the full one, and removes the connect controls", async () => {
    mountApp({ wallets: [alpha(fresh())] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    const shown = await connectedAddress();
    expect(shown.textContent).toBe(`Connected: ${shortOf(ACCOUNT)} on ${network.name}.`);
    expect(bar().textContent).not.toContain(ACCOUNT);
    expect(screen.queryByRole("button", { name: /^Connect / })).toBeNull();
  });

  it("shows the first account when the wallet shares several", async () => {
    mountApp({ wallets: [alpha(fresh({ accounts: [ACCOUNT, OTHER_ACCOUNT], authorized: true }))] });
    await connectedAddress();
    expect(bar().textContent).not.toContain(shortOf(OTHER_ACCOUNT));
  });

  it("shows the new address when the user changes account in the wallet", async () => {
    const w = fresh({ authorized: true });
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    act(() => w.changeAccounts([OTHER_ACCOUNT]));
    await connectedAddress(shortOf(OTHER_ACCOUNT));
    expect(walletStatus().textContent).not.toContain(shortOf(ACCOUNT));
  });

  it("returns to the connect list when the wallet shares no account any longer", async () => {
    const w = fresh({ authorized: true });
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    act(() => w.changeAccounts([]));
    await connectButton("Alpha Wallet");
    expect(walletStatus().textContent).not.toContain(shortOf(ACCOUNT));
  });
});

describe("LLR-FE-021 every read-only view renders fully without a connected wallet", () => {
  const views: [string, string][] = [
    ["#/", "Put money behind your promise."],
    ["#/create", "New promise"],
    ["#/mine", "My promises"],
    ["#/about", "About SatStake"],
    ["#/p/1", "Promise #1"],
    ["#/nowhere", "Page not found"],
  ];

  it.each([
    ["no wallet at all", false],
    ["a wallet that is present but not connected", true],
  ])("shows every view with %s", async (_label, present) => {
    for (const [hash, heading] of views) {
      mountApp({ hash, ...(present ? { wallets: [alpha(fresh())] } : {}) });
      expect((await screen.findByRole("heading", { level: 1 })).textContent, hash).toBe(heading);
      expect(screen.getByRole("main")).toBeTruthy();
      teardownWallets();
    }
  });

  it("reads and shows a pledge's state with no wallet", async () => {
    const chain = mountApp({ hash: "#/p/1" }).chain;
    expect(await screen.findByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
    expect(chain.count("eth_call", "stateOf")).toBeGreaterThan(0);
  });

  it("shows a pledge's state for a wallet on another chain, because reads never go through the wallet", async () => {
    const w = fresh({ chainId: FOREIGN_CHAIN, authorized: true });
    const { chain } = mountApp({ hash: "#/p/1", wallets: [alpha(w)] });
    await connectedAddress();
    expect(await screen.findByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
    expect(chain.count("eth_call", "stateOf")).toBeGreaterThan(0);
    expect(w.methods().filter((m) => !["eth_accounts", "eth_chainId"].includes(m))).toEqual([]);
  });

  it("shows the views when the wallet itself fails to answer", async () => {
    const w = fresh({ authorized: true });
    // wagmi retries a failed eth_accounts a few times before it decides the wallet is not authorized.
    for (let i = 0; i < 10; i++) w.failNext("eth_accounts", walletError(-32603, "wallet is locked"));
    mountApp({ hash: "#/p/1", wallets: [alpha(w)] });
    expect(await screen.findByText("Open. Waiting for the referee's verdict.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    // wagmi allows one reconnect at a time for the whole process, so let this one finish before the next test.
    await waitFor(() => expect(w.count("eth_accounts")).toBeGreaterThanOrEqual(3), { timeout: 4_000 });
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("asks the wallet for nothing while a read-only view is shown", async () => {
    const w = fresh();
    mountApp({ hash: "#/p/1", wallets: [alpha(w)] });
    await screen.findByText("Open. Waiting for the referee's verdict.");
    await settleReconnect(w);
    expect(w.methods().filter((m) => m !== "eth_accounts")).toEqual([]);
  });
});

describe("LLR-FE-022 a wallet on another chain is told so and offered a switch it can decline", () => {
  const wrongChain = (over: Partial<ConstructorParameters<typeof FakeWallet>[0]> = {}) => fresh({ chainId: FOREIGN_CHAIN, authorized: true, ...over });
  const SWITCH = `Switch to ${network.name}`;
  const statement = () =>
    waitFor(() => expect(walletStatus().textContent).toContain(`Your wallet is on another network. SatStake runs on ${network.name}.`));

  it("says the wallet is on another network and names the configured one on the control", async () => {
    mountApp({ wallets: [alpha(wrongChain())] });
    await connectedAddress();
    await statement();
    expect(screen.getByRole("button", { name: SWITCH }).tagName).toBe("BUTTON");
  });

  it("says nothing of the kind for a wallet on the configured chain", async () => {
    mountApp({ wallets: [alpha(fresh({ authorized: true }))] });
    await connectedAddress();
    expect(screen.queryByText(/another network/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Switch to/ })).toBeNull();
  });

  it("does not ask the wallet to switch on its own, only when the control is used", async () => {
    const w = wrongChain();
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    await statement();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(w.count("wallet_switchEthereumChain")).toBe(0);
    expect(w.count("wallet_addEthereumChain")).toBe(0);
  });

  it("requests wallet_switchEthereumChain with the configured chain id, and clears the statement when the wallet switches", async () => {
    const w = wrongChain();
    w.knownChains.add(network.chainId);
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: SWITCH }));
    await waitFor(() => expect(screen.queryByText(/another network/)).toBeNull());
    expect(w.paramsOf("wallet_switchEthereumChain")).toEqual([[{ chainId: numberToHex(network.chainId) }]]);
    expect(w.count("wallet_addEthereumChain")).toBe(0);
    expect(screen.queryByRole("button", { name: /^Switch to/ })).toBeNull();
  });

  it("on error 4902 requests wallet_addEthereumChain with the configured chain, name, every RPC URL, explorer, and USDC with 18 decimals", async () => {
    const w = wrongChain();
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: SWITCH }));
    await waitFor(() => expect(screen.queryByText(/another network/)).toBeNull());
    expect(w.count("wallet_switchEthereumChain")).toBe(1);
    expect(w.paramsOf("wallet_addEthereumChain")).toEqual([
      [
        {
          chainId: numberToHex(network.chainId),
          chainName: network.name,
          rpcUrls: [...network.rpcUrls],
          blockExplorerUrls: [network.explorerUrl],
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
        },
      ],
    ]);
    expect(network.rpcUrls.length).toBeGreaterThan(1);
    expect(w.methods().indexOf("wallet_switchEthereumChain")).toBeLessThan(w.methods().indexOf("wallet_addEthereumChain"));
  });

  it("does not add the chain after a switch that failed for another reason, and says something went wrong", async () => {
    const w = wrongChain();
    w.failNext("wallet_switchEthereumChain", walletError(-32603, "internal error"));
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: SWITCH }));
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(w.count("wallet_addEthereumChain")).toBe(0);
    await statement();
  });

  it("follows the wallet when the user changes network in its own window", async () => {
    const w = fresh({ authorized: true });
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    expect(screen.queryByText(/another network/)).toBeNull();
    act(() => w.changeChain(FOREIGN_CHAIN));
    await statement();
    act(() => w.changeChain(network.chainId));
    await waitFor(() => expect(screen.queryByText(/another network/)).toBeNull());
  });

  it("keeps the statement and the control when the user declines the switch, and says nothing was sent", async () => {
    const w = wrongChain();
    w.knownChains.add(network.chainId);
    w.failNext("wallet_switchEthereumChain", rejection());
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: SWITCH }));
    await within(notices()).findByText(REJECTED_MESSAGE);
    await statement();
    expect(screen.getByRole("button", { name: SWITCH })).toBeTruthy();
    expect(w.count("wallet_addEthereumChain")).toBe(0);
  });

  it("keeps the statement when the user declines to add the chain", async () => {
    const w = wrongChain();
    w.failNext("wallet_addEthereumChain", rejection());
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: SWITCH }));
    await within(notices()).findByText(REJECTED_MESSAGE);
    await statement();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers the control again after a refusal, and a second try can succeed", async () => {
    const w = wrongChain();
    w.knownChains.add(network.chainId);
    w.failNext("wallet_switchEthereumChain", rejection());
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: SWITCH }));
    await within(notices()).findByText(REJECTED_MESSAGE);
    fireEvent.click(screen.getByRole("button", { name: SWITCH }));
    await waitFor(() => expect(screen.queryByText(/another network/)).toBeNull());
    expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull();
  });
});

describe("LLR-FE-061 a refused connection returns to the state before it, with the neutral message and no error styling", () => {
  it("shows the section 2.2 message and the connect list again", async () => {
    const w = fresh();
    w.failNext("wallet_requestPermissions", rejection());
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await within(notices()).findByText("You cancelled the request in your wallet. Nothing was sent.");
    expect(screen.getByRole("button", { name: "Connect Alpha Wallet" })).toBeTruthy();
    expect(walletStatus().textContent).not.toContain(shortOf(ACCOUNT));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(bar().querySelector("[class*=error], [class*=failure]")).toBeNull();
  });

  it("treats a refusal at eth_requestAccounts the same way", async () => {
    const w = fresh();
    w.failNext("wallet_requestPermissions", walletError(4200, "unsupported"));
    w.failNext("eth_requestAccounts", rejection());
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await within(notices()).findByText(REJECTED_MESSAGE);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lets the user try again, and clears the message when the second try connects", async () => {
    const w = fresh();
    w.failNext("wallet_requestPermissions", rejection());
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await within(notices()).findByText(REJECTED_MESSAGE);
    fireEvent.click(screen.getByRole("button", { name: "Connect Alpha Wallet" }));
    await connectedAddress();
    expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull();
  });
});

describe("LLR-FE-062 any other connection failure says nothing was changed and offers the raw error", () => {
  async function failConnect() {
    const w = fresh();
    w.failNext("wallet_requestPermissions", walletError(4200, "unsupported"));
    w.failNext("eth_requestAccounts", walletError(-32603, "wallet exploded"));
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await within(notices()).findByText(FAILED_MESSAGE);
    return w;
  }

  it("shows the message, the connect list, and a copy control", async () => {
    await failConnect();
    expect(screen.getByRole("button", { name: "Copy the error" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect Alpha Wallet" })).toBeTruthy();
    expect(walletStatus().textContent).not.toContain(shortOf(ACCOUNT));
  });

  it("copies the raw error through the clipboard", async () => {
    await failConnect();
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Copy the error" }));
      await within(notices()).findByText(/Copied\./);
      expect(written).toHaveLength(1);
      expect(written[0]).toContain("wallet exploded");
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("LLR-FE-072 the wallet controls are announced, reachable by keyboard, and fit a narrow screen", () => {
  it("has the notice container in the page from the first render, before anything has happened", () => {
    mountApp({ wallets: [alpha(fresh())] });
    expect(notices().textContent).toBe("");
  });

  it("uses native buttons that the Tab key reaches, with no tabindex taken away", async () => {
    mountApp({ wallets: [alpha(fresh()), beta(fresh())] });
    await connectButton("Alpha Wallet");
    for (const button of within(bar()).getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("tabindex")).toBeNull();
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(isPending(button)).toBe(false);
    }
  });

  it("gives the wallet area a name, and keeps it between the header and the page", async () => {
    mountApp({ wallets: [alpha(fresh())] });
    await connectButton("Alpha Wallet");
    const header = screen.getByRole("banner");
    const main = screen.getByRole("main");
    expect(header.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar().compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("LLR-FE-073 an announced wallet's icon is a data: URI, which the policy refuses, so it is never drawn", () => {
  it("renders no image and no data: URI for an announced wallet", async () => {
    mountApp({ wallets: [alpha(fresh())] });
    await connectButton("Alpha Wallet");
    expect(document.querySelectorAll("img")).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain("data:");
  });
});

describe("LLR-FE-072 one live status element carries the state of the wallet bar, in a sentence that changes", () => {
  const SWITCH = `Switch to ${network.name}`;
  const wrongChain = () => fresh({ chainId: FOREIGN_CHAIN, authorized: true });

  it("is in the page from the first render, named, and focusable by script but not by Tab", () => {
    mountApp({ wallets: [alpha(fresh())] });
    const status = walletStatus();
    expect(status.getAttribute("tabindex")).toBe("-1");
  });

  it("is empty before any connect, once the check for a remembered connection is over", async () => {
    const w = fresh();
    mountApp({ wallets: [alpha(w)] });
    await settleReconnect(w);
    expect(walletStatus().textContent).toBe("");
  });

  it("says to answer the request in the wallet while a connect is pending, then who is connected", async () => {
    const w = fresh();
    const release = w.hold("wallet_requestPermissions");
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await waitFor(() => expect(walletStatus().textContent).toBe("Waiting for your wallet. Answer the request in your wallet."));
    release();
    await connectedAddress();
    expect(walletStatus().textContent).toBe(`Connected: ${shortOf(ACCOUNT)} on ${network.name}.`);
  });

  it("says it is checking while a remembered connection is confirmed, with no address, then who is connected", async () => {
    mountApp({ wallets: [alpha(fresh())] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await connectedAddress();
    reloadPage();
    const again = fresh({ authorized: true });
    const release = again.hold("eth_accounts");
    mountApp({ wallets: [alpha(again)] });
    await waitFor(() => expect(walletStatus().textContent).toBe("Checking your wallet."));
    release();
    await connectedAddress();
  });

  it("says who is connected and that the wallet is on another network, with the configured network named", async () => {
    mountApp({ wallets: [alpha(wrongChain())] });
    await connectedAddress();
    expect(walletStatus().textContent).toBe(
      `Connected: ${shortOf(ACCOUNT)}. Your wallet is on another network. SatStake runs on ${network.name}.`,
    );
  });

  it("stays the same element when the user changes network in the wallet, and its sentence follows", async () => {
    const w = fresh({ authorized: true });
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    const status = walletStatus();
    expect(status.textContent).toBe(`Connected: ${shortOf(ACCOUNT)} on ${network.name}.`);
    act(() => w.changeChain(FOREIGN_CHAIN));
    await waitFor(() => expect(status.textContent).toContain("Your wallet is on another network."));
    expect(walletStatus()).toBe(status);
    act(() => w.changeChain(network.chainId));
    await waitFor(() => expect(status.textContent).toBe(`Connected: ${shortOf(ACCOUNT)} on ${network.name}.`));
    expect(walletStatus()).toBe(status);
  });

  it("gives the other-network state the notice frame, so it reads as the one that asks for action", async () => {
    const w = fresh({ authorized: true });
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    expect(walletStatus().className).not.toContain("wallet-status-action");
    act(() => w.changeChain(FOREIGN_CHAIN));
    await waitFor(() => expect(walletStatus().className).toContain("wallet-status-action"));
  });

  describe("and moves focus to it only when the user's own connect or switch succeeds", () => {
    it("after a connect the user started", async () => {
      mountApp({ wallets: [alpha(fresh())] });
      fireEvent.click(await connectButton("Alpha Wallet"));
      await connectedAddress();
      expect(document.activeElement).toBe(walletStatus());
    });

    it("after a switch the user started", async () => {
      const w = wrongChain();
      w.knownChains.add(network.chainId);
      mountApp({ wallets: [alpha(w)] });
      await connectedAddress();
      fireEvent.click(await screen.findByRole("button", { name: SWITCH }));
      await waitFor(() => expect(walletStatus().textContent).not.toContain("another network"));
      expect(document.activeElement).toBe(walletStatus());
    });

    it("not after a connection restored on load", async () => {
      mountApp({ wallets: [alpha(fresh({ authorized: true }))] });
      await connectedAddress();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(document.activeElement).toBe(document.body);
    });

    it("not after a change of network or account the user made inside the wallet", async () => {
      const w = fresh({ authorized: true });
      mountApp({ wallets: [alpha(w)] });
      await connectedAddress();
      act(() => w.changeChain(FOREIGN_CHAIN));
      await waitFor(() => expect(walletStatus().textContent).toContain("another network"));
      act(() => w.changeAccounts([OTHER_ACCOUNT]));
      await connectedAddress(shortOf(OTHER_ACCOUNT));
      expect(document.activeElement).toBe(document.body);
    });

    it("not when the request is refused", async () => {
      const w = fresh();
      w.failNext("wallet_requestPermissions", rejection());
      mountApp({ wallets: [alpha(w)] });
      fireEvent.click(await connectButton("Alpha Wallet"));
      await within(notices()).findByText(REJECTED_MESSAGE);
      expect(document.activeElement).not.toBe(walletStatus());
    });
  });
});

describe("LLR-FE-022 a second click on the switch control while a switch is pending sends no second request", () => {
  it("keeps the control focusable and marked pending, and asks the wallet once", async () => {
    const w = fresh({ chainId: FOREIGN_CHAIN, authorized: true });
    w.knownChains.add(network.chainId);
    const release = w.hold("wallet_switchEthereumChain");
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    const button = await screen.findByRole("button", { name: `Switch to ${network.name}` });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(isPending(button)).toBe(true));
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.click(button);
    release();
    await waitFor(() => expect(walletStatus().textContent).not.toContain("another network"));
    expect(w.count("wallet_switchEthereumChain")).toBe(1);
  });

  it("is not marked pending while nothing is pending", async () => {
    mountApp({ wallets: [alpha(fresh({ chainId: FOREIGN_CHAIN, authorized: true }))] });
    await connectedAddress();
    expect(isPending(await screen.findByRole("button", { name: `Switch to ${network.name}` }))).toBe(false);
  });
});

describe("LLR-FE-022 and 062 a failed add of the network is a failure, though wagmi wraps it as a rejection", () => {
  it("shows the LLR-FE-062 message and the copy control, not the cancelled message", async () => {
    const w = fresh({ chainId: FOREIGN_CHAIN, authorized: true });
    w.failNext("wallet_addEthereumChain", walletError(-32602, "Invalid parameters"));
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: `Switch to ${network.name}` }));
    await within(notices()).findByText(FAILED_MESSAGE);
    expect(screen.getByRole("button", { name: "Copy the error" })).toBeTruthy();
    expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull();
  });
});

describe("LLR-FE-061 a notice about an earlier request goes when the connection changes", () => {
  async function declinedSwitch() {
    const w = fresh({ chainId: FOREIGN_CHAIN, authorized: true });
    w.knownChains.add(network.chainId);
    w.failNext("wallet_switchEthereumChain", rejection());
    const { config } = mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: `Switch to ${network.name}` }));
    await within(notices()).findByText(REJECTED_MESSAGE);
    return { w, config };
  }

  it("keeps it while nothing changes", async () => {
    await declinedSwitch();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeTruthy();
  });

  it("clears it when the chain changes inside the wallet", async () => {
    const { w } = await declinedSwitch();
    act(() => w.changeChain(network.chainId));
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
  });

  it("clears it when the account changes", async () => {
    const { w } = await declinedSwitch();
    act(() => w.changeAccounts([OTHER_ACCOUNT]));
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
  });

  it("clears it when wagmi's connection status changes with the same account and chain", async () => {
    const { config } = await declinedSwitch();
    act(() => config.setState((x) => ({ ...x, status: "reconnecting" })));
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
  });

  it("clears it when the wallet disconnects", async () => {
    const { w } = await declinedSwitch();
    act(() => w.changeAccounts([]));
    await waitFor(() => expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeNull());
  });

  it("keeps the notice of a refused connection while the connection settles back to disconnected", async () => {
    const w = fresh();
    w.failNext("wallet_requestPermissions", rejection());
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    await within(notices()).findByText(REJECTED_MESSAGE);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(within(notices()).queryByText(REJECTED_MESSAGE)).toBeTruthy();
  });
});

describe("LLR-FE-020 the prompt above the connect controls", () => {
  it("says what connecting is for, in the words of the requirement's journey", async () => {
    mountApp({ wallets: [alpha(fresh())] });
    await connectButton("Alpha Wallet");
    expect(within(bar()).getByText(CONNECT_PROMPT)).toBeTruthy();
  });
});

describe("LLR-FE-020 a wallet that injects window.ethereum after the first render is offered once the page is told", () => {
  it("replaces the no-wallet sentence with the connect control when ethereum#initialized fires", async () => {
    mountApp();
    expect(within(bar()).getByText(NO_WALLET)).toBeTruthy();
    // Lets the check for a remembered connection end, so the click below is not ignored as pending.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const w = fresh();
    const remove = installWindowEthereum(w);
    try {
      act(() => void window.dispatchEvent(new Event("ethereum#initialized")));
      // Read at once, with no wait, because any later poll of the page would redraw it and hide a missing listener.
      fireEvent.click(screen.getByRole("button", { name: "Connect browser wallet" }));
      await connectedAddress();
      expect(w.count("wallet_requestPermissions")).toBe(1);
    } finally {
      remove();
    }
  });

  it("keeps the no-wallet sentence when the event fires and nothing was injected", async () => {
    mountApp();
    act(() => void window.dispatchEvent(new Event("ethereum#initialized")));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(within(bar()).getByText(NO_WALLET)).toBeTruthy();
    expect(within(bar()).queryByRole("button")).toBeNull();
  });
});

describe("LLR-FE-072 a Skip to content link comes first and moves focus to the main heading", () => {
  const focusables = () => [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex='0']")];

  it("is the first focusable element on the page, before the header and the wallet bar", async () => {
    mountApp({ wallets: [alpha(fresh())] });
    await connectButton("Alpha Wallet");
    const first = focusables()[0] as HTMLElement;
    expect(first.tagName).toBe("A");
    expect(first.textContent).toBe("Skip to content");
  });

  it("moves focus to the main heading when used, and leaves the route alone", async () => {
    mountApp({ hash: "#/about" });
    const heading = await screen.findByRole("heading", { level: 1 });
    // fireEvent returns false when the default action, a change of the address, was cancelled.
    expect(fireEvent.click(screen.getByRole("link", { name: "Skip to content" }))).toBe(false);
    expect(document.activeElement).toBe(heading);
    expect(window.location.hash).toBe("#/about");
  });
});

describe("LLR-FE-022 two activations of the switch in one task send one request", () => {
  it("asks the wallet once when the control is activated twice before React renders", async () => {
    const w = fresh({ chainId: FOREIGN_CHAIN, authorized: true });
    w.knownChains.add(network.chainId);
    const release = w.hold("wallet_switchEthereumChain");
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    const button = await screen.findByRole("button", { name: `Switch to ${network.name}` });
    act(() => {
      button.click();
      button.click();
    });
    release();
    await waitFor(() => expect(walletStatus().textContent).not.toContain("another network"));
    expect(w.count("wallet_switchEthereumChain")).toBe(1);
  });
});

describe("LLR-FE-072 focus follows a successful request only from the pressed control or the page body", () => {
  it("leaves focus where the user put it after a connect", async () => {
    const w = fresh();
    const release = w.hold("wallet_requestPermissions");
    mountApp({ wallets: [alpha(w)] });
    fireEvent.click(await connectButton("Alpha Wallet"));
    const elsewhere = screen.getByRole("link", { name: "About" });
    elsewhere.focus();
    release();
    await connectedAddress();
    expect(document.activeElement).toBe(elsewhere);
  });

  it("leaves focus where the user put it after a switch", async () => {
    const w = fresh({ chainId: FOREIGN_CHAIN, authorized: true });
    w.knownChains.add(network.chainId);
    const release = w.hold("wallet_switchEthereumChain");
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    fireEvent.click(await screen.findByRole("button", { name: `Switch to ${network.name}` }));
    const elsewhere = screen.getByRole("link", { name: "About" });
    elsewhere.focus();
    release();
    await waitFor(() => expect(walletStatus().textContent).not.toContain("another network"));
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("LLR-FE-072 a disconnect is announced", () => {
  it("says No wallet connected. when a connected wallet shares no account any longer", async () => {
    const w = fresh({ authorized: true });
    mountApp({ wallets: [alpha(w)] });
    await connectedAddress();
    act(() => w.changeAccounts([]));
    await connectButton("Alpha Wallet");
    expect(walletStatus().textContent).toBe("No wallet connected.");
  });

  it("says nothing of the kind before any wallet was connected", async () => {
    const w = fresh();
    mountApp({ wallets: [alpha(w)] });
    await settleReconnect(w);
    expect(walletStatus().textContent).toBe("");
  });
});
