import { type SelectedNetwork, networks } from "../config/networks";

/**
 * The header's live indicator. The configured name is "Arc" for the main network, which on its own would not
 * say which of the two a visitor is on, so the indicator spells it out.
 *
 * @trace LLR-FE-013
 */
export function liveLabel(network: Pick<SelectedNetwork, "chainId">): string {
  return network.chainId === networks.mainnet.chainId ? "Live on Arc mainnet" : "Live on Arc testnet"; // LLR-FE-013
}
