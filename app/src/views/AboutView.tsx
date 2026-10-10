import { PageHeading } from "./PageHeading";

/**
 * What a visitor is trusting, said before they commit a stake. The sentences are the trust model and limits of
 * NS section 7 and claim no more than the contract does.
 *
 * @trace LLR-FE-071
 */
export function AboutView() {
  return (
    <>
      <PageHeading title="About SatStake" className="display">
        About <span className="hot">SatStake</span>
      </PageHeading>
      <p className="lead about-lead">
        SatStake is a smart contract on Arc and this website, which reads and uses it. You lock a stake against a promise, and a referee
        you choose decides whether you kept it.
      </p>

      <section className="about-section" aria-labelledby="about-trust">
        <h2 id="about-trust">What you are trusting</h2>
        <p>
          <strong>Your referee.</strong> The referee alone decides. A dishonest referee can mark a kept promise broken. If your referee does
          not mark the promise kept before the deadline, the stake goes to the beneficiary, even if you kept it. SatStake only stops you
          from being your own referee or beneficiary, and stops the referee from also being the beneficiary.
        </p>
        <p>
          <strong>The token issuer.</strong> Circle can pause cirBTC or USDC, or block an address. While a token is paused, promises in it
          cannot be created or settled. If the person receiving a stake is blocked, that stake stays locked until the block is lifted.
          Other promises are not affected.
        </p>
      </section>

      <section className="about-section" aria-labelledby="about-limits">
        <h2 id="about-limits">Limits to know</h2>
        <p>Tokens sent straight to the contract, outside a promise, cannot be recovered. There is no function to sweep them.</p>
        <p>
          If the beneficiary address belongs to no one, the stake of a broken or expired promise is lost for good. Check the address
          before you create a promise.
        </p>
        <p>SatStake is tested, not formally verified, and has not been audited.</p>
      </section>

      <section className="about-section" aria-labelledby="about-cannot">
        <h2 id="about-cannot">What SatStake cannot do</h2>
        <p>
          {
            "SatStake itself has no owner, admin, fee, pause, or upgrade function. After a promise is created, no one can cancel it, change its amount, move its deadline, or change who receives the stake. The token issuer’s powers above still apply."
          }
        </p>
      </section>
    </>
  );
}
