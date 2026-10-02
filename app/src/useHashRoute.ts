import { useRef, useSyncExternalStore } from "react";
import { type Route, parseRoute } from "./routes";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** @trace LLR-FE-013 */
export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

/**
 * True once the address has differed from the one the page loaded at. It is read from the same event as the
 * route, so the first view of a new route already knows it is not the first load. An event that restates
 * the loading address is not a navigation, which matters where setting the hash fires a late event.
 *
 * @trace LLR-FE-072
 */
export function useNavigated(): boolean {
  const loadedAt = useRef(window.location.hash);
  const changed = useRef(false);
  return useSyncExternalStore(subscribe, () => {
    if (window.location.hash !== loadedAt.current) changed.current = true;
    return changed.current;
  });
}
