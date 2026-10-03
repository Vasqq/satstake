import { useEffect, useState } from "react";

/**
 * Renders the calling component again once a second, so a countdown computed from `ChainClock.now()` moves
 * with chain time between polls. The tick reads nothing from the network.
 *
 * @trace LLR-FE-012
 */
export function useTick(intervalMs = 1_000): void {
  const [, setCount] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setCount((n) => n + 1), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
