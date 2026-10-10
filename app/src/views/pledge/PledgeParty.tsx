import type { SelectedNetwork } from "../../config/networks";
import { HashValue } from "../HashValue";
import type { Role } from "../roles";

/**
 * One party's address on a signature line, with its note on the same line and its copy and explorer controls
 * under it. The signature line chooses a "Read as" role when it is clicked, and a copy or a link is not that
 * choice, so a click here goes no further. The mark for the connected account belongs to the line, beside the
 * role's name.
 *
 * @trace LLR-FE-040 LLR-FE-041
 */
export function PledgeParty(props: { party: Role; address: string; network: SelectedNetwork; note: string }) {
  const { party, address, network, note } = props;
  return (
    <span className="party-value" onClick={(event) => event.stopPropagation()}>
      <HashValue
        kind="address"
        value={address}
        explorerUrl={network.explorerUrl}
        copyNoun={`the ${party}'s address`}
        viewNoun={`the ${party}`}
        note={note}
      />
    </span>
  );
}
