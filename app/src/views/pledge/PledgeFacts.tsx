import type { Pledge, PledgeState } from "../../chain/reads";
import type { SelectedNetwork } from "../../config/networks";
import { formatAmount, formatLocalTime } from "../../format";
import { HashValue } from "../HashValue";
import { type Role, ROLE_NAMES } from "../roles";
import { DEADLINE_PASSED, formatRemaining } from "./countdown";

const PARTIES = ["staker", "referee", "beneficiary"] as const;

/**
 * The pledge's facts as a list of labels and values. The countdown row is shown only while a deadline still
 * decides something: for a verdict or a settled pledge it would count towards nothing.
 *
 * @trace LLR-FE-040 LLR-FE-041 LLR-FE-012
 */
export function PledgeFacts(props: {
  pledge: Pledge;
  state: PledgeState | null;
  network: SelectedNetwork;
  role: Role | null;
  remaining: bigint | null;
}) {
  const { pledge, state, network, role, remaining } = props;
  const showCountdown = state === "Active" || state === "Expired";
  return (
    <dl className="pledge-facts">
      <dt>Stake</dt>
      <dd>{formatAmount(network, pledge.token, pledge.amount)}</dd>
      <dt>Deadline</dt>
      <dd>{formatLocalTime(pledge.deadline)}</dd>
      {showCountdown && (
        <>
          <dt>Time left</dt>
          <dd>{state === "Expired" ? DEADLINE_PASSED : formatRemaining(remaining)}</dd>
        </>
      )}
      {PARTIES.map((party) => (
        <PartyRow key={party} party={party} address={pledge[party]} explorerUrl={network.explorerUrl} mine={role === party} />
      ))}
    </dl>
  );
}

function PartyRow(props: { party: (typeof PARTIES)[number]; address: string; explorerUrl: string; mine: boolean }) {
  const { party, address, explorerUrl, mine } = props;
  return (
    <>
      <dt>
        {ROLE_NAMES[party]}
        {mine && (
          <>
            {" "}
            <span className="you-mark">(you)</span>
          </>
        )}
      </dt>
      <dd>
        <HashValue
          kind="address"
          value={address}
          explorerUrl={explorerUrl}
          copyNoun={`the ${party}'s address`}
          viewNoun={`the ${party}`}
        />
      </dd>
    </>
  );
}
