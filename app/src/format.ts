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
