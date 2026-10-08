import type { ReactNode } from "react";
import type { Reads } from "../chain/reads";
import type { SelectedNetwork } from "../config/networks";
import { formatAmount } from "../format";
import "../styles/home.css";
import { HashValue } from "./HashValue";
import { PromiseRotator } from "./home/PromiseRotator";
import { COUNT_RETRY_MS, useLockedNow, usePledgeCount } from "./home/live";
import { PageHeading } from "./PageHeading";

export { COUNT_RETRY_MS };

const REPOSITORY = "https://github.com/Vasqq/satstake";

type Figure = { data: bigint | undefined; isError: boolean };

/** The same three words for every live figure, so a failed read never leaves a blank. */
function reading(query: Figure, show: (value: bigint) => ReactNode): ReactNode {
  if (query.data !== undefined) return show(query.data);
  return query.isError ? "Not available right now" : "Reading";
}

/** @trace LLR-FE-070 */
function PledgeCount({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  return <>{reading(usePledgeCount(reads, network), (n) => n.toString())}</>;
}

/** @trace LLR-FE-070 */
function LockedNow({ reads, network, token }: { reads: Reads; network: SelectedNetwork; token: SelectedNetwork["tokens"][number] }) {
  const locked = useLockedNow(reads, network, token.address);
  return (
    <div>
      <b>{reading(locked, (amount) => formatAmount(network, token.address, amount))}</b>
      <span>{`Locked now in ${token.symbol}`}</span>
    </div>
  );
}

function CreateLink({ children }: { children: string }) {
  return (
    <a className="cta" href="#/create">
      {children} <span className="arr" aria-hidden="true">→</span>
    </a>
  );
}

const STEPS = [
  {
    title: "01. Promise and lock.",
    body: (
      <>
        Alex promises: <em>I&apos;ll run three times this week.</em> Alex locks $20 in USDC, picks Sunday 9 pm as the deadline, and names a
        brother, Jo, to receive it if the promise is missed.
      </>
    ),
  },
  {
    title: "02. Share and judge.",
    body: (
      <>
        Alex sends the promise&apos;s link to Sam, the referee. SatStake sends no messages; the link is how Sam finds it. Before Sunday 9
        pm, Sam marks it kept or broken. Only Sam can mark it, and once marked it is final.
      </>
    ),
  },
  { title: "03. The money moves.", body: <>Anyone can then send the stake where the rules say:</> },
];

const ENDINGS = [
  { label: "Kept", outcome: "Back to Alex", kept: true },
  { label: "Broken", outcome: "To Jo", kept: false },
  { label: "No answer by the deadline", outcome: "To Jo", kept: false },
];

const CLAIMS = [
  {
    title: "Rules, not people, move the money.",
    body: "After a promise is made, the stake can only go back to you or to the person you named, by the rules above.",
  },
  { title: "No owner, no fees, no admin.", body: "Not even the builder can touch a promise." },
  { title: "Anyone can check.", body: "Every promise is public and readable without a wallet, and the source code is verified." },
];

const QUESTIONS = [
  {
    q: "What do I need?",
    a: "A browser wallet with the Arc network added, and some USDC on Arc: fees are paid in USDC and cost cents.",
  },
  {
    q: "What if my referee does not answer?",
    a: "After the deadline the referee can no longer answer, and the stake goes to the person you named. Pick someone who will reply.",
  },
  { q: "Can I cancel or change a promise?", a: "No. Only the referee's verdict or the deadline decides it." },
  { q: "Does SatStake charge anything?", a: "No. Only Arc's network fee, a few cents in USDC." },
  {
    q: "Who can see my promise?",
    a: "Anyone. Promises are public on the blockchain, with or without the link. Do not write anything private in one.",
  },
];

/**
 * What SatStake does and how, for someone without a wallet, with the proof that it is live: the network, the
 * whole contract address to compare with a published one, its verified source, and figures read from it.
 *
 * @trace LLR-FE-070
 */
export function HomeView({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  const explorerAddress = `${network.explorerUrl}/address/${network.contract}`;
  return (
    <div className="home">
      <section className="home-hero">
        <a className="home-eyebrow" href={explorerAddress} rel="noreferrer">
          {`Live on ${network.name}`}
        </a>
        <PageHeading title="SatStake" className="home-title">
          Put money behind your <span className="hot">promise.</span>
        </PageHeading>
        <p className="lead">
          Lock USDC or Bitcoin-backed cirBTC against something you said you would do. A friend you choose confirms whether you kept it.{" "}
          <strong>Kept, and your money comes back.</strong> Missed, or no answer by the deadline, and it goes to the person you named.
        </p>
        <p className="actions">
          <CreateLink>Make a promise</CreateLink>
          <a className="textlink" href={`#/p/${network.examplePledgeId.toString()}`}>
            See a live promise
          </a>
        </p>
        <p className="home-need">You need a browser wallet on Arc with a little USDC for network fees.</p>
      </section>

      <PromiseRotator reads={reads} network={network} />

      <section className="home-sec" aria-labelledby="home-how">
        <h2 className="display" id="home-how">
          How it works
        </h2>
        <ol className="home-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <span className="rule" aria-hidden="true" />
              <h3 className="label">{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <dl className="rows home-endings">
          {ENDINGS.map((ending) => (
            <div key={ending.label} className={ending.kept ? "is-kept" : undefined}>
              <dt className="label">{ending.label}</dt>
              <dd>{ending.outcome}</dd>
            </div>
          ))}
        </dl>
        <p className="home-silence">Silence counts as broken, so make sure your referee answers in time.</p>
        <p className="home-uses">People use it for habits, friendly bets, work deadlines, or a donation to a cause if they miss.</p>
        <p className="home-before">
          <strong>Before you start:</strong> a promise cannot be cancelled or changed once made, and every promise is public.
        </p>
      </section>

      <section className="home-sec" aria-labelledby="home-trust">
        <h2 className="display" id="home-trust">
          Why you can trust it
        </h2>
        <ul className="home-claims">
          {CLAIMS.map((claim) => (
            <li key={claim.title}>
              <strong>{claim.title}</strong>
              {claim.body}
            </li>
          ))}
        </ul>
        <p className="home-limits">
          <strong>What it cannot do, said plainly:</strong> your referee is trusted by you and could judge you unfairly. Circle, which
          issues USDC and cirBTC, can pause a token or block an address, which can hold a payout until it is lifted. It is tested, not
          audited.
        </p>
        <div className="home-proof">
          <div>
            <b>
              <PledgeCount reads={reads} network={network} />
            </b>
            <span>Promises made</span>
          </div>
          {network.tokens.map((token) => (
            <LockedNow key={token.address} reads={reads} network={network} token={token} />
          ))}
        </div>
      </section>

      <section className="home-sec" aria-labelledby="home-reviewers">
        <h2 className="display" id="home-reviewers">
          For reviewers
        </h2>
        <div className="home-rev">
          <div>
            <span className="label">Why Arc</span>
            <p className="home-why">
              SatStake uses cirBTC as the stake, USDC as gas so a $5 promise costs cents to make, and Arc&apos;s deterministic finality so a
              forfeit is final the moment it lands.
            </p>
          </div>
          <div>
            <span className="label">Contract</span>
            <div className="home-contract">
              <HashValue
                kind="address"
                value={network.contract}
                explorerUrl={network.explorerUrl}
                copyNoun="the contract address"
                viewNoun="the contract"
                full
              />
            </div>
            <p className="home-links">
              <a className="pill" href={`https://repo.sourcify.dev/${network.chainId.toString()}/${network.contract}`}>
                Verified on Sourcify
              </a>
            </p>
            <p className="home-network">{`${network.name}, chain ${network.chainId.toString()}`}</p>
            <p className="home-more">
              <a className="textlink" href={REPOSITORY}>
                GitHub repository
              </a>
              , built test first, every requirement traced to its test
            </p>
          </div>
        </div>
      </section>

      <section className="home-sec" aria-labelledby="home-faq">
        <h2 className="display" id="home-faq">
          Questions
        </h2>
        <dl className="home-faq">
          {QUESTIONS.map((item) => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="home-close" aria-labelledby="home-close-title">
        <h2 className="display" id="home-close-title">
          Ready to put something on <span className="hot">it?</span>
        </h2>
        <CreateLink>Make a promise</CreateLink>
      </section>
    </div>
  );
}
