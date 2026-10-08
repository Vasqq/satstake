import type { Pledge, PledgeState } from "../../chain/reads";
import type { SelectedNetwork } from "../../config/networks";
import { formatAmount, formatLocalTime } from "../../format";
import { HashValue } from "../HashValue";
import { ROLE_LABELS, type Role } from "../roles";
import { STEPS, timelineOf } from "./timeline";
import { DEADLINE_PASSED, NOT_SYNCED, formatClock, formatRemaining } from "./countdown";

const PARTIES = ["staker", "referee", "beneficiary"] as const;

/** The stake in large type. A sat is explained under a cirBTC amount, since the unit is new to most visitors. */
export function PledgeStake({ pledge, network }: { pledge: Pledge; network: SelectedNetwork }) {
  const symbol = network.tokens.find((t) => t.address.toLowerCase() === pledge.token.toLowerCase())?.symbol;
  return (
    <p className="stake">
      <span className="visually-hidden">Stake: </span>
      <span className="stake-amount mono">{formatAmount(network, pledge.token, pledge.amount)}</span>
      {symbol === "cirBTC" && <small>a sat is the smallest unit of Bitcoin</small>}
    </p>
  );
}

/**
 * The step list, the countdown, the deadline and the three parties. The countdown is shown only while a
 * deadline still decides something: for a verdict or a settled pledge it would count towards nothing. The
 * digits are hidden from assistive technology and the words beside them say the same time, so a screen reader
 * is not given four changing numbers, and neither sits in a live region.
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
  const timeline = state === null ? null : timelineOf(state);
  // An Expired pledge reads as passed whatever the clock says; an Active one reads as passed when chain time is.
  const ended = state === "Expired" || (remaining !== null && remaining <= 0n);
  const face = formatClock(ended ? 0n : (remaining ?? 0n));
  return (
    <>
      {timeline !== null && (
        <ol className="timeline">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className={index < timeline.done ? "done" : index === timeline.current ? "now" : undefined}
              aria-current={index === timeline.current ? "step" : undefined}
            >
              <span className="rule" aria-hidden="true" />
              <span className="label">{step}</span>
            </li>
          ))}
        </ol>
      )}
      {showCountdown && (
        <div className="clock-block">
          {remaining !== null || state === "Expired" ? (
            <>
              <p className={ended ? "clock ended" : "clock"} aria-hidden="true">
                <span>{face.d}d</span>
                <span>{face.h}h</span>
                <span>{face.m}m</span>
                <span>{face.s}s</span>
              </p>
              <p className="clock-words visually-hidden">
                {ended ? DEADLINE_PASSED : `Time left: ${formatRemaining(remaining)}`}
              </p>
            </>
          ) : (
            <p className="clock-words clock-note">{NOT_SYNCED}</p>
          )}
        </div>
      )}
      <p className="pledge-deadline">
        <span className="label">Deadline</span>
        <time dateTime={new Date(Number(pledge.deadline) * 1000).toISOString()}>{formatLocalTime(pledge.deadline)}</time>
      </p>
      <dl className="rows people">
        {PARTIES.map((party) => (
          <div key={party}>
            <dt className="label">
              {ROLE_LABELS[party]}
              {role === party && (
                <>
                  {" "}
                  <span className="you-mark">(you)</span>
                </>
              )}
            </dt>
            <dd>
              <HashValue
                kind="address"
                value={pledge[party]}
                explorerUrl={network.explorerUrl}
                copyNoun={`the ${party}'s address`}
                viewNoun={`the ${party}`}
              />
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
