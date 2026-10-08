import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type PublicClient, HttpRequestError } from "viem";
import { usePublicClient } from "wagmi";
import { createReads } from "../chain/reads";
import { MineView } from "./MineView";
import { STATE_NAMES } from "./stateLabels";
import { type FakeChain, type FakePledge, samplePledge } from "../test/fakeChain";
import { FakeWallet } from "../test/fakeWallet";
import { ACCOUNT, OTHER_ACCOUNT, findConnected, freshChain, mountApp, mountUi, network, teardownWallets } from "../test/walletHarness";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  teardownWallets();
});

const USDC = network.tokens.find((t) => t.symbol === "USDC")!;
const CIRBTC = network.tokens.find((t) => t.symbol === "cirBTC")!;

/** Pledges 2 to count + 1 name the account as referee; id 1 stays the harness's sample pledge. */
function seed(chain: FakeChain, account: string, count: number, make: (id: bigint) => Partial<FakePledge> = () => ({})) {
  const ids: bigint[] = [];
  for (let i = 1; i <= count; i++) {
    const id = BigInt(i + 1);
    chain.addPledge(id, { ...samplePledge, referee: account as `0x${string}`, promiseText: `Promise number ${id}`, ...make(id) }, 0);
    ids.push(id);
  }
  chain.accountPledges.set(account.toLowerCase(), ids);
}

async function openMine(prepare: (chain: FakeChain) => void = () => {}, options: { disconnected?: boolean } = {}) {
  const wallet = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], authorized: !options.disconnected });
  const chain = freshChain();
  prepare(chain);
  mountApp({ hash: "#/mine", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }], chain });
  if (!options.disconnected) await findConnected(ACCOUNT);
  return { chain, wallet };
}

