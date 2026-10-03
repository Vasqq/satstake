import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import type { SelectedNetwork } from "../config/networks";
import { type NetworkCheck, type TokenCheck, checkNetwork, checkTokens } from "./health";

/** @trace LLR-FE-005 LLR-FE-006 */
export const HEALTH_INTERVAL_MS = 30_000;

// An answer is current for one interval, so a view that mounts again soon after does not ask twice. The
// interval pauses while the page is hidden, which is query-core's default for a hidden page.
const schedule = { staleTime: HEALTH_INTERVAL_MS, refetchInterval: HEALTH_INTERVAL_MS, retry: false } as const;

export type Health = ReturnType<typeof useHealth>;

/**
 * Runs the chain check and the token check on load and every 30 seconds while the page is visible. Each
 * answer replaces the last, so a failure turns writes and creation off and a later pass turns them back on.
 *
 * @trace LLR-FE-005 LLR-FE-006
 */
export function useHealth(client: PublicClient, network: SelectedNetwork) {
  const chain = useQuery({
    queryKey: ["health", "chain", network.chainId],
    queryFn: () => checkNetwork(client, network.chainId),
    ...schedule,
  });
  const tokens = useQuery({
    queryKey: ["health", "tokens", network.chainId],
    queryFn: () => checkTokens(client, network.tokens),
    ...schedule,
  });
  const checking: NetworkCheck = { status: "checking" };
  const checks = (tokens.data ?? null) as TokenCheck[] | null;
  return {
    network: chain.data ?? checking,
    tokens: checks,
    /** False until a read has confirmed the token, and for any address that is not configured. */
    creationEnabled: (token: Address): boolean =>
      checks?.find((c) => c.token.address.toLowerCase() === token.toLowerCase())?.creationEnabled ?? false,
  };
}
