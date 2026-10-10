import { type Address, type Hex, hexToBytes } from "viem";
import type { NetworkConfig } from "../config/networks";
import { formatAmount, formatSats } from "../format";

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * The 32 bytes a seal is drawn from, or nothing when the answer is not a transaction hash. The money has moved
 * by the time a hash is shown, so an odd answer from a wallet must cost the picture and never the page.
 *
 * @trace LLR-FE-037
 */
export function sealBytesOf(hash: string): Uint8Array | null {
  return TRANSACTION_HASH.test(hash) ? hexToBytes(hash as Hex) : null; // LLR-FE-037
}

/**
 * The words that run round the ring of the seal: every value is the real one, and none of it changes a mark.
 *
 * @trace LLR-FE-037
 */
export function sealLabelOf(parts: { id: bigint; stake: string; networkName: string; hash: string }): string {
  return `PROMISE № ${parts.id.toString()} · ${parts.stake} · SEALED ON ${parts.networkName} · ${parts.hash.slice(2, 10)}`.toUpperCase(); // LLR-FE-037
}

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
