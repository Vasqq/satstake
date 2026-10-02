export type Route =
  | { name: "home" }
  | { name: "create" }
  | { name: "mine" }
  | { name: "about" }
  | { name: "pledge"; id: bigint }
  | { name: "notFound" };

const UINT256_MAX = 2n ** 256n - 1n;

/**
 * Anything outside the five documented routes is not found, including near misses such as a trailing
 * slash or a pledge id with a leading zero, so each page has exactly one address.
 *
 * @trace LLR-FE-013
 */
export function parseRoute(hash: string): Route {
  switch (hash) {
    case "":
    case "#":
    case "#/":
      return { name: "home" };
    case "#/create":
      return { name: "create" };
    case "#/mine":
      return { name: "mine" };
    case "#/about":
      return { name: "about" };
  }
  const pledge = /^#\/p\/(0|[1-9]\d*)$/.exec(hash);
  if (pledge?.[1] !== undefined) {
    const id = BigInt(pledge[1]);
    if (id <= UINT256_MAX) return { name: "pledge", id };
  }
  return { name: "notFound" };
}
