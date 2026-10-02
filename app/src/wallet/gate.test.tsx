import { act, fireEvent, screen } from "@testing-library/react";
import { HttpRequestError } from "viem";
import { usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NetworkCheck } from "../chain/health";
import { useHealth } from "../chain/useHealth";
import { FakeWallet } from "../test/fakeWallet";
import { ACCOUNT, FOREIGN_CHAIN, freshChain, mountUi, network, teardownWallets } from "../test/walletHarness";
import { WalletBar } from "./WalletBar";
import { type WalletView, type WriteGate, useWriteGate, writeGate } from "./gate";

afterEach(() => {
  vi.useRealTimers();
  teardownWallets();
});

const OK: NetworkCheck = { status: "ok" };
const wallet = (status: WalletView["status"], chainId?: number): WalletView => ({ status, chainId });
const onChain = wallet("connected", network.chainId);

const CONNECT = "Connect a wallet to act.";
const CONNECTING = "Waiting for your wallet to connect.";
const OTHER_NETWORK = `Your wallet is on another network. Switch to ${network.name}.`;
const CHECKING = "Checking the network.";
const MISMATCH = "This site is connected to the wrong network, so sending transactions is turned off.";
const UNREACHABLE = "This site could not confirm the network, so sending transactions is turned off.";

describe("LLR-FE-023 write actions are enabled only with a wallet on the configured chain and a matching network check", () => {
  it("is enabled, with nothing to explain, when all three hold", () => {
    expect(writeGate(onChain, OK, network)).toEqual({ enabled: true, reasons: [] });
  });

  it("is disabled until a wallet is connected, and says to connect one", () => {
    expect(writeGate(wallet("disconnected"), OK, network)).toEqual({ enabled: false, reasons: [CONNECT] });
  });

  it.each(["connecting", "reconnecting"] as const)("is disabled while the wallet is %s, because its chain is not yet known", (status) => {
    expect(writeGate(wallet(status, network.chainId), OK, network)).toEqual({ enabled: false, reasons: [CONNECTING] });
  });

  it.each([network.chainId - 1, network.chainId + 1, FOREIGN_CHAIN, 0])("is disabled with the switch reason for a wallet on chain %i", (chainId) => {
    expect(writeGate(wallet("connected", chainId), OK, network)).toEqual({ enabled: false, reasons: [OTHER_NETWORK] });
  });

  it("is disabled for a connected wallet that reports no chain", () => {
    expect(writeGate(wallet("connected"), OK, network)).toEqual({ enabled: false, reasons: [OTHER_NETWORK] });
  });

  it.each<[string, NetworkCheck, string]>([
    ["has not answered yet", { status: "checking" }, CHECKING],
    ["found another chain", { status: "mismatch", expected: network.chainId, actual: 1 }, MISMATCH],
    ["got no answer", { status: "unreachable" }, UNREACHABLE],
  ])("is disabled when the network check %s", (_label, check, reason) => {
    expect(writeGate(onChain, check, network)).toEqual({ enabled: false, reasons: [reason] });
  });

  it("names every condition that is unmet, and only those", () => {
    expect(writeGate(wallet("disconnected"), { status: "unreachable" }, network).reasons).toEqual([CONNECT, UNREACHABLE]);
    expect(writeGate(wallet("connected", FOREIGN_CHAIN), { status: "checking" }, network).reasons).toEqual([OTHER_NETWORK, CHECKING]);
    expect(writeGate(wallet("reconnecting", FOREIGN_CHAIN), OK, network).reasons).toEqual([CONNECTING]);
  });

  it("never reports a wallet chain for a wallet that is not connected", () => {
    const gate = writeGate(wallet("disconnected", FOREIGN_CHAIN), OK, network);
    expect(gate.reasons).toEqual([CONNECT]);
  });

  it("explains in plain words, without chain ids or method names", () => {
    const all: WriteGate[] = [
      writeGate(wallet("disconnected"), { status: "checking" }, network),
      writeGate(wallet("connected", FOREIGN_CHAIN), { status: "mismatch", expected: network.chainId, actual: 1 }, network),
      writeGate(onChain, { status: "unreachable" }, network),
    ];
    for (const reason of all.flatMap((g) => g.reasons)) {
      expect(reason).not.toMatch(/\bRPC\b|chain ?id|eth_|wallet_|\d{3,}/i);
    }
  });
});

