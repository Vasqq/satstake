import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { POLL_INTERVAL_MS } from "../chain/poller";
import { usePledgeLive } from "../chain/usePledgeLive";
import { type Reads, isPledgeNotFound } from "../chain/reads";
import { PageHeading } from "./PageHeading";
import { STATE_LABELS } from "./stateLabels";
import { PledgeNotFoundView } from "./Views";

const READING = "Reading the pledge from the network.";
const RETRYING = "Could not read this pledge. The site keeps trying while this page is open.";

/** @trace LLR-FE-011 LLR-FE-013 LLR-FE-072 */
export function PledgeView({ reads, id, afterStatus }: { reads: Reads; id: bigint; afterStatus?: ReactNode }) {
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

  if (pledge.error && isPledgeNotFound(pledge.error)) return <PledgeNotFoundView />;

  const failed = pledge.error !== null || live.error !== null;
  const status = live.state !== null ? STATE_LABELS[live.state] : READING;

  return (
    <article>
      <PageHeading title={`Pledge #${id.toString()} | SatStake`}>Pledge #{id.toString()}</PageHeading>
      <p role="status">{status}</p>
      {afterStatus}
      {failed && <p role="alert">{RETRYING}</p>}
    </article>
  );
}
