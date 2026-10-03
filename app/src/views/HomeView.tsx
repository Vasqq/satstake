import { useQuery } from "@tanstack/react-query";
import type { Reads } from "../chain/reads";
import type { SelectedNetwork } from "../config/networks";
import { HashValue } from "./HashValue";
import { PageHeading } from "./PageHeading";

/** The count is a courtesy on a page that must still work without it, so a failure is retried slowly. */
export const COUNT_RETRY_MS = 30_000;

/** @trace LLR-FE-070 */
function PledgeCount({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  const count = useQuery({
    queryKey: ["home", "pledgeCount", network.chainId, network.contract],
    queryFn: () => reads.pledgeCount(),
    retry: false,
    // Once the count is known the page stays as it was read: it is a proof of life, not a live feed.
    refetchInterval: (query) => (query.state.status === "error" ? COUNT_RETRY_MS : false), // LLR-FE-070
  });
  if (count.data !== undefined) return <>{count.data.toString()}</>;
  return <>{count.isError ? "Not available right now" : "Reading"}</>;
}

/**
 * The one sentence of NS section 1 split across the heading and the lead, the three steps, and the proof that
 * the contract is live: its network, its full address to compare with a published one, its verified source,
 * and how many pledges it holds.
 *
 * @trace LLR-FE-070
 */
export function HomeView({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  return (
    <>
      <PageHeading title="SatStake">Lock Bitcoin against a promise.</PageHeading>
      <p className="lead">Keep it and you get your sats back. Miss it and they go to someone else.</p>
      <p className="actions">
        <a className="button-primary" href="#/create">
          Create a pledge
        </a>
        <a href={`#/p/${network.examplePledgeId.toString()}`}>See an example pledge</a>
      </p>

      <section>
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <strong>Write a promise and lock a stake.</strong>
            <span>Choose cirBTC (Circle&apos;s Bitcoin-backed token on Arc) or USDC, name a referee you trust, and pick a deadline.</span>
          </li>
          <li>
            <strong>Your referee decides.</strong>
            <span>Before the deadline, they mark the promise kept or broken. No one else can.</span>
          </li>
          <li>
            <strong>Anyone sends the stake on.</strong>
            <span>
              Once the referee rules or the deadline passes, anyone can send it: back to you if kept, to the beneficiary you named if broken
              or not confirmed in time.
            </span>
          </li>
        </ol>
      </section>

      <section>
        <h2>{`Live on ${network.name}`}</h2>
        <dl className="facts">
          <dt>Network</dt>
          <dd>{`${network.name}, chain ${network.chainId.toString()}`}</dd>
          <dt>Contract</dt>
          <dd>
            <HashValue
              kind="address"
              value={network.contract}
              explorerUrl={network.explorerUrl}
              copyNoun="the contract address"
              viewNoun="the contract"
              full
            />
          </dd>
          <dt>Source code</dt>
          <dd>
            <a href={`https://repo.sourcify.dev/${network.chainId.toString()}/${network.contract}`}>Verified on Sourcify</a>
          </dd>
          <dt>Pledges created</dt>
          <dd>
            <PledgeCount reads={reads} network={network} />
          </dd>
        </dl>
        <p>Arc settles each transaction with deterministic, sub-second finality. Network fees are paid in USDC. SatStake charges none.</p>
      </section>
    </>
  );
}
