import { act, screen, within } from "@testing-library/react";
import { type Address, type Hex, encodeErrorResult, getAddress } from "viem";
import { vi } from "vitest";
import { satStakeAbi } from "../abi";
import { FakeWallet, walletError } from "./fakeWallet";
import { FakeWorld } from "./fakeWorld";
import { type FakePledge, samplePledge } from "./fakeChain";
import { ACCOUNT, findConnected, freshChain, mountApp, network, shortOf } from "./walletHarness";

export type Who = "staker" | "referee" | "beneficiary" | "other" | "none";

export const usdc = network.tokens.find((t) => t.symbol === "USDC")!;
export const cirbtc = network.tokens.find((t) => t.symbol === "cirBTC")!;

/** The three parties of a pledge the connected account has no part in, as 40-digit addresses that survive checksumming. */
export const STAKER = getAddress("0x" + "11".repeat(20));
export const REFEREE = getAddress("0x" + "22".repeat(20));
export const BENEFICIARY = getAddress("0x" + "33".repeat(20));

export interface PledgeOptions {
  /** The part the connected account plays. "none" leaves the wallet unconnected. */
  who?: Who;
  /** The `stateOf` value: 0 Active, 1 Expired, 2 Kept, 3 Broken, 4 and 5 settled. */
  state?: number;
  /** Seconds between the chain's latest block and the deadline. */
  secondsLeft?: bigint;
  token?: Address;
  amount?: bigint;
  promise?: string;
  walletChain?: number;
  /** Open without waiting for the wallet to connect, for a test of the page while it is still connecting. */
  waitForWallet?: boolean;
  /** Fake timers are in use, so the wait for the wallet is made by advancing them and not by polling in real time. */
  fakeTimers?: boolean;
  /** Add to the world before the page opens. */
  prepare?: (parts: { chain: ReturnType<typeof freshChain>; wallet: FakeWallet; world: FakeWorld; pledge: FakePledge }) => void;
}

/** The pledge page, open against a fake chain, with a wallet playing `who`. */
export async function openPledge(options: PledgeOptions = {}) {
  const {
    who = "none",
    state = 0,
    secondsLeft = 500_000n,
    token = usdc.address,
    amount = 2_500_000n,
    promise = samplePledge.promiseText,
    walletChain = network.chainId,
  } = options;
  const wallet = new FakeWallet({ chainId: walletChain, accounts: [ACCOUNT], authorized: who !== "none" });
  wallet.knownChains.add(network.chainId);
  const chain = freshChain();
  const pledge: FakePledge = {
    ...samplePledge,
    staker: who === "staker" ? ACCOUNT : STAKER,
    referee: who === "referee" ? ACCOUNT : REFEREE,
    beneficiary: who === "beneficiary" ? ACCOUNT : BENEFICIARY,
    token,
    amount,
    promiseText: promise,
    deadline: chain.blockTimestamp + secondsLeft,
  };
  chain.addPledge(1n, pledge, state);
  const world = new FakeWorld(chain, wallet);
  options.prepare?.({ chain, wallet, world, pledge });
  const mounted = mountApp({ hash: "#/p/1", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }], chain });
  if (who !== "none" && options.waitForWallet !== false) await connected(options.fakeTimers === true);
  return { ...mounted, chain, wallet, world, pledge };
}

async function connected(fakeTimers: boolean): Promise<void> {
  if (!fakeTimers) {
    await findConnected(ACCOUNT);
    return;
  }
  for (let i = 0; i < 50 && screen.queryByText(new RegExp(`^Connected: ${shortOf(ACCOUNT)}`)) === null; i++) await advance(20);
}

/** Lets timers and the promises they start settle, inside act, so React has rendered what they produced. */
export const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** The live region of the pledge's status, which is not itself a focus target. */
export const statusRegion = () => screen.getByRole("status", { name: "Promise status" });
/** The text inside it, which takes focus when the page moves focus to the status. */
export const statusLine = () => statusRegion().querySelector("p") as HTMLElement;
export const warningArea = () => screen.getByRole("status", { name: "Deadline warning" });
export const progress = () => screen.getByRole("group", { name: "Transaction progress" });
export const notices = () => screen.getByRole("status", { name: "Transaction notices" });
export const button = (name: string) => screen.getByRole("button", { name });
export const maybeButton = (name: string) => screen.queryByRole("button", { name });

/** A party's signature line in the agreement, found by its label: Staker, Referee or Beneficiary. */
export function signature(label: "Staker" | "Referee" | "Beneficiary"): HTMLElement {
  const term = within(screen.getByRole("main")).getByText(label, { selector: ".sig b" });
  return term.closest(".sig") as HTMLElement;
}

/** A revert as a wallet reports it from gas estimation: code 3 and the encoded contract error in `data`. */
export function revertedWith(errorName: string, args: unknown[] = []): Error & { code: number } {
  const data: Hex = encodeErrorResult({ abi: satStakeAbi, errorName, args } as Parameters<typeof encodeErrorResult>[0]);
  return Object.assign(walletError(3, "execution reverted"), { data });
}

/** A control that is disabled either natively or by `aria-disabled`, which keeps it reachable so its reasons can be heard. */
export const isDisabled = (element: HTMLElement) =>
  (element as HTMLButtonElement).disabled || element.getAttribute("aria-disabled") === "true";
