import type { ReactNode } from "react";
import type { Reads } from "../chain/reads";
import type { SelectedNetwork } from "../config/networks";
import { AgreementDoc } from "../design/AgreementDoc";
import { Clock } from "../design/Clock";
import { SectionHead, Strikes, Trust } from "../design/Sections";
import { LandingCreate } from "../create/LandingCreate";
import { formatAmount } from "../format";
import { HashValue } from "./HashValue";
import { PromiseRotator } from "./home/PromiseRotator";
import { COUNT_RETRY_MS, useLockedNow, usePledgeCount } from "./home/live";

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
      <span className="label">{`Locked now in ${token.symbol}`}</span>
    </div>
  );
}

// Values for the agreement and clock below. They illustrate the rules and belong to no promise, so each widget
// that shows them says it is an example.
const EXAMPLE = {
  staker: "0xd172…809f",
  referee: "0x8a3e…11c0",
  beneficiary: "0x4f2b…a9d1",
};

/**
 * What SatStake does and how, for someone without a wallet, with the proof that it is live: the network, the
 * whole contract address to compare with a published one, its verified source, and figures read from it. The
 * hero's pad is where the create flow mounts; here it shows the demonstration signature and cannot seal.
 *
 * @trace LLR-FE-070
 */
export function HomeView({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  return (
    <div className="home">
      <LandingCreate reads={reads} network={network} />

      <section className="s" id="agreement" aria-labelledby="home-agreement">
        <SectionHead label="The agreement" title={<span id="home-agreement">Seven lines. <em>No fine print.</em></span>}>
          Every promise is the same short contract. Pick a role to see the lines that apply to it.
        </SectionHead>
        <AgreementDoc
          example
          title="An example promise"
          meta={`${network.name} · the same for every promise`}
          amountLabel="1,000 sats"
          deadlineText="7 days after it is made"
          staker={EXAMPLE.staker}
          referee={EXAMPLE.referee}
          beneficiary={EXAMPLE.beneficiary}
        />
      </section>

      <section className="s" id="clock" aria-labelledby="home-clock">
        <SectionHead label="The clock" title={<span id="home-clock">Drag through a week. <em>Watch the money move.</em></span>}>
          Pick what the referee does, then scrub the timeline. There are only three endings, and the contract plays them the same way every
          time.
        </SectionHead>
        <Clock mode="demo" />
      </section>

      <section className="s" aria-labelledby="home-strikes">
        <SectionHead label="Once it’s sealed" title={<span id="home-strikes">Nobody can <em>take it back.</em></span>}>
          Not you, not your referee, not the people who built it. The rules live in code that has no owner.
        </SectionHead>
        <Strikes />
      </section>

      <section className="s" aria-labelledby="home-trust">
        <Trust />
      </section>

      <section className="s" aria-labelledby="home-live">
        <SectionHead label={`Live on ${network.name}`} title={<span id="home-live">Check it <em>yourself.</em></span>}>
          Everything in this section is read from the contract, with no wallet and nothing invented. SatStake uses cirBTC as the stake, USDC
          as gas so a promise costs cents to make, and Arc’s deterministic, sub-second finality so a payout is final the moment it lands.
        </SectionHead>
        <PromiseRotator reads={reads} network={network} />
        <div className="proof">
          <div>
            <b>
              <PledgeCount reads={reads} network={network} />
            </b>
            <span className="label">Promises made</span>
          </div>
          {network.tokens.map((token) => (
            <LockedNow key={token.address} reads={reads} network={network} token={token} />
          ))}
          <div>
            <b>{network.name}</b>
            <span className="label">{`Chain ${network.chainId.toString()}`}</span>
          </div>
        </div>
        <div className="proof-contract">
          <span className="label">Contract</span>
          <HashValue
            kind="address"
            value={network.contract}
            explorerUrl={network.explorerUrl}
            copyNoun="the contract address"
            viewNoun="the contract"
            full
          />
          <p className="proof-links">
            <a href={`https://repo.sourcify.dev/${network.chainId.toString()}/${network.contract}`}>Verified on Sourcify</a>
            <a href={`#/p/${network.examplePledgeId.toString()}`}>A live promise</a>
            <a href={REPOSITORY}>GitHub repository</a>
          </p>
        </div>
      </section>

      <section className="end" aria-labelledby="home-close-title">
        <h2 id="home-close-title">
          Your word, <em>in writing.</em>
        </h2>
        <p>No signup, no email, no account. A wallet on Arc and a little USDC for fees. Reading a promise needs nothing at all.</p>
        <a className="b sat" href="#/create">
          Make a promise
        </a>
      </section>
    </div>
  );
}
