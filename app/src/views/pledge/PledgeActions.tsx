import { type RefObject, useEffect, useId, useRef, useState } from "react";
import type { Hex, PublicClient } from "viem";
import { useConfig, useConnection } from "wagmi";
import { writeContract } from "wagmi/actions";
import { satStakeAbi } from "../../abi";
import { userMessageFor } from "../../chain/errors";
import type { Pledge, PledgeState } from "../../chain/reads";
import type { SelectedNetwork } from "../../config/networks";
import { receiptOf } from "../../create/flow";
import { formatAmount, shorten } from "../../format";
import { RequestNotice, isUserRejection, useConnectionFailure } from "../../wallet/failure";
import type { WriteGate } from "../../wallet/gate";
import { HashValue } from "../HashValue";
import type { Role } from "../roles";
import { BrokenDialog } from "./BrokenDialog";
import { SETTLE_NOTES, planActions } from "./actions";
import { type RequestOutcome, runRequest } from "./request";

type Action = "markKept" | "markBroken" | "settle";

type Result =
  | { kind: "success"; text: string; hash: Hex }
  | { kind: "reverted"; error: unknown; hash: Hex | null }
  | { kind: "unconfirmed"; hash: Hex };

/** The wording of LLR-FE-046 for a transaction that was sent and whose receipt could not be read. */
export const UNCONFIRMED_MESSAGE =
  "Your transaction was sent, but its confirmation could not be read. This page shows the change as soon as the network does.";

// Each name is a literal so that the one place which lists what the application may call can be checked by reading.
const CALLS = {
  markKept: { functionName: "markKept" },
  markBroken: { functionName: "markBroken" },
  settle: { functionName: "settle" },
} as const;

const SUCCESS_TEXT: Record<"markKept" | "markBroken", string> = {
  markKept: "You marked this promise kept.",
  markBroken: "You marked this promise broken.",
};

export interface PledgeActionsProps {
  id: bigint;
  network: SelectedNetwork;
  client: PublicClient;
  gate: WriteGate;
  pledge: Pledge | null;
  state: PledgeState | null;
  role: Role | null;
  wallet: "none" | "pending" | "connected";
  deadlineReached: boolean | null;
  /** Called once a request is confirmed, so the page reads the state again at once. */
  onConfirmed: () => void;
  /** The status line, which takes focus when the dialog is closed by the page and not by the user. */
  statusRef: RefObject<HTMLElement | null>;
}

/**
 * What the visitor can do on a pledge (LLR-FE-042), the confirmation before a Broken verdict (LLR-FE-044), and
 * what became of a request (LLR-FE-046). The progress area is in the page from the first render, so a request's
 * result has somewhere to land and a screen reader has a place to start from.
 *
 * @trace LLR-FE-042 LLR-FE-044 LLR-FE-046
 */