const cards = () => screen.queryAllByRole("link").filter((a) => /^#\/p\//.test(a.getAttribute("href") ?? ""));
const hrefs = () => cards().map((c) => c.getAttribute("href"));
const READING = "Reading your promises from the network.";
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const window_ = (offset: bigint, limit: bigint) => ({ account: ACCOUNT.toLowerCase(), offset, limit });

describe("LLR-FE-050 no wallet, connecting, reading, failing", () => {
  it("has the title and heading of the view", async () => {
    await openMine(() => {}, { disconnected: true });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("My promises");
    expect(document.title).toBe("My promises | SatStake");
  });

  it("says a wallet is needed when none is connected, and reads no pledge list", async () => {
    const { chain } = await openMine(() => {}, { disconnected: true });
    expect(await screen.findByText("Connect a wallet to list your promises.")).toBeTruthy();
    expect(chain.count("eth_call", "pledgeCountOf")).toBe(0);
  });

  it("says it is waiting while the wallet reconnects", async () => {
    const wallet = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], authorized: true });
    const release = wallet.hold("eth_accounts");
    mountApp({ hash: "#/mine", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }] });
    expect(await screen.findByText("Waiting for your wallet to connect.")).toBeTruthy();
    expect(screen.queryByText("Connect a wallet to list your promises.")).toBeNull();
    await act(async () => release());
    await findConnected(ACCOUNT);
    expect(screen.queryByText("Waiting for your wallet to connect.")).toBeNull();
  });

  it("says it is reading until the list answers", async () => {
    let open = () => {};
    await openMine((chain) => {
      seed(chain, ACCOUNT, 1);
      chain.gate = new Promise<void>((resolve) => (open = resolve));
    });
    expect(await screen.findByText(READING)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Make a promise" })).toBeNull();
    expect(screen.queryByText("You have not made a promise or been named in one yet.")).toBeNull();
    await act(async () => open());
    expect(await screen.findByText("Promise number 2")).toBeTruthy();
    expect(screen.queryByText(READING)).toBeNull();
  });

  it("says it is waiting while wagmi marks the connection as reconnecting, and not that none is connected", async () => {
    const wallet = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], authorized: true });
    const chain = freshChain();
    seed(chain, ACCOUNT, 1);
    const { config } = mountApp({ hash: "#/mine", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }], chain });
    await findConnected(ACCOUNT);
    await screen.findByText("Promise number 2");
    act(() => config.setState((x) => ({ ...x, status: "reconnecting" })));
    expect(await screen.findByText("Waiting for your wallet to connect.")).toBeTruthy();
    expect(screen.queryByText("Connect a wallet to list your promises.")).toBeNull();
    expect(screen.queryByText("Promise number 2")).toBeNull();
  });

  it("keeps its messages in one status element that is in the page before it is filled and is never replaced", async () => {
    const wallet = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], authorized: false });
    const chain = freshChain();
    seed(chain, ACCOUNT, 1);
    mountApp({ hash: "#/mine", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }], chain });
    const status = screen.getByRole("status", { name: "My promises status" });
    expect(await within(status).findByText("Connect a wallet to list your promises.")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect Alpha Wallet" }));
    });
    await findConnected(ACCOUNT);
    await screen.findByText("Promise number 2");
    expect(screen.getByRole("status", { name: "My promises status" })).toBe(status);
  });

  it("says the read failed and tries again every 5 seconds until it works", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { chain } = await openMine((c) => {
      seed(c, ACCOUNT, 1);
      c.callError = new HttpRequestError({ url: "https://rpc.example" });
    });
    expect(await screen.findByText("Could not read your promises. The site keeps trying while this page is open.")).toBeTruthy();
    // A failed call is never decoded, so it is counted by method, not by function name.
    const before = chain.count("eth_call");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(chain.count("eth_call")).toBe(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(chain.count("eth_call")).toBeGreaterThan(before);
    chain.callError = undefined;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_500);
    });
    expect(await screen.findByText("Promise number 2")).toBeTruthy();
    expect(screen.queryByText(/Could not read your promises/)).toBeNull();
  });

  it("says the read failed too when only the page of identifiers fails, and recovers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { chain } = await openMine((c) => {
      seed(c, ACCOUNT, 1);
      // The count read answers; the very next contract call, the page, fails.
      c.latency = (record) => {
        if (record.functionName === "pledgeCountOf") c.callError = new HttpRequestError({ url: "https://rpc.example" });
        return undefined;
      };
    });
    expect(await screen.findByText("Could not read your promises. The site keeps trying while this page is open.")).toBeTruthy();
    chain.latency = undefined;
    chain.callError = undefined;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(await screen.findByText("Promise number 2")).toBeTruthy();
  });
});

describe("LLR-FE-050 no pledges", () => {
  it("asks for no page of identifiers when the count is zero", async () => {
    const { chain } = await openMine();
    await screen.findByText("You have not made a promise or been named in one yet.");
    expect(chain.pagedReads).toEqual([]);
  });

  it("says so and links to the create view", async () => {
    await openMine();
    expect(await screen.findByText("You have not made a promise or been named in one yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Make a promise" }).getAttribute("href")).toBe("#/create");
    expect(screen.queryByText(/Newest first/)).toBeNull();
  });

  it("tells a person who was named in a promise to open the link they were sent", async () => {
    await openMine();
    expect(await screen.findByText("If a friend named you, open the link they sent.")).toBeTruthy();
  });
});

