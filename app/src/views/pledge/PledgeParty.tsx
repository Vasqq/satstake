import type { SelectedNetwork } from "../../config/networks";
import { HashValue } from "../HashValue";
import type { Role } from "../roles";

/**
 * One party's address on a signature line, with its copy and explorer controls, and a mark when it is the
 * connected account. The signature line chooses a "Read as" role when it is clicked, and a copy or a link
 * is not that choice, so a click here goes no further.
 *
 * @trace LLR-FE-040 LLR-FE-041
 */
export function PledgeParty(props: { party: Role; address: string; network: SelectedNetwork; you: boolean }) {
  const { party, address, network, you } = props;
  return (
    <span className="party-value" onClick={(event) => event.stopPropagation()}>
      <HashValue
        kind="address"
        value={address}
        explorerUrl={network.explorerUrl}
        copyNoun={`the ${party}'s address`}
        viewNoun={`the ${party}`}
      />
      {you && <span className="you-mark">(you)</span>}
    </span>
  );
}
