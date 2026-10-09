import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import type { Reads } from "../../chain/reads";
import type { SelectedNetwork } from "../../config/networks";

/** The figures are a courtesy on a page that must still work without them, so a failure is retried slowly. */
export const COUNT_RETRY_MS = 30_000;

// The card re-reads these every 30 seconds while the page is visible: it is a proof of life, not a live feed.
const retryOnlyAfterError = (query: { state: { status: string } }) => (query.state.status === "error" ? COUNT_RETRY_MS : false);

/**
 * The number of promises the contract holds. The proof strip and the rotating card both ask for it, and one
 * key means one read.
 *
 * @trace LLR-FE-070
 */
export function usePledgeCount(reads: Reads, network: SelectedNetwork) {
  return useQuery({
    queryKey: ["home", "pledgeCount", network.chainId, network.contract],
    queryFn: () => reads.pledgeCount(),
    retry: false,
    refetchInterval: retryOnlyAfterError, // LLR-FE-070
  });
}

/**
 * What the contract holds of one token right now, from `totalLocked`. Each token has its own key and its own
 * line on the page: the amounts are never added, since that would need a price.
 *
 * @trace LLR-FE-070
 */
export function useLockedNow(reads: Reads, network: SelectedNetwork, token: Address) {
  return useQuery({
    queryKey: ["home", "totalLocked", network.chainId, network.contract, token],
    queryFn: () => reads.totalLocked(token),
    retry: false,
    refetchInterval: retryOnlyAfterError, // LLR-FE-070
  });
}