function Harness() {
  const client = usePublicClient({ chainId: network.chainId }) as PublicClient;
  const health = useHealth(client, network);
  const gate = useWriteGate(health.network, network);
  return (
    <>
      <WalletBar network={network} />
      <button type="button" disabled={!gate.enabled}>
        Send
      </button>
      <ul aria-label="Why sending is off">
        {gate.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </>
  );
}

const send = () => screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
const reasons = () => Array.from(screen.getByRole("list", { name: "Why sending is off" }).querySelectorAll("li")).map((li) => li.textContent);
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("LLR-FE-023 the gate follows the live wallet and the most recent network check in a rendered control", () => {
  const announced = (w: FakeWallet) => [{ wallet: w, name: "Alpha Wallet", rdns: "test.alpha" }];

  it("keeps the control disabled with the reason until a wallet connects, then enables it on the configured chain", async () => {
    const w = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT] });
    mountUi(<Harness />, { wallets: announced(w) });
    await advance0();
    expect(send().disabled).toBe(true);
    expect(reasons()).toContain(CONNECT);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Alpha Wallet" }));
    await screen.findByText(/^Connected: 0x[0-9a-fA-F]{4}…/);
    await vi.waitFor(() => expect(send().disabled).toBe(false));
    expect(reasons()).toEqual([]);
  });

  it("disables the control for a wallet on another chain, and says to switch, until the wallet is on the configured chain", async () => {
    const w = new FakeWallet({ chainId: FOREIGN_CHAIN, accounts: [ACCOUNT], authorized: true });
    mountUi(<Harness />, { wallets: announced(w) });
    await screen.findByText(/^Connected: 0x[0-9a-fA-F]{4}…/);
    expect(send().disabled).toBe(true);
    expect(reasons()).toContain(OTHER_NETWORK);
    act(() => w.changeChain(network.chainId));
    await vi.waitFor(() => expect(send().disabled).toBe(false));
    expect(reasons()).toEqual([]);
    act(() => w.changeChain(FOREIGN_CHAIN));
    await vi.waitFor(() => expect(send().disabled).toBe(true));
    expect(reasons()).toEqual([OTHER_NETWORK]);
  });

  it("reads the chain from the live connection, so an unconfigured wallet chain never leaves the stored chain in charge", async () => {
    const w = new FakeWallet({ chainId: FOREIGN_CHAIN, accounts: [ACCOUNT], authorized: true });
    const { config } = mountUi(<Harness />, { wallets: announced(w) });
    await screen.findByText(/^Connected: 0x[0-9a-fA-F]{4}…/);
    expect(config.state.chainId).toBe(network.chainId);
    expect(send().disabled).toBe(true);
  });

  it("is disabled while the first network check has not answered, and enabled when it does", async () => {
    vi.useFakeTimers();
    const w = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], authorized: true });
    const chain = freshChain();
    chain.latency = (r) => (r.method === "eth_chainId" ? new Promise<void>((resolve) => setTimeout(resolve, 5_000)) : undefined);
    mountUi(<Harness />, { wallets: announced(w), chain });
    await advance(100);
    expect(screen.getByText(/^Connected: 0x[0-9a-fA-F]{4}…/)).toBeTruthy();
    expect(send().disabled).toBe(true);
    expect(reasons()).toEqual([CHECKING]);
    await advance(5_000);
    expect(send().disabled).toBe(false);
  });

  it("follows the most recent comparison: a later mismatch disables it, a later match enables it again", async () => {
    vi.useFakeTimers();
    const w = new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], authorized: true });
    const { chain } = mountUi(<Harness />, { wallets: announced(w) });
    await advance(100);
    expect(send().disabled).toBe(false);
    chain.chainId = 5042;
    await advance(30_000);
    await advance(100);
    expect(send().disabled).toBe(true);
    expect(reasons()).toEqual([MISMATCH]);
    chain.chainId = network.chainId;
    await advance(30_000);
    await advance(100);
    expect(send().disabled).toBe(false);
    chain.outage = new HttpRequestError({ url: "https://rpc.example" });
    await advance(30_000);
    await advance(100);
    expect(send().disabled).toBe(true);
    expect(reasons()).toEqual([UNREACHABLE]);
  });
});

async function advance0() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
