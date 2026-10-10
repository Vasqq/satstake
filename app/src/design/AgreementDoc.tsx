import { type ReactNode, useState } from "react";
import { ExampleBadge } from "./ExampleBadge";

export type ReadAs = "staker" | "referee" | "beneficiary" | "anyone";
type Party = "staker" | "referee" | "beneficiary";
type PartyValue = ReactNode | ((note: string) => ReactNode);

// The dot is bound to what comes before it, so a line that wraps never begins with it.
const joined = (note: string) => `\u00a0· ${note}`;

const ROLES: readonly (readonly [ReadAs, string])[] = [
  ["staker", "Staker"],
  ["referee", "Referee"],
  ["beneficiary", "Beneficiary"],
  ["anyone", "Anyone"],
];

/** Which roles each of the seven lines applies to, in order. "Read as" lights a line when its role is here. */
export const CLAUSE_ROLES: readonly (readonly ReadAs[])[] = [
  ["staker"],
  ["referee"],
  ["staker", "referee"],
  ["referee", "beneficiary"],
  ["anyone"],
  ["staker"],
  ["staker", "referee", "beneficiary"],
];

function R({ k, on, children }: { k: ReadAs; on: ReadAs | null; children: ReactNode }) {
  return <span className={"r" + (on === k ? " on" : "")}>{children}</span>;
}

function clauseText(on: ReadAs | null, amountLabel: string, deadlineText: string): ReactNode[] {
  return [
    <>
      The <R k="staker" on={on}>staker</R> locks <strong>{amountLabel}</strong> in the contract. Nothing but clause 03 or 04 moves it.
    </>,
    <>
      Only the <R k="referee" on={on}>referee</R> may mark this promise Kept or Broken, once, and only before the deadline ({deadlineText}).
    </>,
    <>
      If the <R k="referee" on={on}>referee</R> marks it Kept, the stake returns to the <R k="staker" on={on}>staker</R>.
    </>,
    <>
      If it’s marked Broken, or the <R k="referee" on={on}>referee</R> says nothing by the deadline, the stake goes to the{" "}
      <R k="beneficiary" on={on}>beneficiary</R>.
    </>,
    <>
      After a verdict or the deadline, <R k="anyone" on={on}>anyone</R> may send the payout. SatStake takes no fee; the sender pays a few cents
      in USDC.
    </>,
    <>
      Nobody can cancel, edit or extend this promise. Not the <R k="staker" on={on}>staker</R>, and not the people who built SatStake.
    </>,
    <>
      The <R k="staker" on={on}>staker</R>, <R k="referee" on={on}>referee</R> and <R k="beneficiary" on={on}>beneficiary</R> must be three
      different addresses.
    </>,
  ];
}

export interface AgreementDocProps {
  /** The heading of the document, such as "Promise #4". */
  title: string;
  /** The stake as it is written for a reader, such as "$5.00 in USDC". */
  amountLabel: string;
  /** The deadline as it is written for a reader. */
  deadlineText: string;
  /**
   * The three parties: an address, a control showing one, or nothing yet. A function is given the party's note
   * (such as "rules once") to set on the line of the address, before whatever else the control shows under it.
   */
  staker?: PartyValue;
  referee?: PartyValue;
  beneficiary?: PartyValue;
  /** The party the connected account is, marked "(you)" beside the role's name. */
  you?: Party | null;
  /** A line under the title, such as the network. */
  meta?: ReactNode;
  /** Marks the document as an illustration, not a real promise. */
  example?: boolean;
  /** The chosen "Read as" role. Leave it out and the document keeps its own. */
  role?: ReadAs | null;
  onRoleChange?: (next: ReadAs | null) => void;
  /** Controls placed under a line, by its position from 0 to 6. */
  clauseActions?: Partial<Record<number, ReactNode>>;
  /** What sits on each signature line, such as the staker's ink. */
  signatures?: Partial<Record<Party, ReactNode>>;
  /** Placed directly under the document. */
  footer?: ReactNode;
}

const UNSET = "not set yet";

/**
 * The agreement every promise is: seven lines, three signature lines, and a "Read as" switch that lights the
 * lines a role cares about. It holds no data of its own; the page gives it the pledge's.
 *
 * @trace LLR-FE-040
 */
export function AgreementDoc(props: AgreementDocProps) {
  const [own, setOwn] = useState<ReadAs | null>(null);
  const controlled = props.role !== undefined;
  const on = controlled ? props.role : own;
  const choose = (next: ReadAs) => {
    const value = on === next ? null : next;
    if (!controlled) setOwn(value);
    props.onRoleChange?.(value);
  };
  const lines = clauseText(on ?? null, props.amountLabel, props.deadlineText);
  const parties: { who: Party; label: string; value: PartyValue; note: string }[] = [
    { who: "staker", label: "Staker", value: props.staker, note: "" },
    { who: "referee", label: "Referee", value: props.referee, note: "rules once" },
    { who: "beneficiary", label: "Beneficiary", value: props.beneficiary, note: "receives if broken or silent" },
  ];
  return (
    <>
      <div className="readas" role="group" aria-label="Read as">
        {ROLES.map(([k, label]) => (
          <button key={k} type="button" className="readbtn" aria-pressed={on === k} onClick={() => choose(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className={"doc" + (on ? " focus" : "")}>
        <div>
          <h3>{props.title}</h3>
          <div className="meta">
            {props.example && <ExampleBadge />}
            {props.meta}
          </div>
          <ol>
            {lines.map((line, i) => (
              <li key={i} className={on && (CLAUSE_ROLES[i] as readonly ReadAs[]).includes(on) ? "hit" : ""}>
                <div>
                  <span>{line}</span>
                  {props.clauseActions?.[i]}
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="margin">
          {parties.map(({ who, label, value, note }) => (
            <div key={who} className={"sig" + (on === who ? " on" : "")} onClick={() => choose(who)}>
              <div className="line">{props.signatures?.[who]}</div>
              <b>
                {label}
                {props.you === who && (
                  <>
                    {" "}
                    <span className="you-mark">(you)</span>
                  </>
                )}
              </b>
              <code>
                {typeof value === "function" ? (
                  <span>{value(note)}</span>
                ) : (
                  <>
                    <span>{value ?? UNSET}</span>
                    {note !== "" && joined(note)}
                  </>
                )}
              </code>
            </div>
          ))}
        </div>
      </div>
      {props.footer}
    </>
  );
}