describe("LLR-FE-050 the list", () => {
  it("shows, per pledge, a link, the promise, amount, deadline, the account's role and the state", async () => {
    await openMine((chain) => {
      chain.addPledge(2n, { ...samplePledge, referee: ACCOUNT, promiseText: "Run 5 km every week", token: CIRBTC.address, amount: 10_000n }, 0);
      chain.addPledge(3n, { ...samplePledge, staker: ACCOUNT, promiseText: "Stay off the phone", token: USDC.address, amount: 5_000_000n }, 5);
      chain.addPledge(4n, { ...samplePledge, beneficiary: ACCOUNT, promiseText: "Read a book" }, 3);
      chain.accountPledges.set(ACCOUNT.toLowerCase(), [2n, 3n, 4n]);
    });
    await screen.findByText("Run 5 km every week");
    expect(hrefs()).toEqual(["#/p/4", "#/p/3", "#/p/2"]);
    const [first, second, third] = cards();
    expect(first!.textContent).toContain("Promise #4");
    expect(first!.textContent).toContain("You get it if missed");
    expect(first!.textContent).toContain(STATE_NAMES.Broken);
    expect(first!.textContent).toContain("Read a book");
    expect(second!.textContent).toContain("You made it");
    expect(second!.textContent).toContain(STATE_NAMES.SettledToBeneficiary);
    expect(second!.textContent).toContain("$5 in USDC");
    expect(third!.textContent).toContain("You judge it");
    expect(third!.textContent).toContain(STATE_NAMES.Active);
    expect(third!.textContent).toContain("10,000 sats, 0.0001 cirBTC");
    expect(third!.textContent).toMatch(/Deadline \w{3} \d{1,2}, 2026, \d{1,2}:\d{2} [AP]M/);
  });

  it("says how many pledges the account takes part in, newest first, in the singular and the plural", async () => {
    await openMine((chain) => seed(chain, ACCOUNT, 1));
    expect(await screen.findByText("You take part in 1 promise. Newest first.")).toBeTruthy();
    cleanup();
    teardownWallets();
    await openMine((chain) => seed(chain, ACCOUNT, 3));
    expect(await screen.findByText("You take part in 3 promises. Newest first.")).toBeTruthy();
  });

  it("lists newest first with no pager when everything fits on one page", async () => {
    await openMine((chain) => seed(chain, ACCOUNT, 20));
    await screen.findByText("Promise number 21");
    expect(hrefs()).toEqual(Array.from({ length: 20 }, (_, i) => `#/p/${21 - i}`));
    expect(screen.queryByRole("button", { name: "Older" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Newer" })).toBeNull();
    expect(screen.queryByText(/^Showing/)).toBeNull();
  });

  it("asks for the newest 20 first: end = count, offset = count - 20", async () => {
    const { chain } = await openMine((c) => seed(c, ACCOUNT, 45));
    await screen.findByText("Promise number 46");
    expect(chain.pagedReads).toEqual([window_(25n, 20n)]);
    expect(cards()).toHaveLength(20);
    expect(screen.getByText("Showing 1 to 20 of 45")).toBeTruthy();
  });

  it("pages older: the second page covers offset 5 limit 20, the third offset 0 limit 5, newest first within each", async () => {
    const { chain } = await openMine((c) => seed(c, ACCOUNT, 45));
    await screen.findByText("Promise number 46");
    fireEvent.click(button("Older"));
    await screen.findByText("Promise number 26");
    expect(chain.pagedReads.at(-1)).toEqual(window_(5n, 20n));
    expect(hrefs()[0]).toBe("#/p/26");
    expect(hrefs().at(-1)).toBe("#/p/7");
    expect(screen.getByText("Showing 21 to 40 of 45")).toBeTruthy();
    fireEvent.click(button("Older"));
    await screen.findByText("Promise number 6");
    expect(chain.pagedReads.at(-1)).toEqual(window_(0n, 5n));
    expect(hrefs()).toEqual(["#/p/6", "#/p/5", "#/p/4", "#/p/3", "#/p/2"]);
    expect(screen.getByText("Showing 41 to 45 of 45")).toBeTruthy();
  });

  it("disables Newer on the first page and Older on the last", async () => {
    await openMine((c) => seed(c, ACCOUNT, 45));
    await screen.findByText("Promise number 46");
    expect(button("Newer").disabled).toBe(true);
    expect(button("Older").disabled).toBe(false);
    fireEvent.click(button("Older"));
    await screen.findByText("Promise number 26");
    expect(button("Newer").disabled).toBe(false);
    expect(button("Older").disabled).toBe(false);
    fireEvent.click(button("Older"));
    await screen.findByText("Promise number 6");
    expect(button("Older").disabled).toBe(true);
    fireEvent.click(button("Newer"));
    await screen.findByText("Promise number 26");
  });

  it("makes two pages of 21 pledges, the second holding the oldest one", async () => {
    const { chain } = await openMine((c) => seed(c, ACCOUNT, 21));
    await screen.findByText("Promise number 22");
    expect(chain.pagedReads).toEqual([window_(1n, 20n)]);
    expect(button("Older").disabled).toBe(false);
    fireEvent.click(button("Older"));
    await screen.findByText("Promise number 2");
    expect(cards()).toHaveLength(1);
    expect(chain.pagedReads.at(-1)).toEqual(window_(0n, 1n));
    expect(button("Older").disabled).toBe(true);
  });

  it("keeps the pager and replaces the cards with the reading message while a page is read, and focuses the Showing line", async () => {
    const { chain } = await openMine((c) => seed(c, ACCOUNT, 45));
    await screen.findByText("Promise number 46");
    let open = () => {};
    chain.gate = new Promise<void>((resolve) => (open = resolve));
    fireEvent.click(button("Older"));
    expect(await screen.findByText(READING)).toBeTruthy();
    expect(cards()).toHaveLength(0);
    expect(button("Older")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Showing 21 to 40 of 45");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement?.closest("[role=status]")).toBeNull();
    await act(async () => open());
    await screen.findByText("Promise number 26");
  });

  it("moves focus to the Showing line only after the page has rendered it, and not when the view opens", async () => {
    const focused: (string | null)[] = [];
    const original = HTMLElement.prototype.focus;
    const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
      if (this.getAttribute("tabindex") === "-1" && /^Showing/.test(this.textContent ?? "")) focused.push(this.textContent);
      original.call(this, options);
    });
    try {
      await openMine((c) => seed(c, ACCOUNT, 45));
      await screen.findByText("Promise number 46");
      expect(focused).toEqual([]);
      fireEvent.click(button("Older"));
      await screen.findByText("Promise number 26");
      expect(focused).toEqual(["Showing 21 to 40 of 45"]);
    } finally {
      spy.mockRestore();
    }
  });

  it("does not move focus when the view opens with the count already cached and the pager drawn at once", async () => {
    const focused: (string | null)[] = [];
    const original = HTMLElement.prototype.focus;
    const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
      if (this.getAttribute("tabindex") === "-1" && /^Showing/.test(this.textContent ?? "")) focused.push(this.textContent);
      original.call(this, options);
    });
    try {
      const queryClient = new QueryClient();
      queryClient.setQueryData(["mine", "count", ACCOUNT], 45n);
      const chain = freshChain();
      seed(chain, ACCOUNT, 45);
      const wallet = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], authorized: true });
      function Open() {
        const client = usePublicClient({ chainId: network.chainId }) as PublicClient;
        const reads = useMemo(() => createReads(client, network.contract), [client]);
        return <MineView reads={reads} network={network} />;
      }
      mountUi(<Open />, { chain, queryClient, hash: "#/mine", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }] });
      await screen.findByText("Showing 1 to 20 of 45");
      await screen.findByText("Promise number 46");
      expect(focused).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("goes back to the first page and reads again when the connected account changes", async () => {
    const { chain, wallet } = await openMine((c) => {
      seed(c, ACCOUNT, 45);
      c.addPledge(900n, { ...samplePledge, referee: OTHER_ACCOUNT, promiseText: "Other person's promise" }, 0);
      c.accountPledges.set(OTHER_ACCOUNT.toLowerCase(), [900n]);
    });
    await screen.findByText("Promise number 46");
    fireEvent.click(button("Older"));
    await screen.findByText("Promise number 26");
    act(() => wallet.changeAccounts([OTHER_ACCOUNT]));
    expect(await screen.findByText("Other person's promise")).toBeTruthy();
    expect(chain.pagedReads.at(-1)?.account).toBe(OTHER_ACCOUNT.toLowerCase());
    expect(screen.queryByText("Promise number 26")).toBeNull();
    act(() => wallet.changeAccounts([ACCOUNT]));
    await screen.findByText("Promise number 46");
    expect(screen.getByText("Showing 1 to 20 of 45")).toBeTruthy();
  });

  it("reads the list when the view opens and does not poll it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { chain } = await openMine((c) => seed(c, ACCOUNT, 2));
    await screen.findByText("Promise number 2");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(chain.count("eth_call", "pledgeIdsOf")).toBe(1);
    expect(chain.count("eth_call", "pledgeCountOf")).toBe(1);
  });

  it("reads through the contract's views and never logs", async () => {
    const { chain } = await openMine((c) => seed(c, ACCOUNT, 2));
    await screen.findByText("Promise number 2");
    expect(chain.count("eth_getLogs")).toBe(0);
    const contractReads = chain.requests.filter((r) => r.to === network.contract.toLowerCase()).map((r) => r.functionName);
    for (const name of contractReads) expect(["pledgeCountOf", "pledgeIdsOf", "getPledge", "stateOf"]).toContain(name);
  });

  it("works whatever chain the wallet is on, since the read uses the configured chain", async () => {
    const wallet = new FakeWallet({ chainId: 1, accounts: [ACCOUNT], authorized: true });
    const chain = freshChain();
    seed(chain, ACCOUNT, 1);
    mountApp({ hash: "#/mine", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }], chain });
    expect(await screen.findByText("Promise number 2")).toBeTruthy();
  });

  it("shows a card whose reads fail as its number with a message, still linked", async () => {
    await openMine((chain) => {
      seed(chain, ACCOUNT, 1);
      chain.accountPledges.set(ACCOUNT.toLowerCase(), [2n, 77n]);
    });
    expect(await screen.findByText("Could not read this promise.")).toBeTruthy();
    const broken = cards().find((c) => c.getAttribute("href") === "#/p/77")!;
    expect(broken.textContent).toContain("Promise #77");
    expect(await screen.findByText("Promise number 2")).toBeTruthy();
  });

  it("shows a card whose state cannot be read as failed even though its pledge was read", async () => {
    await openMine((chain) => {
      seed(chain, ACCOUNT, 1);
      chain.pledges.set(88n, { ...samplePledge, referee: ACCOUNT, promiseText: "Pledge with no state" });
      chain.accountPledges.set(ACCOUNT.toLowerCase(), [2n, 88n]);
    });
    expect(await screen.findByText("Could not read this promise.")).toBeTruthy();
    expect(screen.queryByText("Pledge with no state")).toBeNull();
  });

  it("keeps a 280-byte promise with no spaces inside one card, whole in the page for a screen reader", async () => {
    const long = "x".repeat(280);
    await openMine((chain) => seed(chain, ACCOUNT, 1, () => ({ promiseText: long })));
    const card = (await screen.findByText(long)).closest("a")!;
    expect(card.getAttribute("href")).toBe("#/p/2");
    expect(cards()).toHaveLength(1);
  });

  it("shows a one-word promise and the smallest and largest amounts without breaking the card", async () => {
    await openMine((chain) => {
      chain.addPledge(2n, { ...samplePledge, staker: ACCOUNT, promiseText: "Run", token: CIRBTC.address, amount: 1n }, 0);
      chain.addPledge(3n, { ...samplePledge, staker: ACCOUNT, promiseText: "Save", token: USDC.address, amount: 10n ** 15n }, 0);
      chain.accountPledges.set(ACCOUNT.toLowerCase(), [2n, 3n]);
    });
    await screen.findByText("Run");
    expect(cards().map((c) => c.textContent).join(" ")).toContain("1 sat");
    expect(cards()[0]!.textContent).toContain("Save");
  });

  it("makes every card one link with no link inside it", async () => {
    await openMine((chain) => seed(chain, ACCOUNT, 2));
    await screen.findByText("Promise number 2");
    expect(cards()).toHaveLength(2);
    for (const card of cards()) expect(card.querySelectorAll("a")).toHaveLength(0);
  });
});
