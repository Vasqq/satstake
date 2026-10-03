import { fireEvent, screen, waitFor } from "@testing-library/react";
import { type Address, getAddress } from "viem";
import { expect } from "vitest";
import { FakeWallet } from "./fakeWallet";
import { FakeWorld } from "./fakeWorld";
import { ACCOUNT, findConnected, freshChain, mountApp, network } from "./walletHarness";

export const REFEREE = getAddress("0x" + "22".repeat(20));
export const BENEFICIARY = getAddress("0x" + "33".repeat(20));

export const usdc = network.tokens.find((t) => t.symbol === "USDC")!;
export const cirbtc = network.tokens.find((t) => t.symbol === "cirBTC")!;

export const ACK_TEXT =
  "I understand that the referee alone decides whether I kept this promise. If the referee marks it broken, or has not marked it kept by the deadline, my stake goes to the beneficiary and cannot be recovered.";

export interface OpenOptions {
  /** USDC and cirBTC balance of the account, in each token's smallest unit. */
  balance?: bigint;
  /** Allowance of USDC the contract holds from the account at the start. */
  allowance?: bigint;
  walletChain?: number;
  /** Leave the wallet unconnected, so the page opens as a visitor with a wallet installed. */
  disconnected?: boolean;
  /** Add to the world before the page opens. */
  prepare?: (parts: { chain: ReturnType<typeof freshChain>; wallet: FakeWallet; world: FakeWorld }) => void;
}

/** The create page, open against a fake chain and a wallet, with a funded account. */
export async function openCreate(options: OpenOptions = {}) {
  const { balance = 100_000_000n, allowance = 0n, walletChain = network.chainId, disconnected = false } = options;
  const wallet = new FakeWallet({ chainId: walletChain, accounts: [ACCOUNT], authorized: !disconnected });
  wallet.knownChains.add(network.chainId);
  const chain = freshChain();
  chain.setBalance(usdc.address, ACCOUNT, balance);
  chain.setBalance(cirbtc.address, ACCOUNT, balance);
  chain.setAllowance(usdc.address, ACCOUNT, network.contract, allowance);
  const world = new FakeWorld(chain, wallet);
  options.prepare?.({ chain, wallet, world });
  const mounted = mountApp({ hash: "#/create", wallets: [{ wallet, name: "Alpha Wallet", rdns: "test.alpha" }], chain });
  if (!disconnected) await findConnected(ACCOUNT);
  return { ...mounted, chain, wallet, world };
}

export const field = (label: string) => screen.getByLabelText(label);
export const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
export const submit = () => screen.getByRole("button", { name: "Create pledge" });
export const isDisabled = (button: HTMLElement) =>
  (button as HTMLButtonElement).disabled || button.getAttribute("aria-disabled") === "true";

export function chooseDeadline(label: string) {
  fireEvent.click(screen.getByRole("radio", { name: label }));
}

export function tickAcknowledgement() {
  const box = screen.getByRole("checkbox", { name: ACK_TEXT }) as HTMLInputElement;
  if (!box.checked) fireEvent.click(box);
}

export interface FormEntry {
  promise?: string;
  token?: Address;
  amount?: string;
  referee?: string;
  beneficiary?: string;
  deadline?: string;
  acknowledge?: boolean;
}

/** Fills the form with a correct entry, except where the caller says otherwise. */
export function fill(entry: FormEntry = {}) {
  const { promise = "Run 5 km before Friday", token = usdc.address, amount = "1.5", referee = REFEREE, beneficiary = BENEFICIARY } = entry;
  type("Promise", promise);
  fireEvent.change(field("Token"), { target: { value: token } });
  type("Amount", amount);
  type("Referee address", referee);
  type("Beneficiary address", beneficiary);
  if (entry.deadline !== "none") chooseDeadline(entry.deadline ?? "7 days");
  if (entry.acknowledge !== false) tickAcknowledgement();
}

/** Resolves once every read the form waits on has come back and the submit control can act. */
export async function ready() {
  await waitFor(() => expect(isDisabled(submit())).toBe(false), { timeout: 4000 });
}

export function click(element: HTMLElement) {
  fireEvent.click(element);
}

/** The datetime-local value a person would pick for a Unix time, in the local zone and to the minute. */
export function localInput(timestamp: bigint): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(Number(timestamp) * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
