import { HttpRequestError, type Transport, fallback, http } from "viem";
import { NoResponseError, isRetryableStatus, retryRead } from "./retry";

type FetchFn = NonNullable<NonNullable<Parameters<typeof http>[1]>["fetchFn"]>;

/**
 * Wraps a transport so a failed request is retried on the schedule of LLR-FE-004. Retrying here, above the
 * fallback, means a round that failed on every URL is tried again as a whole.
 *
 * @trace LLR-FE-004
 */
export function retryingTransport(inner: Transport): Transport {
  return (params) => {
    const transport = inner(params);
    return {
      ...transport,
      request: ((args, options) => retryRead(() => transport.request(args, options))) as typeof transport.request,
    };
  };
}

// A rejected fetch is the only case where no HTTP response arrived; the marker lets the retry policy tell it
// from a response that was bad.
function markNoResponse(fetchFn: FetchFn): FetchFn {
  return async (input, init) => {
    try {
      return await fetchFn(input, init);
    } catch (cause) {
      throw new NoResponseError("the request received no HTTP response", { cause });
    }
  };
}

// viem returns the body of a non-OK answer when it holds a JSON-RPC error, which drops the HTTP status. The
// status is raised here, before the body is read, so a 429 or 5xx is retried whatever its body says.
function rejectRetryableStatus(url: string) {
  return (response: Response) => {
    if (isRetryableStatus(response.status)) {
      throw new HttpRequestError({ url, status: response.status, headers: response.headers });
    }
  };
}

/**
 * A viem fallback transport over the URLs in the order given, with viem's own retries switched off so the
 * only retry policy is the one in retry.ts. `fetchFn` exists so tests can script the network.
 *
 * @trace LLR-FE-003
 */
export function createReadTransport(urls: readonly string[], options: { fetchFn?: FetchFn } = {}): Transport {
  const fetchFn = markNoResponse(options.fetchFn ?? ((input, init) => fetch(input, init)));
  const endpoints = urls.map((url) => http(url, { retryCount: 0, fetchFn, onFetchResponse: rejectRetryableStatus(url) }));
  return retryingTransport(fallback(endpoints, { retryCount: 0 }));
}
