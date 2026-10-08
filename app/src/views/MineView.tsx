import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useConnection } from "wagmi";
import type { Reads } from "../chain/reads";
import type { SelectedNetwork } from "../config/networks";
import { formatAmount, formatLocalTime } from "../format";
import { PageHeading } from "./PageHeading";
import { type Role, roleOf } from "./roles";
import { STATE_NAMES } from "./stateLabels";
import "../styles/forms.css";

export const PAGE_SIZE = 20n;
/** A failed read is retried this often while the page is open. */
export const RETRY_MS = 5_000;

const READING = "Reading your promises from the network.";

/** What the connected account is to a promise, in the words a person would use for themselves. */
const ROLE_TEXT: Readonly<Record<Role, string>> = {
  staker: "You made it",
  referee: "You judge it",
  beneficiary: "You get it if missed",
};

/**
 * The window of the per-account index for a page, counted from the newest end. The contract lists oldest first,
 * so page 0 is the last `PAGE_SIZE` entries and the final page is whatever is left at the start.
 *
 * @trace LLR-FE-050
 */
export function pageWindow(count: bigint, page: number): { offset: bigint; limit: bigint } {
  const end = count - PAGE_SIZE * BigInt(page); // LLR-FE-050
  const offset = end > PAGE_SIZE ? end - PAGE_SIZE : 0n; // LLR-FE-050
  return { offset, limit: end - offset };
}

// The list is read when the view opens and not kept: nothing is cached after the view is left, and a
// failed read is retried.
const listQuery = {
  retry: false,
  gcTime: 0,
  refetchInterval: (query: { state: { status: string } }) => (query.state.status === "error" ? RETRY_MS : false),
} as const;

/** @trace LLR-FE-050 */
function Card({ id, account, reads, network }: { id: bigint; account: string; reads: Reads; network: SelectedNetwork }) {
  const pledge = useQuery({ queryKey: ["mine", "pledge", id.toString()], queryFn: () => reads.pledge(id), retry: false, gcTime: 0 });
  const state = useQuery({ queryKey: ["mine", "state", id.toString()], queryFn: () => reads.state(id), retry: false, gcTime: 0 });
  const failed = pledge.isError || state.isError;
  const role = pledge.data ? roleOf(pledge.data, account) : null;
  return (
    <li>
      <a className="mine-card" href={`#/p/${id.toString()}`}>
        <span className="mine-card-head">
          <span className="mine-card-id">{`Promise #${id.toString()}`}</span>
          {pledge.data && state.data && <span className="mine-card-state">{STATE_NAMES[state.data]}</span>}
        </span>
        {failed && <span className="mine-card-failed">Could not read this promise.</span>}
        {pledge.data && !failed && (
          <>
            <span className="mine-card-promise">{pledge.data.promiseText}</span>
            <span className="mine-card-meta">
              <span className="mine-card-amount">{formatAmount(network, pledge.data.token, pledge.data.amount)}</span>
              <span>{`Deadline ${formatLocalTime(pledge.data.deadline)}`}</span>
              {role !== null && <span className="mine-card-role">{ROLE_TEXT[role]}</span>}
            </span>
          </>
        )}
      </a>
    </li>
  );
}

/** Remounted for each account, so a change of account starts at the first page. @trace LLR-FE-050 */
function List({
  account,
  reads,
  network,
  statusSlot,
}: {
  account: `0x${string}`;
  reads: Reads;
  network: SelectedNetwork;
  statusSlot: HTMLElement | null;
}) {
  const [page, setPage] = useState(0);
  const showing = useRef<HTMLParagraphElement>(null);
  const count = useQuery({ queryKey: ["mine", "count", account], queryFn: () => reads.pledgeCountOf(account), ...listQuery });
  const total = count.data ?? 0n;
  const ids = useQuery({
    queryKey: ["mine", "ids", account, page, total.toString()],
    queryFn: async () => {
      const { offset, limit } = pageWindow(total, page);
      return [...(await reads.pledgeIdsOf(account, offset, limit))].reverse(); // LLR-FE-050
    },
    enabled: total > 0n,
    ...listQuery,
  });

  const pages = Number((total + PAGE_SIZE - 1n) / PAGE_SIZE);
  // Focus moves in an effect, after the page has rendered the new "Showing" line, so it is read as it stands
  // and not as it stood before the click. Nothing is focused when the view opens.
  const paged = useRef(false);
  useEffect(() => {
    if (paged.current) showing.current?.focus(); // LLR-FE-050
  }, [page]);
  const move = (next: number) => {
    paged.current = true;
    setPage(next);
  };

  let message: string | null = null;
  if (count.isError || ids.isError) message = "Could not read your promises. The site keeps trying while this page is open.";
  else if (count.data === undefined || (total > 0n && ids.data === undefined)) message = READING;
  else if (total === 0n) message = "You have not made a promise or been named in one yet.";

  const from = page * Number(PAGE_SIZE) + 1;
  const to = Math.min(Number(total), (page + 1) * Number(PAGE_SIZE));
  return (
    <>
      {count.data !== undefined && count.data > 0n && (
        <p className="mine-count">{`You take part in ${total.toString()} ${total === 1n ? "promise" : "promises"}. Newest first.`}</p>
      )}
      {/* Said in the status element of the view, which stays in the page whatever the connection is doing. */}
      {message && statusSlot && createPortal(<p>{message}</p>, statusSlot)}
      {total === 0n && count.data === 0n && (
        <div className="mine-empty">
          <a className="cta" href="#/create">
            Make a promise
            <span className="arr" aria-hidden="true">
              →
            </span>
          </a>
          <p>If a friend named you, open the link they sent.</p>
        </div>
      )}
      {ids.data && message === null && (
        <ul className="mine-list">
          {ids.data.map((id) => (
            <Card key={id.toString()} id={id} account={account} reads={reads} network={network} />
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="mine-pager">
          <p ref={showing} tabIndex={-1}>{`Showing ${from} to ${to} of ${total.toString()}`}</p>
          <button type="button" disabled={page === 0} onClick={() => move(page - 1)}>
            Newer
          </button>
          <button type="button" disabled={page >= pages - 1} onClick={() => move(page + 1)}>
            Older
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The promises the connected account takes part in, read through the configured chain's client, so the list
 * does not depend on which network the wallet is on.
 *
 * @trace LLR-FE-050
 */
export function MineView({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  const { status, address } = useConnection();
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  const connecting = status === "connecting" || status === "reconnecting";
  const listed = status === "connected" && address !== undefined;
  return (
    <>
      <PageHeading title="My promises | SatStake" className="display">
        My <span className="hot">promises</span>
      </PageHeading>
      <div role="status" aria-label="My promises status" ref={setStatusSlot}>
        {connecting && <p>Waiting for your wallet to connect.</p>}
        {!connecting && !listed && <p>Connect a wallet to list your promises.</p>}
      </div>
      {listed && <List key={address} account={address} reads={reads} network={network} statusSlot={statusSlot} />}
    </>
  );
}
