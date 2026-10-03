import { useEffect, useState } from "react";
import { ChainClock } from "./clock";
import { createPoller } from "./poller";
import type { PledgeState, Reads } from "./reads";

interface Snapshot {
  state: PledgeState | null;
  stateError: unknown;
  blockError: unknown;
}

/**
 * The live part of a pledge page: `stateOf` and the latest block, read together on every poll but handled
 * separately, so one failing or slow read does not hold back the other. The block re-synchronizes the clock
 * from the moment it arrived. A failed read keeps the last value and reports the error. A poll only applies
 * its answer if no later poll has already been answered, so a slow old response cannot undo a newer one.
 * Nothing is read while `enabled` is false, so a page can wait until the pledge is known to exist. `refresh` reads
 * again at once, for the moment a transaction of the visitor's has been confirmed.
 *
 * @trace LLR-FE-011 LLR-FE-012 LLR-FE-046
 */
export function usePledgeLive(reads: Reads, id: bigint, enabled = true) {
  const [clock] = useState(() => new ChainClock());
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: null, stateError: null, blockError: null });
  // Changing it restarts the poller, which reads at once, so a confirmed transaction need not wait for the next poll.
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let started = 0;
    let stateApplied = 0;
    let blockApplied = 0;

    const poller = createPoller(() => {
      const poll = ++started;
      const state = reads.state(id).then(
        (value) => {
          if (!active || poll < stateApplied) return;
          stateApplied = poll;
          setSnapshot((previous) => ({ ...previous, state: value, stateError: null }));
        },
        (error: unknown) => {
          if (!active || poll < stateApplied) return;
          stateApplied = poll;
          setSnapshot((previous) => ({ ...previous, stateError: error }));
        },
      );
      const block = reads.latestBlockTimestamp().then(
        (timestamp) => {
          const arrived = clock.mark();
          if (!active || poll < blockApplied) return;
          blockApplied = poll;
          clock.sync(timestamp, arrived);
          setSnapshot((previous) => ({ ...previous, blockError: null }));
        },
        (error: unknown) => {
          if (!active || poll < blockApplied) return;
          blockApplied = poll;
          setSnapshot((previous) => ({ ...previous, blockError: error }));
        },
      );
      return Promise.all([state, block]);
    });
    return () => {
      active = false;
      poller.stop();
    };
  }, [reads, id, clock, enabled, round]);

  return {
    state: snapshot.state,
    error: snapshot.stateError ?? snapshot.blockError,
    clock,
    refresh: () => setRound((n) => n + 1),
  };
}
