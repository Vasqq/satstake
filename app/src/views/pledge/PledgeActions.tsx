import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
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
import { BrokenConfirm } from "./BrokenConfirm";
import { SETTLE_LABEL, SETTLE_NOTES, planActions } from "./actions";
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

/** The agreement lines the controls sit under: the referee's ruling, and the payout. */
const RULING_LINE = 1;
const PAYOUT_LINE = 4;

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
  /** The same question asked again at the moment of a click, since the page's tick can be up to a second old. */
  deadlineReachedNow: () => boolean | null;
  /** Called once a request is confirmed, so the page reads the state again at once. */
  onConfirmed: () => void;
  /** The status line, which takes focus when the confirmation is closed by the page and not by the user. */
  statusRef: RefObject<HTMLElement | null>;
}

export interface PledgeActionsParts {
  /** Controls and hints for the agreement's lines, by position: the ruling line and the payout line. */
  clauseActions: Partial<Record<number, ReactNode>>;
  /** The progress and result of a request. In the page from the first render, so a result has somewhere to land. */
  progress: ReactNode;
}

/**
 * What the visitor can do on a pledge (LLR-FE-042), the confirmation before a Broken verdict (LLR-FE-044), and
 * what became of a request (LLR-FE-046). It returns pieces for the page to place in the agreement, and holds one
 * request state for all of them, so one pending request disables every control wherever it sits.
 *
 * @trace LLR-FE-042 LLR-FE-044 LLR-FE-046
 */
