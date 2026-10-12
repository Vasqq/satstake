import type { Address } from "viem";
import type { NetworkConfig } from "../config/networks";
import { formatAmount, formatSats } from "../format";

/**
 * A stake in the words of its token: sats of cirBTC and dollars for USDC, as LLR-FE-045 asks. The USDC form is
 * the shared one, so a figure reads the same here as on the promise page.
 *
 * @trace LLR-FE-037 LLR-FE-045
 */
export function stakeWords(network: Pick<NetworkConfig, "tokens">, token: Address, amount: bigint): string {
  const match = network.tokens.find((t) => t.address.toLowerCase() === token.toLowerCase());
  // The token is named, since "1,000 sats" alone would not say which token is being locked.
  if (match?.symbol === "cirBTC") return `${formatSats(amount)} of cirBTC`; // LLR-FE-045
  return formatAmount(network, token, amount);
}

/**
 * The address of a promise's page on this site, whole, as it is to be sent to the referee and the beneficiary.
 *
 * @trace LLR-FE-037
 */
export function shareLink(id: bigint): string {
  return `${window.location.origin}${window.location.pathname}#/p/${id.toString()}`; // LLR-FE-037
}
