import { PageHeading } from "./PageHeading";

/** The wording of 05 section 2.2 for PledgeNotFound. */
export const PLEDGE_NOT_FOUND_MESSAGE = "This promise does not exist. Check the link.";

/** @trace LLR-FE-013 */
export function NotFoundView() {
  return (
    <>
      <PageHeading title="Page not found | SatStake">Page not found</PageHeading>
      <p>This page does not exist.</p>
      <a href="#/">Go to the home page</a>
    </>
  );
}

/** @trace LLR-FE-013 */
export function PledgeNotFoundView() {
  return (
    <>
      <PageHeading title="Pledge not found | SatStake">Pledge not found</PageHeading>
      <p>{PLEDGE_NOT_FOUND_MESSAGE}</p>
      <a href="#/">Go to the home page</a>
    </>
  );
}
