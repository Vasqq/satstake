import { type Transport, defineChain } from "viem";
import { createConfig, injected } from "wagmi";
import type { NetworkConfig, SelectedNetwork } from "../config/networks";
import { createReadTransport } from "./transport";

/** @trace LLR-FE-003 */
export function chainFor(network: NetworkConfig) {
  return defineChain({
    id: network.chainId,
    name: network.name,
    // The native balance of Arc is USDC with 18 decimals; stakes never use it (01 V-05).
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [...network.rpcUrls] } },
    blockExplorers: { default: { name: "Arc Explorer", url: network.explorerUrl } },
  });
}

/** @trace LLR-FE-003 LLR-FE-020 LLR-FE-073 */
export function createAppConfig(
  network: SelectedNetwork,
  transport: Transport = createReadTransport(network.rpcUrls),
) {
  const chain = chainFor(network);
  return createConfig({
    chains: [chain],
    transports: { [chain.id]: transport },
    // EIP-6963 gives one connector per wallet that announces itself, including ones that announce late.
    multiInjectedProviderDiscovery: true,
    // The window.ethereum fallback. It has no rdns, so wagmi never drops it beside an announced wallet; the
    // wallet bar hides it in that case. It also listens for no wallet events until it has been used.
    connectors: [injected()],
    // A contract can answer a read with a URL for the client to fetch (EIP-3668). The Content-Security-Policy
    // allows only the configured RPCs, so the lookup is off rather than left to fail in the browser.
    ccipRead: false,
  });
}

/**
 * What wallet_addEthereumChain carries beyond the chain id. Without it wagmi would send only the first RPC
 * URL, so a wallet added on the first URL alone would have no fallback when that URL is down.
 *
 * @trace LLR-FE-022
 */
export function addChainParameter(network: NetworkConfig) {
  const chain = chainFor(network);
  return {
    chainName: chain.name,
    rpcUrls: [...network.rpcUrls],
    blockExplorerUrls: [network.explorerUrl],
    nativeCurrency: chain.nativeCurrency,
  };
}
