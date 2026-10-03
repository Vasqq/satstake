import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useRef } from "react";
import type { PublicClient } from "viem";
import { useConnection } from "wagmi";
import { POLL_INTERVAL_MS } from "../chain/poller";
import { type Reads, isPledgeNotFound } from "../chain/reads";
import type { Health } from "../chain/useHealth";
import { usePledgeLive } from "../chain/usePledgeLive";
import { useTick } from "../chain/useTick";
import type { SelectedNetwork } from "../config/networks";
import { useWriteGate } from "../wallet/gate";
import { PageHeading } from "./PageHeading";
import { PledgeActions } from "./pledge/PledgeActions";
import { PledgeFacts } from "./pledge/PledgeFacts";
import { deadlineWarning } from "./pledge/warning";
import { ROLE_NAMES, roleOf } from "./roles";
import { ACTIVE_PAST_DEADLINE_MEANING, STATE_MEANINGS, STATE_NAMES } from "./stateLabels";
import { PledgeNotFoundView } from "./Views";

const READING = "Reading the pledge from the network.";
const RETRYING = "Could not read this pledge. The site keeps trying while this page is open.";

/** The deadline is reached at the second it names: the contract refuses a verdict from that block on. */
const reachedAt = (deadline: bigint, chainNow: bigint) => deadline - chainNow <= 0n;

export interface PledgeViewProps {
  reads: Reads;
  client: PublicClient;
  network: SelectedNetwork;
  /** Shell's own result, so the page and the shell never disagree about whether sending is allowed. */
  health: Health;
  id: bigint;
  afterStatus?: ReactNode;
}

/** @trace LLR-FE-011 LLR-FE-012 LLR-FE-013 LLR-FE-040 LLR-FE-041 LLR-FE-043 LLR-FE-072 */
export function PledgeView({ reads, client, network, health, id, afterStatus }: PledgeViewProps) {
  const pledge = useQuery({
    queryKey: ["pledge", id.toString()],
    queryFn: () => reads.pledge(id),
    staleTime: Infinity,
    retry: false,
    // A failed first read is tried again on the poll interval, so a pledge page opened during an outage
    // fills in when the network returns. A pledge the contract says does not exist stays that way.
    refetchInterval: (query) =>
      query.state.status === "error" && !isPledgeNotFound(query.state.error) ? POLL_INTERVAL_MS : false,
  });
  // The live reads start once the pledge exists, and run from this component so that one status element
  // can move from the reading message to the state without being replaced.
  const live = usePledgeLive(reads, id, pledge.isSuccess);
  useTick(); // LLR-FE-012
  const connection = useConnection();
  const gate = useWriteGate(health.network, network);
  const statusLine = useRef<HTMLParagraphElement>(null);

  if (pledge.error && isPledgeNotFound(pledge.error)) return <PledgeNotFoundView />;

  const data = pledge.data ?? null;
  const failed = pledge.error !== null || live.error !== null;
  const chainNow = live.clock.now();
  const remaining = data !== null && chainNow !== null ? data.deadline - chainNow : null;
  const deadlineReached = data !== null && chainNow !== null ? reachedAt(data.deadline, chainNow) : null;
  const role = data === null ? null : roleOf(data, connection.address);
  const wallet = connection.status === "connected" ? "connected" : connection.status === "disconnected" ? "none" : "pending";

  // Chain time can pass the deadline before the next poll flips the state, and the page must not claim a
  // verdict is still awaited in that gap.
  const pastDeadlineWhileActive = live.state === "Active" && deadlineReached === true;
  const status =
    live.state === null ? READING : pastDeadlineWhileActive ? ACTIVE_PAST_DEADLINE_MEANING : STATE_MEANINGS[live.state];
  // The badge would say Active beside a sentence saying the deadline has passed, so it waits for the new state.
  const showStateBadge = live.state !== null && !pastDeadlineWhileActive;
  // Read again at the moment of a click: the tick can be a second behind chain time, and a verdict sent just past
  // the deadline would only be refused by the contract.
  const deadlineReachedNow = () => {
    const now = live.clock.now();
    return data === null || now === null ? null : reachedAt(data.deadline, now);
  };
  const warning = live.state === null ? null : deadlineWarning({ state: live.state, remaining, role });

  return (
    <article className="pledge-page">
      <PageHeading title={`Pledge #${id.toString()} | SatStake`}>Pledge #{id.toString()}</PageHeading>
      {(role !== null || showStateBadge) && (
        <p className="pledge-badges">
          {live.state !== null && showStateBadge && (
            <span className="state-badge" data-state={live.state}>
              {STATE_NAMES[live.state]}
            </span>
          )}
          {role !== null && <span className="role-badge">You are the {ROLE_NAMES[role].toLowerCase()}</span>}
        </p>
      )}
      {data !== null && <p className="pledge-promise">{data.promiseText}</p>}
      {/* The live region and the focus target are different elements, so a screen reader is not told the same text twice. */}
      <div role="status" aria-label="Pledge status">
        <p tabIndex={-1} ref={statusLine}>
          {status}
        </p>
      </div>
      {afterStatus}
      {data !== null && <PledgeFacts pledge={data} state={live.state} network={network} role={role} remaining={remaining} />}
      <div role="status" aria-label="Deadline warning">
        {warning !== null && <p className="pledge-warning">{warning}</p>}
      </div>
      <PledgeActions
        id={id}
        network={network}
        client={client}
        gate={gate}
        pledge={data}
        state={live.state}
        role={role}
        wallet={wallet}
        deadlineReached={deadlineReached}
        deadlineReachedNow={deadlineReachedNow}
        onConfirmed={live.refresh}
        statusRef={statusLine}
      />
      {failed && <p role="alert">{RETRYING}</p>}
    </article>
  );
}
