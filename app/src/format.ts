import { formatUnits } from "viem";
import type { NetworkConfig } from "./config/networks";
import { shortAddress } from "./wallet/address";

/**
 * An amount of cirBTC as satoshis, which are its smallest unit (8 decimals), written as a grouped integer. The
 * grouping is fixed to commas and does not follow the visitor's locale, so the same amount reads the same for
 * every visitor and in every screenshot.
 *
 * @trace LLR-FE-045
 */
export function formatSats(units: bigint): string {
  return `${units.toLocaleString("en-US")} ${units === 1n ? "sat" : "sats"}`; // LLR-FE-045
}

/**
 * An amount with its token's symbol, and for cirBTC its value in sats as well, since sats are how a holder of
 * the token counts it. A token the network does not list cannot be a pledge's token while the allowlist holds,
 * so it is written as raw units rather than guessed at.
 *
 * @trace LLR-FE-040 LLR-FE-045
 */
export function formatAmount(network: Pick<NetworkConfig, "tokens">, token: string, amount: bigint): string {
  const match = network.tokens.find((t) => t.address.toLowerCase() === token.toLowerCase());
  if (match === undefined) return `${amount.toString()} units of ${shorten(token)}`; // LLR-FE-040
  const text = `${formatUnits(amount, match.decimals)} ${match.symbol}`; // LLR-FE-040
  return match.symbol === "cirBTC" ? `${text} (${formatSats(amount)})` : text; // LLR-FE-045
}

/**
 * The format is fixed to English and a 12-hour clock so the same moment reads the same in every screenshot;
 * the zone is the visitor's own, since a deadline is something a person plans a day around. The formatter is
 * built per call because it fixes the zone when it is made.
 *
 * @trace LLR-FE-040
 */
export function formatLocalTime(seconds: bigint | number): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(Number(seconds) * 1000)); // LLR-FE-040
}

/** @trace LLR-FE-040 */
export function shorten(hex: string): string {
  return shortAddress(hex); // LLR-FE-040
}
