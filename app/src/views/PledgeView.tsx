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
import { CopyLink } from "../create/CopyLink";
import { AgreementDoc } from "../design/AgreementDoc";
import { Clock } from "../design/Clock";
import { formatAmount, formatLocalTime, shorten } from "../format";
import { useWriteGate } from "../wallet/gate";
import { PageHeading } from "./PageHeading";
import { usePledgeActions } from "./pledge/PledgeActions";
import { PledgeBanner } from "./pledge/PledgeBanner";
import { PledgeParty } from "./pledge/PledgeParty";
import { deadlineWarning } from "./pledge/warning";
import { STAKER_MARK, refereeMark } from "./pledge/signatures";
import { ROLE_STATEMENTS, roleOf } from "./roles";
import { ACTIVE_PAST_DEADLINE_MEANING, STATE_MEANINGS } from "./stateLabels";
import { PledgeNotFoundView } from "./Views";

const READING = "Reading the promise from the network.";
const RETRYING = "Could not read this promise. The site keeps trying while this page is open.";

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

  const data = pledge.data ?? null;
  const chainNow = live.clock.now();
  const remaining = data !== null && chainNow !== null ? data.deadline - chainNow : null;
  const deadlineReached = data !== null && chainNow !== null ? reachedAt(data.deadline, chainNow) : null;
  const role = data === null ? null : roleOf(data, connection.address);
  const wallet = connection.status === "connected" ? "connected" : connection.status === "disconnected" ? "none" : "pending";
  // Read again at the moment of a click: the tick can be a second behind chain time, and a verdict sent just past
  // the deadline would only be refused by the contract.
  const deadlineReachedNow = () => {
    const now = live.clock.now();
    return data === null || now === null ? null : reachedAt(data.deadline, now);
  };

  const actions = usePledgeActions({
    id,
    network,
    client,
    gate,
    pledge: data,
    state: live.state,
    role,
    wallet,
    deadlineReached,
    deadlineReachedNow,
    onConfirmed: live.refresh,
    statusRef: statusLine,
  });

  if (pledge.error && isPledgeNotFound(pledge.error)) return <PledgeNotFoundView />;

  const failed = pledge.error !== null || live.error !== null;

  // Chain time can pass the deadline before the next poll flips the state, and the page must not claim a
  // verdict is still awaited in that gap.
  const pastDeadlineWhileActive = live.state === "Active" && deadlineReached === true;
  const status =
    live.state === null ? READING : pastDeadlineWhileActive ? ACTIVE_PAST_DEADLINE_MEANING : STATE_MEANINGS[live.state];
  // The banner and the clock already say the outcome. The status sentence stays in the page, because it is the
  // announced text and the focus target after a request (LLR-FE-046), but is not shown a third time beside them.
  const bannerShown = data !== null && live.state !== null;
  const warning = live.state === null ? null : deadlineWarning({ state: live.state, remaining, role });

  const amount = data === null ? "" : formatAmount(network, data.token, data.amount);
  const isSats = data !== null && network.tokens.find((t) => t.address.toLowerCase() === data.token.toLowerCase())?.symbol === "cirBTC";
  const clauseActions = {
    ...actions.clauseActions,
    // A sat is new to most visitors, so the unit is explained where the amount is first written.
    0: isSats ? <p className="unit-note">A sat is the smallest unit of Bitcoin.</p> : undefined,
  };

  return (
    <article className="pledge-page">
      {/* The heading comes first: a route change and the skip link move focus to it, and a screen reader reads
          forward from there, so the banner that explains the page must follow it (LLR-FE-072). */}
      {/* The promise is part of the heading, so heading navigation reads what this page is about. */}
      <PageHeading className="pledge-heading" title={`Promise #${id.toString()} | SatStake`}>
        <span className={data === null ? "label pledge-label" : "label pledge-label visually-hidden"}>Promise #{id.toString()}</span>
        {data !== null && (
          <>
            {" "}
            <span className="ptitle">{`“${data.promiseText}”`}</span>
          </>
        )}
      </PageHeading>
      {data !== null && live.state !== null && (
        <PledgeBanner
          pledge={data}
          state={live.state}
          role={role}
          deadlineReached={deadlineReached}
          network={network}
          // The control for a pledge just created arrives as `afterStatus` and keeps one place on the page, since the
          // wallet connects after the first render and moving it into the staker's text then would reset it.
          copyLink={afterStatus === undefined ? <CopyLink id={id} bare /> : null}
        />
      )}
      {afterStatus}
      <div className="pledge-state-row">
        {role !== null && <span className="role-badge">{ROLE_STATEMENTS[role]}</span>}
        {/* The live region and the focus target are different elements, so a screen reader is not told the same text twice. */}
        <div role="status" aria-label="Promise status" className={bannerShown ? "pledge-status visually-hidden" : "pledge-status"}>
          <p tabIndex={-1} ref={statusLine}>
            {status}
          </p>
        </div>
      </div>
      <div role="status" aria-label="Deadline warning">
        {warning !== null && <p className="banner banner-notice pledge-warning">{warning}</p>}
      </div>
      {data !== null && live.state !== null && (
        <section className="pledge-agreement" aria-labelledby="pledge-agreement-title">
          <h2 id="pledge-agreement-title" className="visually-hidden">
            The agreement
          </h2>
          <AgreementDoc
            title={`Promise #${id.toString()}`}
            meta={`${network.name} · source verified on Sourcify`}
            amountLabel={amount}
            deadlineText={formatLocalTime(data.deadline)}
            you={role}
            staker={(note) => <PledgeParty party="staker" address={data.staker} network={network} note={note} />}
            referee={(note) => <PledgeParty party="referee" address={data.referee} network={network} note={note} />}
            beneficiary={(note) => <PledgeParty party="beneficiary" address={data.beneficiary} network={network} note={note} />}
            signatures={{ staker: STAKER_MARK, referee: refereeMark(live.state) }}
            clauseActions={clauseActions}
            footer={actions.progress}
          />
        </section>
      )}
      {(data === null || live.state === null) && actions.progress}
      {data !== null && live.state !== null && (
        <section className="pledge-clock" aria-labelledby="pledge-clock-title">
          <h2 id="pledge-clock-title" className="visually-hidden">
            The clock
          </h2>
          <p className="pledge-deadline">
            <span className="label">Deadline</span>
            <time dateTime={new Date(Number(data.deadline) * 1000).toISOString()}>{formatLocalTime(data.deadline)}</time>
          </p>
          <Clock
            mode="live"
            createdAt={data.createdAt}
            deadline={data.deadline}
            now={chainNow}
            state={live.state}
            checking={pastDeadlineWhileActive}
            amountLabel={amount}
            staker={shorten(data.staker)}
            referee={shorten(data.referee)}
            beneficiary={shorten(data.beneficiary)}
          />
        </section>
      )}
      {failed && (
        <p role="alert" className="banner banner-error">
          {RETRYING}
        </p>
      )}
    </article>
  );
}
