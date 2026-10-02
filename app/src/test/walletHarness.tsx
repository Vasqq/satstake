import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { getAddress } from "viem";
import { WagmiProvider, type Config } from "wagmi";
import { App } from "../App";
import { createAppConfig } from "../chain/wagmi";
import { selectNetwork } from "../config/networks";
import { FakeChain, samplePledge } from "./fakeChain";
import { type FakeWallet, announce, installWindowEthereum } from "./fakeWallet";

export const network = selectNetwork("testnet");

export const ACCOUNT = getAddress("0x" + "ab12".repeat(10));
export const OTHER_ACCOUNT = getAddress("0x" + "cd34".repeat(10));
export const shortOf = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** The one live status element of the wallet bar. */
export const walletStatus = () => screen.getByRole("status", { name: "Wallet status" });

/** Resolves when the wallet bar says the account is connected. */
export const findConnected = (address: string = ACCOUNT) => screen.findByText(new RegExp(`^Connected: ${shortOf(address)}`));

/** A chain id that is not the configured one. */
export const FOREIGN_CHAIN = 1;

export function freshChain(): FakeChain {
  const chain = new FakeChain(network.contract);
  chain.chainId = network.chainId;
  for (const t of network.tokens) chain.addToken(t.address, { decimals: t.decimals, symbol: t.symbol });
  chain.addPledge(1n, samplePledge, 0);
  return chain;
}

const configs: Config[] = [];
const cleanups: (() => void)[] = [];

export interface Announced {
  wallet: FakeWallet;
  name: string;
  rdns: string;
}

export interface Mounted {
  chain: FakeChain;
  config: Config;
  /** Announces a wallet again, as an extension that loads after the page does. */
  announceLate: (wallet: FakeWallet, name: string, rdns: string) => void;
}

/**
 * Mounts the whole application against a fake chain, with the wallets announced and window.ethereum set
 * before the application starts, which is the order a browser extension gives.
 */
export function mountApp(options: MountOptions = {}): Mounted {
  return mount(({ config }) => <App network={network} config={config} />, options);
}

/** Mounts any element under the same providers the application gives its views. */
export function mountUi(ui: ReactNode, options: MountOptions = {}): Mounted {
  return mount(
    ({ config }) => (
      <WagmiProvider config={config}>
        <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
      </WagmiProvider>
    ),
    options,
  );
}

export interface MountOptions {
  hash?: string;
  wallets?: Announced[];
  windowEthereum?: FakeWallet;
  chain?: FakeChain;
}

function mount(tree: (parts: { config: Config }) => ReactNode, options: MountOptions): Mounted {
  const { hash = "#/", wallets = [], windowEthereum, chain = freshChain() } = options;
  window.location.hash = hash;
  for (const w of wallets) cleanups.push(announce(w.wallet, w.name, w.rdns).stop);
  if (windowEthereum) cleanups.push(installWindowEthereum(windowEthereum));
  const config = createAppConfig(network, chain.transport);
  configs.push(config);
  render(tree({ config }));
  return {
    chain,
    config,
    announceLate: (wallet, name, rdns) => {
      const announced = announce(wallet, name, rdns);
      cleanups.push(announced.stop);
    },
  };
}

/**
 * Ends the page as a reload does: the tree goes, the wallets stop announcing, the configuration stops
 * listening. What the browser stores for the site is left as it is.
 */
export function reloadPage(): void {
  cleanup();
  for (const stop of cleanups.splice(0)) stop();
  // Each configuration listens for announcements on window for as long as it lives, so a later test's
  // wallet would otherwise reach the earlier tests' configurations.
  for (const config of configs.splice(0)) config._internal.mipd?.destroy();
}

/** Everything a test of the wallet leaves behind: mounted trees, event listeners, stored connections. */
export function teardownWallets(): void {
  reloadPage();
  window.localStorage.clear();
  window.location.hash = "";
}
