import { type PublicClient, erc20Abi, hexToNumber } from "viem";
import type { TokenConfig } from "../config/networks";

export type NetworkCheck =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "mismatch"; expected: number; actual: number }
  | { status: "unreachable" };

/** @trace LLR-FE-005 */
export async function checkNetwork(client: PublicClient, expected: number): Promise<NetworkCheck> {
  try {
    const actual = hexToNumber(await client.request({ method: "eth_chainId" }));
    return actual === expected ? { status: "ok" } : { status: "mismatch", expected, actual };
  } catch {
    // An endpoint that cannot be asked has not confirmed the chain, which is not a pass.
    return { status: "unreachable" };
  }
}

/** @trace LLR-FE-005 */
export function writeActionsEnabled(check: NetworkCheck): boolean {
  return check.status === "ok";
}

export interface TokenCheck {
  token: TokenConfig;
  status: "ok" | "mismatch" | "unavailable";
  actual?: { decimals: number; symbol: string };
  creationEnabled: boolean;
}

async function checkToken(client: PublicClient, token: TokenConfig): Promise<TokenCheck> {
  try {
    const [decimals, symbol] = await Promise.all([
      client.readContract({ address: token.address, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: token.address, abi: erc20Abi, functionName: "symbol" }),
    ]);
    const matches = decimals === token.decimals && symbol === token.symbol;
    return {
      token,
      status: matches ? "ok" : "mismatch",
      actual: { decimals, symbol },
      creationEnabled: matches,
    };
  } catch {
    // A token whose values cannot be read has not been confirmed, so creation stays off.
    return { token, status: "unavailable", creationEnabled: false };
  }
}

/** @trace LLR-FE-006 */
export function checkTokens(client: PublicClient, tokens: readonly TokenConfig[]): Promise<TokenCheck[]> {
  return Promise.all(tokens.map((token) => checkToken(client, token)));
}
