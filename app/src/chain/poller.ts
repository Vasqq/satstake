/** @trace LLR-FE-011 */
export const POLL_INTERVAL_MS = 4_000;

/**
 * Calls `poll` at once and then every 4 seconds while the page is visible. Hiding the page stops the
 * timer; showing it reads again at once, since the state may have changed while nobody was looking.
 *
 * @trace LLR-FE-011
 */
export function createPoller(poll: () => unknown): { stop: () => void } {
  let timer: ReturnType<typeof setInterval> | undefined;

  const run = () => {
    // The poll function owns its error reporting; a rejection here must not stop the schedule.
    Promise.resolve(poll()).catch(() => {});
  };
  const clear = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const start = () => {
    clear();
    if (document.visibilityState === "hidden") return;
    run();
    timer = setInterval(run, POLL_INTERVAL_MS);
  };

  document.addEventListener("visibilitychange", start);
  start();

  return {
    stop: () => {
      document.removeEventListener("visibilitychange", start);
      clear();
    },
  };
}