export function usePledgeActions(props: PledgeActionsProps): PledgeActionsParts {
  const { id, network, client, gate, pledge, state, role, wallet, deadlineReached, deadlineReachedNow, onConfirmed, statusRef } =
    props;
  const config = useConfig();
  const { address } = useConnection();
  const failure = useConnectionFailure();
  const [pending, setPending] = useState<{ action: Action; hash: Hex | null } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  // The state the page showed when a request was confirmed. Until a poll shows another one the chain has not
  // caught up with the request, and offering the same controls again would invite a second, refused request.
  const [confirmedFrom, setConfirmedFrom] = useState<PledgeState | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inFlight = useRef(false);
  const progress = useRef<HTMLDivElement>(null);
  const success = useRef<HTMLParagraphElement>(null);
  const brokenButton = useRef<HTMLButtonElement>(null);
  const closedByUser = useRef(false);
  const ids = useId();

  const waitingForChain = confirmedFrom !== null && state === confirmedFrom; // LLR-FE-046
  const plan = state === null || waitingForChain ? null : planActions({ state, role, wallet, deadlineReached });
  const verdictOffered = plan?.kind === "verdict";
  const busy = pending !== null;
  const gated = !gate.enabled;

  // The page can take the choice away while the confirmation is open: chain time reaches the deadline, a poll
  // shows another state, or the write gate turns off. The confirmation then closes and sends nothing.
  if (confirmOpen && (!verdictOffered || gated)) setConfirmOpen(false); // LLR-FE-044
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !confirmOpen && !closedByUser.current) statusRef.current?.focus(); // LLR-FE-044
    wasOpen.current = confirmOpen;
    closedByUser.current = false;
  }, [confirmOpen, statusRef]);

  const successText = result?.kind === "success" ? result.text : null;
  useEffect(() => {
    if (successText !== null) success.current?.focus(); // LLR-FE-072
  }, [successText]);

  // The control that had focus is disabled once a request starts, so the progress element takes it. This runs
  // after the render, so the line it holds is already in the status element when focus arrives.
  useEffect(() => {
    if (busy) progress.current?.focus(); // LLR-FE-046
  }, [busy]);

  async function start(action: Action, goesTo?: "staker" | "beneficiary") {
    if (inFlight.current) return; // LLR-FE-046
    inFlight.current = true;
    failure.clear();
    setResult(null);
    setPending({ action, hash: null });
    const request = { address: network.contract, abi: satStakeAbi, ...CALLS[action], args: [id] } as const;
    try {
      const outcome: RequestOutcome = await runRequest(
        {
          send: () => writeContract(config, { ...request, chainId: network.chainId }), // LLR-FE-046
          receipt: (hash) => receiptOf(client, hash),
          // The call is replayed in the parent of the block that mined it, with that block's time, so the
          // reason named is the one the transaction met and not one that arose from the state since.
          explain: async (mined) => {
            if (mined.blockNumber === undefined) return null;
            const block = await client.getBlock({ blockNumber: mined.blockNumber });
            return client
              .simulateContract({
                ...request,
                account: address,
                blockNumber: mined.blockNumber - 1n, // LLR-FE-046
                blockOverrides: { time: block.timestamp }, // LLR-FE-046
              })
              .then(
                () => null,
                (error: unknown) => error,
              );
          },
        },
        (hash) => setPending({ action, hash }),
      );
      setPending(null);
      if (outcome.kind === "confirmed") {
        const text = action === "settle" ? `Done. The stake was sent to the ${goesTo ?? "beneficiary"}.` : SUCCESS_TEXT[action];
        setResult({ kind: "success", text, hash: outcome.hash });
        setConfirmedFrom(state); // LLR-FE-046
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

  const reasonsId = `${ids}-reasons`;
  // aria-disabled and not the disabled attribute, as on the create form, so a control stays reachable by
  // keyboard and its reasons can be heard.
  const controlProps = {
    "aria-disabled": gated || busy,
    "aria-describedby": gated ? reasonsId : undefined,
  } as const;
  // A control that is only aria-disabled still receives clicks, so each handler refuses them itself.
  const refused = gated || busy; // LLR-FE-023
  // A verdict is also refused when chain time has reached the deadline since the page last rendered.
  const lateVerdict = () => deadlineReachedNow() === true; // LLR-FE-042
  function closeConfirmation() {
    if (!confirmOpen) return;
    closedByUser.current = true;
    setConfirmOpen(false);
  }
  function onKept() {
    if (refused) return;
    closeConfirmation();
    // The controls go with the next tick, up to a second away, so the refusal is said by moving focus to the status.
    if (lateVerdict()) statusRef.current?.focus(); // LLR-FE-042
    else void start("markKept");
  }
  function onBroken() {
    if (!refused) setConfirmOpen(true); // LLR-FE-044
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

  const hint =
    plan?.kind === "connect" || plan?.kind === "waiting" || plan?.kind === "hint" ? <p className="pledge-hint">{plan.text}</p> : null;

  const verdict =
    plan?.kind === "verdict" ? (
      <div role="group" aria-labelledby={`${ids}-verdict`} className="verdict-controls">
        <p id={`${ids}-verdict`} className="verdict-prompt">
          Was this promise kept?
        </p>
        <div className="action-buttons">
          <button type="button" className="b ink" {...controlProps} onClick={onKept}>
            Kept
          </button>
          <button type="button" className="b ghost" ref={brokenButton} aria-expanded={confirmOpen} {...controlProps} onClick={onBroken}>
            Broken
          </button>
        </div>
        {reasons}
        <p className="hint">Your verdict is final. Record it before the deadline, or the stake goes to the person named to get it.</p>
        {confirmOpen && pledge !== null && (
          <BrokenConfirm
            amount={formatAmount(network, pledge.token, pledge.amount)}
            beneficiary={shorten(pledge.beneficiary)}
            onCancel={() => {
              closeConfirmation();
              brokenButton.current?.focus(); // LLR-FE-044
            }}
            onConfirm={() => {
              // The step may have outlived the conditions that offered it. A refusal closes it without the
              // user-closed mark, so focus goes to the status line like any other close the page makes.
              if (refused || lateVerdict()) {
                setConfirmOpen(false);
                return;
              }
              closeConfirmation();
              void start("markBroken");
            }}
          />
        )}
      </div>
    ) : null;

  const settle =
    plan?.kind === "settle" ? (
      <div className="payout-controls">
        <div className="action-buttons">
          <button type="button" className="b sat" {...controlProps} onClick={() => onSettle(plan.goesTo)}>
            {SETTLE_LABEL}
          </button>
        </div>
        {reasons}
        <p className="hint">{SETTLE_NOTES[plan.goesTo]}</p>
      </div>
    ) : null;

  // A hint sits under the line it is about: ruling while the promise is open, the payout once it can be sent.
  const hintLine = state === "Active" ? RULING_LINE : PAYOUT_LINE;
  const clauseActions: Partial<Record<number, ReactNode>> = {
    [RULING_LINE]: (
      <>
        {hintLine === RULING_LINE && hint}
        {verdict}
      </>
    ),
    [PAYOUT_LINE]: (
      <>
        {hintLine === PAYOUT_LINE && hint}
        {settle}
      </>
    ),
  };

  const progressArea = (
    <div ref={progress} role="group" aria-label="Transaction progress" tabIndex={-1} className="pledge-progress">
      {/* In the page from the first render, so each line it is given is announced; the group around it is not live. */}
      <p role="status" className="pledge-pending">
        {pending !== null && (pending.hash === null ? "Confirm in your wallet." : "Waiting for the network to confirm.")}
      </p>
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
  );

  return { clauseActions, progress: progressArea };
}
