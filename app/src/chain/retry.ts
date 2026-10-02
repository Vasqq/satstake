import { HttpRequestError, TimeoutError } from "viem";

/** @trace LLR-FE-004 */
export const RETRY_DELAYS_MS = [250, 500, 1000] as const;

// Arc's public endpoint is load balanced across backends with different heads, and one that has not
// indexed the requested block answers -32014 (01 V-11). Asking again usually reaches another backend.
const DATA_NOT_AVAILABLE = -32014;

// A load balancer in front of a single endpoint answers 429 or 5xx while a backend is restarting. Mainnet
// has one configured URL, so without retrying these the fallback transport has nowhere else to go (UJ-90).
export const isRetryableStatus = (status: number) => status === 429 || (status >= 500 && status <= 599);

/**
 * Raised by the read transport's fetch wrapper when the request got no HTTP response. viem reports a failed
 * fetch and an unparsable body alike as an HttpRequestError with no status, so the cause is what tells a
 * network error, which is retried, from a response that arrived and was bad, which is not.
 *
 * @trace LLR-FE-004
 */
export class NoResponseError extends Error {}

/**
 * Retried: JSON-RPC -32014, an HTTP 429 or 5xx status, and a network error, which is a request that got no
 * HTTP response at all (a failed fetch or a timeout). Any other answer is final.
 *
 * @trace LLR-FE-004
 */
export function isRetryable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < 8; depth++) {
    if ("code" in current && current.code === DATA_NOT_AVAILABLE) return true;
    if (current instanceof HttpRequestError && current.status !== undefined && isRetryableStatus(current.status)) {
      return true;
    }
    if (current instanceof NoResponseError) return true;
    if (current instanceof TimeoutError) return true;
    current = current.cause;
  }
  return false;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** @trace LLR-FE-004 */
export async function retryRead<T>(attempt: () => Promise<T>, sleep: (ms: number) => Promise<void> = wait): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await attempt();
    } catch (error) {
      const delay = RETRY_DELAYS_MS[retry];
      if (delay === undefined || !isRetryable(error)) throw error;
      await sleep(delay);
    }
  }
}
