import { PageHeading } from "./PageHeading";

/** The wording of 05 section 2.2 for PledgeNotFound. */
export const PLEDGE_NOT_FOUND_MESSAGE = "This promise does not exist. Check the link.";

function Ways() {
  return (
    <div className="actions">
      <a className="b ghost" href="#/">
        Go to the home page
      </a>
      <a className="b ghost" href="#/mine">
        My promises
      </a>
    </div>
  );
}

/** @trace LLR-FE-013 */
export function NotFoundView() {
  return (
    <div className="notfound">
      <PageHeading title="Page not found | SatStake" className="display">
        Page <span className="hot">not found</span>
      </PageHeading>
      <p>This page does not exist.</p>
      <Ways />
    </div>
  );
}

/** @trace LLR-FE-013 */
export function PledgeNotFoundView() {
  return (
    <div className="notfound">
      <PageHeading title="Promise not found | SatStake" className="display">
        Promise <span className="hot">not found</span>
      </PageHeading>
      <p>{PLEDGE_NOT_FOUND_MESSAGE}</p>
      <Ways />
    </div>
  );
}