export function PledgeActions(props: PledgeActionsProps) {
  const { id, network, client, gate, pledge, state, role, wallet, deadlineReached, onConfirmed, statusRef } = props;
  const config = useConfig();
  const { address } = useConnection();
  const failure = useConnectionFailure();
  const [pending, setPending] = useState<{ action: Action; hash: Hex | null } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inFlight = useRef(false);
  const progress = useRef<HTMLDivElement>(null);
  const success = useRef<HTMLParagraphElement>(null);
  const brokenButton = useRef<HTMLButtonElement>(null);
  const closedByUser = useRef(false);
  const ids = useId();

  const plan = state === null ? null : planActions({ state, role, wallet, deadlineReached });
  const verdictOffered = plan?.kind === "verdict";

  // The page can take the choice away while the dialog is open: chain time reaches the deadline, or a poll
  // shows another state. The dialog then closes and sends nothing.
  if (dialogOpen && !verdictOffered) setDialogOpen(false);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !dialogOpen && !closedByUser.current) statusRef.current?.focus(); // LLR-FE-044
    wasOpen.current = dialogOpen;
    closedByUser.current = false;
  }, [dialogOpen, statusRef]);

  const successText = result?.kind === "success" ? result.text : null;
  useEffect(() => {
    if (successText !== null) success.current?.focus(); // LLR-FE-072
  }, [successText]);

  async function start(action: Action, goesTo?: "staker" | "beneficiary") {
    if (inFlight.current) return; // LLR-FE-046
    inFlight.current = true;
    failure.clear();
    setResult(null);
    setPending({ action, hash: null });
    // The control that had focus is disabled from here on, so the progress element takes it.
    progress.current?.focus(); // LLR-FE-046
    const request = { address: network.contract, abi: satStakeAbi, ...CALLS[action], args: [id] } as const;
    try {
      const outcome: RequestOutcome = await runRequest(
        {
          send: () => writeContract(config, { ...request, chainId: network.chainId }), // LLR-FE-046
          receipt: (hash) => receiptOf(client, hash),
          explain: () =>
            client.simulateContract({ ...request, account: address }).then(
              () => null,
              (error: unknown) => error,
            ),
        },
        (hash) => setPending({ action, hash }),
      );
      setPending(null);
      if (outcome.kind === "confirmed") {
        const text = action === "settle" ? `Done. The stake was sent to the ${goesTo ?? "beneficiary"}.` : SUCCESS_TEXT[action];
        setResult({ kind: "success", text, hash: outcome.hash });
        onConfirmed(); // LLR-FE-046
      } else if (outcome.kind === "reverted") {
        setResult({ kind: "reverted", error: outcome.error, hash: outcome.hash });
      } else {
        setResult({ kind: "unconfirmed", hash: outcome.hash });
      }
    } catch (error) {
      setPending(null);
      // A revert the wallet found before sending has the contract's words and stays on screen. A rejection and
      // anything else go to the connection-bound message, which a change of wallet state removes.
      if (!isUserRejection(error) && userMessageFor(error) !== null) setResult({ kind: "reverted", error, hash: null });
      else failure.fail(error);
    } finally {
      inFlight.current = false;
    }
  }

  const busy = pending !== null;
  const gated = !gate.enabled;
  const reasonsId = `${ids}-reasons`;
  // aria-disabled and not the disabled attribute, as on the create form, so a control stays reachable by
  // keyboard and its reasons can be heard.
  const controlProps = {
    "aria-disabled": gated || busy,
    "aria-describedby": gated ? reasonsId : undefined,
  } as const;
  // A control that is only aria-disabled still receives clicks, so each handler refuses them itself.
  const refused = gated || busy; // LLR-FE-023
  function onKept() {
    if (!refused) void start("markKept");
  }
  function onBroken() {
    if (!refused) setDialogOpen(true);
  }
  function onSettle(goesTo: "staker" | "beneficiary") {
    if (!refused) void start("settle", goesTo);
  }

  const shownHash = pending?.hash ?? result?.hash ?? null;
  const notice = failure.error ?? (result?.kind === "reverted" ? result.error : null);

  const reasons = gated ? (
    <div id={reasonsId} className="hint">
      {gate.reasons.map((reason) => (
        <p key={reason}>{reason}</p>
      ))}
    </div>
  ) : null;

  return (
    <>
      {(plan?.kind === "connect" || plan?.kind === "waiting" || plan?.kind === "hint") && <p className="pledge-hint">{plan.text}</p>}

      {plan?.kind === "verdict" && (
        <div role="group" aria-labelledby={`${ids}-verdict`} className="pledge-actions">
          <h2 id={`${ids}-verdict`}>Did the staker keep this promise?</h2>
          <div className="action-buttons">
            <button type="button" className="button-primary" {...controlProps} onClick={onKept}>
              Kept
            </button>
            <button type="button" ref={brokenButton} {...controlProps} onClick={onBroken}>
              Broken
            </button>
          </div>
          {reasons}
          <p className="hint">Your verdict is final. Record it before the deadline, or the stake goes to the beneficiary.</p>
        </div>
      )}

      {plan?.kind === "settle" && (
        <div className="pledge-actions">
          <div className="action-buttons">
            <button
              type="button"
              className="button-primary"
              {...controlProps}
              onClick={() => onSettle(plan.goesTo)}
            >
              {plan.label}
            </button>
          </div>
          {reasons}
          <p className="hint">{SETTLE_NOTES[plan.goesTo]}</p>
        </div>
      )}

      {verdictOffered && pledge !== null && (
        <BrokenDialog
          open={dialogOpen}
          amount={formatAmount(network, pledge.token, pledge.amount)}
          beneficiary={shorten(pledge.beneficiary)}
          onCancel={() => {
            closedByUser.current = true;
            setDialogOpen(false);
            brokenButton.current?.focus(); // LLR-FE-044
          }}
          onConfirm={() => {
            closedByUser.current = true;
            setDialogOpen(false);
            void start("markBroken");
          }}
        />
      )}

      <div ref={progress} role="group" aria-label="Transaction progress" tabIndex={-1} className="pledge-progress">
        {pending !== null && <p>{pending.hash === null ? "Confirm in your wallet." : "Waiting for the network to confirm."}</p>}
        <RequestNotice error={notice} label="Transaction notices">
          {result?.kind === "unconfirmed" && <p className="notice">{UNCONFIRMED_MESSAGE}</p>}
        </RequestNotice>
        {result?.kind === "success" && (
          <p ref={success} tabIndex={-1} className="pledge-result">
            {result.text}
          </p>
        )}
        {shownHash !== null && (
          <HashValue
            kind="transaction"
            value={shownHash}
            explorerUrl={network.explorerUrl}
            copyNoun="the transaction hash"
            viewNoun="the transaction"
          />
        )}
      </div>
    </>
  );
}
