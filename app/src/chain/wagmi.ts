import { type Transport, defineChain } from "viem";
import { createConfig } from "wagmi";
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

/** @trace LLR-FE-003 LLR-FE-073 */
export function createAppConfig(
  network: SelectedNetwork,
  transport: Transport = createReadTransport(network.rpcUrls),
) {
  const chain = chainFor(network);
  return createConfig({
    chains: [chain],
    transports: { [chain.id]: transport },
    // No wallet is connected in this build, so there is nothing to discover.
    multiInjectedProviderDiscovery: false,
    // A contract can answer a read with a URL for the client to fetch (EIP-3668). The Content-Security-Policy
    // allows only the configured RPCs, so the lookup is off rather than left to fail in the browser.
    ccipRead: false,
  });
}
