import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { type Address, type PublicClient, erc20Abi, formatUnits, getAddress, isAddress } from "viem";
import { useConfig, useConnection } from "wagmi";
import { writeContract } from "wagmi/actions";
import { satStakeAbi } from "../abi";
import { ChainClock } from "../chain/clock";
import { useTick } from "../chain/useTick";
import type { Reads } from "../chain/reads";
import type { Health } from "../chain/useHealth";
import type { SelectedNetwork, TokenConfig } from "../config/networks";
import { Hero } from "../design/Hero";
import { SignaturePad } from "../design/SignaturePad";
import { HashValue } from "../views/HashValue";
import { RequestNotice, useConnectionFailure } from "../wallet/failure";
import { useWriteGate } from "../wallet/gate";
import { formatLocalTime, formatSats, shorten } from "../format";
import { parseAmount } from "./amount";
import { CopyLink } from "./CopyLink";
import { type DeadlineChoice, PRESETS, deadlineBounds, localToTimestamp } from "./deadline";
import {
  type Creation,
  CreationUnconfirmedError,
  DeadlineCheckError,
  type CreateInput,
  type FlowIO,
  type Step,
  receiptOf,
  runCreate,
} from "./flow";
import { sealBytesOf, sealLabelOf, shareLink, stakeWords } from "./sealed";
import { type BalanceState, MAX_PROMISE_BYTES, type Field, type FormValues, checkForm, customDeadlineMessage, promiseBytes } from "./validate";

/** The statement of LLR-FE-034. */
const ACKNOWLEDGEMENT =
  "I understand that the referee alone decides whether I kept this promise. If the referee marks it broken, or has not marked it kept by the deadline, my stake goes to the beneficiary and cannot be recovered.";

const INTRO = "Lock a stake against a promise. Your referee decides whether you kept it.";
const LANDING_SUB =
  "Or my stake goes to someone I chose. A friend decides whether I kept it, and code makes sure the money goes where they say.";

// The field takes more than the contract does, so a pasted text that is too long is said to be too long beside the
// field, as LLR-FE-030 asks, and is not cut short without a word.
const PROMISE_FIELD_LIMIT = 1000;

const HINTS = {
  promise: "Anyone can read this, and it cannot be changed later.",
  referee: "The person who decides. They must mark the promise kept before the deadline.",
};

const FIELD_ORDER: Field[] = ["promise", "token", "amount", "referee", "beneficiary", "deadline", "acknowledged"];
// What the "still to complete" line calls each field: what the person sees beside it, and for the checkbox,
// which has no label of its own, what it does.
const FIELD_LABELS: Record<Field, string> = {
  promise: "Promise",
  token: "Token",
  amount: "Amount",
  referee: "Referee address",
  beneficiary: "Beneficiary address",
  deadline: "Deadline",
  acknowledged: "the box confirming you understand",
};

/** A balance, or the chain time, that could not be read is asked for again this often (LLR-FE-030, 031). */
const RETRY_READ_MS = 5_000;

const STAGE_TEXT: Record<Step["stage"], string> = {
  wallet: "Confirm in your wallet.",
  confirming: "Waiting for the network to confirm.",
  done: "Done.",
  waiting: "Starts after step 1.",
};

/** The wording of LLR-FE-062 for a creation the wallet sent whose receipt could not be read. */
const UNCONFIRMED_MESSAGE = "Your promise was sent, but its confirmation could not be read. Check My promises before trying again.";

/** Said before the first prompt (LLR-FE-033), when the allowance has not been read yet. */
const PROMPT_COUNT_HINT = "Your wallet may ask twice: first to let SatStake take exactly this amount, then to create the promise.";

/** What the progress area shows: the steps, the amount in words, and whether a confirmed approval is being kept on screen. */
interface Progress {
  steps: Step[];
  amountText: string;
  kept: boolean;
}

function stepLabel(step: Step, progress: Progress): string {
  const numbered = progress.steps.some((s) => s.id === "approve");
  if (step.id === "approve") return `Step 1 of 2: let SatStake take ${progress.amountText}`;
  return numbered ? "Step 2 of 2: create the promise" : "Create the promise";
}

/**
 * Always shown beside the beneficiary field, since the mistake is made there and cannot be undone (LLR-FE-034). It
 * is also what the field is for, so there is no separate hint saying the same thing a second time.
 */
const BENEFICIARY_CAUTION =
  "This address receives your stake if the promise is broken or missed. If nobody controls it, the stake is lost for good.";

const WARNINGS = {
  referee:
    "This address is a contract. If it cannot call SatStake, it cannot mark your promise kept, and your stake goes to the beneficiary after the deadline.",
  beneficiary: "This address is a contract. If it cannot move tokens, a stake paid to it cannot be recovered.",
};

interface ControlProps {
  id: string;
  "aria-describedby": string;
  "aria-invalid": true | undefined;
}

interface FieldShellProps {
  id: string;
  label: string;
  /** The failure to show; the container is in the page whether or not there is one. */
  error: string | undefined;
  /** Undefined for a field that cannot warn; an empty string for one that can, so its container exists. */
  warning?: string;
  /** One line each, in a container that is linked to the control. */
  hints?: readonly string[];
  /** A warning that is always on the page, unlike `warning`, which comes and goes with what is typed. */
  caution?: string;
  control: (props: ControlProps) => ReactNode;
}

function FieldShell({ id, label, error, warning, hints, caution, control }: FieldShellProps) {
  const describedBy = [
    hints !== undefined && `${id}-hint`,
    caution !== undefined && `${id}-caution`,
    warning !== undefined && `${id}-warning`,
    `${id}-error`,
  ]
    .filter((part): part is string => part !== false)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id} className="label">
        {label}
      </label>
      {control({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hints !== undefined && (
        <div id={`${id}-hint`} className="hint">
          {hints.map((hint) => (
            <p key={hint}>{hint}</p>
          ))}
        </div>
      )}
      {caution !== undefined && (
        <p id={`${id}-caution`} className="field-caution">
          {caution}
        </p>
      )}
      {warning !== undefined && (
        <p id={`${id}-warning`} className="field-warning" aria-live="polite">
          {warning}
        </p>
      )}
      <p id={`${id}-error`} className="field-error" aria-live="polite">
        {error ?? ""}
      </p>
    </div>
  );
}

const DELEGATION_PREFIX = "0xef0100";

/**
 * Whether an address has deployed code, asked only for one that is well formed and once per address.
 * A failed read says nothing, since the warning is advice and not a check.
 */
function useHasCode(client: PublicClient, network: SelectedNetwork, text: string): boolean {
  const wellFormed = isAddress(text);
  const query = useQuery({
    queryKey: ["code", network.chainId, text.toLowerCase()],
    queryFn: async () => {
      const code = await client.getCode({ address: text as Address });
      // An account that has delegated to code under EIP-7702 holds the designator 0xef0100 and an address, and is
      // a person's wallet, so it is not the contract the warning is about.
      return code !== undefined && !code.startsWith(DELEGATION_PREFIX); // LLR-FE-035
    },
    enabled: wellFormed,
    retry: false,
  });
  return wellFormed && query.data === true;
}

/**
 * The staker's ERC-20 balance of a token, read again every 5 seconds for as long as the last read failed. USDC is
 * read as the ERC-20 balance it is on Arc, with its own decimals, not as the native balance.
 */
function useBalance(client: PublicClient, network: SelectedNetwork, token: Address, staker: Address | undefined): BalanceState {
  const query = useQuery({
    queryKey: ["balance", network.chainId, token.toLowerCase(), staker?.toLowerCase()],
    queryFn: () => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [staker as Address] }),
    enabled: staker !== undefined,
    retry: false,
    refetchInterval: (q) => (q.state.status === "error" ? RETRY_READ_MS : false), // LLR-FE-030
  });
  if (staker === undefined) return { status: "none" };
  if (query.isError) return { status: "error" };
  return query.data === undefined ? { status: "loading" } : { status: "ok", value: query.data };
}

const INITIAL_DEADLINE: DeadlineChoice = { kind: "none" };

/** What the flow needs of the deadline choice, or null while there is no usable choice. */
function deadlineOf(choice: DeadlineChoice): CreateInput["deadline"] | null {
  if (choice.kind === "preset") {
    const preset = PRESETS.find((p) => p.id === choice.id);
    return preset === undefined ? null : { kind: "preset", seconds: preset.seconds };
  }
  if (choice.kind === "custom") {
    const timestamp = localToTimestamp(choice.local);
    return timestamp === null ? null : { kind: "custom", timestamp };
  }
  return null;
}

export interface CreateViewProps {
  client: PublicClient;
  reads: Reads;
  network: SelectedNetwork;
  /** The shell's checks, so the page does not run a second set. */
  health: Health;
  /**
   * `page` is the hero on a page of its own, with focus in the promise. `landing` is the same hero under the
   * landing's sentence, where the promise starts as rotating examples until the visitor writes.
   */
  variant: "page" | "landing";
  /** Called with the new pledge's identifier once the creation has landed. */
  onCreated?: (id: bigint) => void;
}

/**
 * The hero and the pad that make a promise: the sentence is the promise, the pad's head holds the stake and the
 * parties, its foot the deadline, the statement and the steps. The creation ends here, on a seal drawn from its
 * transaction hash and the link to share (LLR-FE-037). Making another promise starts the pad again.
 */
export function CreateView(props: CreateViewProps) {
  const [round, setRound] = useState(0);
  return <CreatePad key={round} {...props} another={() => setRound((n) => n + 1)} />;
}

/**
 * Every write goes through `useWriteGate`, names the configured chain so the wallet's chain is read again when
 * the request is sent, and is one the wallet shows as a transaction: nothing here asks for a signature of a
 * message. The pad takes no drawing: the signature on it is an animation and nothing of it is stored or sent.
 *
 * @trace LLR-FE-006 LLR-FE-023 LLR-FE-030 LLR-FE-031 LLR-FE-032 LLR-FE-033 LLR-FE-034 LLR-FE-035 LLR-FE-036 LLR-FE-037
 * @trace LLR-FE-060 LLR-FE-061 LLR-FE-062 LLR-FE-072 LLR-FE-074
 */
function CreatePad({ client, reads, network, health, variant, onCreated, another }: CreateViewProps & { another: () => void }) {
  const ids = useId();
  const formId = `${ids}-form`;
  const config = useConfig();
  const queryClient = useQueryClient();
  const connection = useConnection();
  const staker = connection.status === "connected" ? connection.address : undefined;
  const gate = useWriteGate(health.network, network); // LLR-FE-023
  const failure = useConnectionFailure();
  // Kept apart from `failure`, which a connection change clears: a creation whose outcome is unknown stays said,
  // and blocks a second one, until the page is left or reloaded (LLR-FE-062).
  const [unconfirmed, setUnconfirmed] = useState<CreationUnconfirmedError | null>(null);

  // The visitor's own ending of the sentence; null while the examples rotate, which is no promise at all.
  const [custom, setCustom] = useState<string | null>(variant === "page" ? "" : null);
  const [rest, setRest] = useState<Omit<FormValues, "promise">>({
    token: network.tokens[0]!.address,
    amount: "",
    referee: "",
    beneficiary: "",
    deadline: INITIAL_DEADLINE,
    acknowledged: false,
  });
  const values: FormValues = { ...rest, promise: custom ?? "" };
  const [touched, setTouched] = useState<ReadonlySet<Field>>(new Set());
  const [busy, setBusy] = useState(false);
  // The creation, once it has landed; the ink then collapses into the ring, and only after that is the seal shown.
  const [created, setCreated] = useState<Creation | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const panel = useRef<HTMLElement>(null);
  // The failure of a custom deadline found when submit was activated or before the creation, which the person
  // mends by choosing another time, so it goes when the deadline changes or a new attempt starts.
  const [recheck, setRecheck] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  // Set at once in the handler, since two presses can arrive before the page renders in between.
  const inFlight = useRef(false);
  // Fields are read-only from the moment a request is pending (LLR-FE-036) and stay so once the promise exists.
  const locked = busy || created !== null;

  const token = network.tokens.find((t) => t.address.toLowerCase() === values.token.toLowerCase());

  // A transaction changes the balance of the token and, through the fee, of USDC, so both are read again; a balance
  // read once and left would judge the next attempt against a figure that is no longer true (LLR-FE-030).
  const refreshBalances = () => void queryClient.invalidateQueries({ queryKey: ["balance", network.chainId] });

  // The network fee is paid in USDC, so its balance matters whichever token is staked. For a USDC stake the two
  // reads share one cache entry and cost one request.
  const usdc = network.tokens.find((t) => t.symbol === "USDC") as TokenConfig;
  const balance = useBalance(client, network, values.token, staker);
  const feeBalance = useBalance(client, network, usdc.address, staker);

  // Chain time and not the device's clock judges a custom deadline. It is read when the page opens and then
  // carried forward by the monotonic clock, as on the pledge page. A read that failed is made again every 5 s.
  const [clock] = useState(() => new ChainClock());
  const clockQuery = useQuery({
    queryKey: ["chain-time", network.chainId],
    queryFn: async () => {
      const timestamp = await reads.latestBlockTimestamp();
      // Taken when the block has arrived, so the time the request took is not counted as time since the block.
      clock.sync(timestamp, clock.mark()); // LLR-FE-012
      return timestamp;
    },
    retry: false,
    gcTime: 0,
    refetchInterval: (q) => (q.state.status === "error" ? RETRY_READ_MS : false), // LLR-FE-031
  });
  // The end of a preset moves with chain time, so the page redraws once a second without reading anything.
  useTick(); // LLR-FE-012
  const chainNow = clock.now();

  const refereeHasCode = useHasCode(client, network, values.referee); // LLR-FE-035
  const beneficiaryHasCode = useHasCode(client, network, values.beneficiary); // LLR-FE-035

  const check = checkForm(values, {
    network,
    staker,
    balance,
    feeBalance,
    chainNow,
    clockFailed: clockQuery.isError && chainNow === null,
    tokenEnabled: health.creationEnabled(values.token), // LLR-FE-006
  });
  // Before the first token reading there is nothing to report about the token, though creation stays off.
  const errors = { ...check.errors };
  if (health.tokens === null) delete errors.token;

  // A failure shows once its field has been left, or at once when typing cannot mend it, and then follows every
  // change because it is computed from the values on each render.
  const shown = (field: Field): string | undefined =>
    touched.has(field) || check.atOnce.includes(field) ? errors[field] : undefined; // LLR-FE-030
  const touch = (field: Field) => setTouched((previous) => (previous.has(field) ? previous : new Set(previous).add(field)));
  /** `leaves` is for a control whose change is the person finishing with it: a choice or a tick, not a keystroke. */
  const set = <K extends Exclude<keyof FormValues, "promise">>(field: K, value: FormValues[K], leaves = false) => {
    if (field === "deadline") setRecheck(null);
    setRest((previous) => ({ ...previous, [field]: value }));
    if (leaves) touch(field);
  };

  const parsed = token === undefined ? null : parseAmount(values.amount, token.decimals);
  const deadlineInput = deadlineOf(values.deadline);
  const ready = check.valid && parsed?.ok === true && deadlineInput !== null;
  const canSubmit = gate.enabled && ready && !busy && unconfirmed === null && created === null; // LLR-FE-023 LLR-FE-036 LLR-FE-062

  const promiseId = `${ids}-promise`;
  // The control that takes focus for each field: the first choice of the deadline, or its date when that is custom.
  const focusIds: Record<Field, string> = {
    promise: promiseId,
    token: `${ids}-token`,
    amount: `${ids}-amount`,
    referee: `${ids}-referee`,
    beneficiary: `${ids}-beneficiary`,
    deadline: values.deadline.kind === "custom" ? `${ids}-custom` : `${ids}-deadline-${PRESETS[0]!.id}`,
    acknowledged: `${ids}-acknowledged`,
  };

  // The promise is a field only once the visitor has chosen to write, so focus waits for it to exist.
  const focusPromise = useRef(false);
  useEffect(() => {
    if (custom === null || !focusPromise.current) return;
    focusPromise.current = false;
    document.getElementById(promiseId)?.focus();
  }, [custom, promiseId]);

  // Focus goes to the panel that replaces the button which was pressed, once the seal is shown.
  useEffect(() => {
    if (collapsed) panel.current?.focus(); // LLR-FE-072
  }, [collapsed]);

  /** What activating a disabled submit does: every field counts as left, and focus goes to the first at fault. */
  function revealFaults() {
    setTouched(new Set(FIELD_ORDER));
    const first = FIELD_ORDER.find((field) => errors[field] !== undefined); // LLR-FE-030
    if (first === "promise" && custom === null) {
      focusPromise.current = true;
      setCustom("");
    } else if (first !== undefined) document.getElementById(focusIds[first])?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return; // LLR-FE-036
    if (!canSubmit || staker === undefined || token === undefined || parsed?.ok !== true || deadlineInput === null) {
      if (!busy && created === null) revealFaults();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setRecheck(null);
    failure.clear(); // LLR-FE-061
    const amount = parsed.value;
    const { promise, referee, beneficiary } = values;
    const amountText = `${formatUnits(amount, token.decimals)} ${token.symbol}`;
    let latest: Step[] = [];
    // Each write names the configured chain, so the wallet's chain is read again when the request is sent and a
    // wallet that moved to another network without telling the page is refused.
    const send = { chainId: network.chainId } as const;
    const io: FlowIO = {
      contract: network.contract,
      allowance: (atBlock) =>
        client.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [staker, network.contract],
          ...(atBlock === undefined ? {} : { blockNumber: atBlock }),
        }),
      approve: (exact) =>
        writeContract(config, {
          ...send,
          address: token.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [network.contract, exact], // LLR-FE-033
        }),
      create: (deadlineSeconds) =>
        writeContract(config, {
          ...send,
          address: network.contract,
          abi: satStakeAbi,
          functionName: "createPledge",
          args: [token.address, amount, getAddress(referee), getAddress(beneficiary), deadlineSeconds, promise],
        }),
      receipt: (hash) => receiptOf(client, hash).finally(refreshBalances), // LLR-FE-030
      chainTime: () => reads.latestBlockTimestamp(),
      clockNow: () => clock.now(),
    };
    try {
      const done = await runCreate(io, { amount, deadline: deadlineInput }, (steps) => {
        latest = steps;
        setProgress({ steps, amountText, kept: false });
      });
      // The view stays where the creation was made (LLR-FE-037): the ink collapses, then the seal is shown.
      setCreated(done); // LLR-FE-037
      onCreated?.(done.id);
    } catch (error) {
      // A deadline that no longer passes is said beside the deadline, and nothing went wrong with a request.
      if (error instanceof DeadlineCheckError) setRecheck(customDeadlineMessage(error.check) ?? null);
      else if (error instanceof CreationUnconfirmedError) setUnconfirmed(error); // LLR-FE-062
      else failure.fail(error);
      // A confirmed approval stays in place whatever happened to the creation, so it stays on screen. When
      // the creation was sent and its outcome is unknown the message to read is the other one.
      const approval = latest.find((step) => step.id === "approve");
      const kept = approval?.stage === "done" && !(error instanceof CreationUnconfirmedError);
      setProgress(kept ? { steps: [approval], amountText, kept: true } : null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // A token that is switched off is said beside its own field, and the person cannot complete it, so it is not listed.
  const incomplete = FIELD_ORDER.filter((field) => field !== "token" && errors[field] !== undefined).map((field) => FIELD_LABELS[field]);
  // What a person sees beside the deadline: the failure of the form as it stands, or the one found at submit.
  const deadlineFailure = shown("deadline") ?? recheck ?? undefined;
  // The date field offers only what chain time allows, once chain time is known.
  const bounds = chainNow === null ? undefined : deadlineBounds(chainNow);
  const reading = balance.status === "loading" || feeBalance.status === "loading";
  // cirBTC is also shown in satoshis, its smallest unit, which is how people count it (LLR-FE-045).
  const inSats = (value: bigint) => (token?.symbol === "cirBTC" ? ` (${formatSats(value)})` : "");
  const balanceHint =
    balance.status === "ok" && token !== undefined
      ? `Your balance: ${formatUnits(balance.value, token.decimals)} ${token.symbol}${inSats(balance.value)}.`
      : reading
        ? "Reading your balance."
        : undefined;
  const amountHint =
    token !== undefined && parsed?.ok === true && parsed.value > 0n && errors.amount === undefined
      ? `This amount: ${formatUnits(parsed.value, token.decimals)} ${token.symbol}${inSats(parsed.value)}.`
      : undefined;
  const choice = values.deadline;
  const chosenPreset = choice.kind === "preset" ? PRESETS.find((p) => p.id === choice.id) : undefined;
  // Approximate, since the deadline is fixed from a fresh reading when the creation is sent (LLR-FE-031).
  const presetEnds = chosenPreset !== undefined && chainNow !== null ? `Ends about ${formatLocalTime(chainNow + chosenPreset.seconds)}.` : "";
  const choices: { key: string; label: string; checked: boolean; select: () => void }[] = [
    ...PRESETS.map((preset) => ({
      key: preset.id,
      label: preset.label,
      checked: choice.kind === "preset" && choice.id === preset.id,
      select: () => set("deadline", { kind: "preset", id: preset.id }, true),
    })),
    // Choosing Custom is the start of choosing a time, not the end of it, so the deadline is judged when it is left.
    { key: "custom", label: "Custom", checked: choice.kind === "custom", select: () => set("deadline", { kind: "custom", local: "" }) },
  ];

  // The button names what will be sealed, once there is an amount to name.
  const sealLabel =
    token !== undefined && parsed?.ok === true && parsed.value > 0n ? `Seal it with ${stakeWords(network, token.address, parsed.value)}` : "Seal it";

  const sealed = created !== null && collapsed;
  const head =
    created === null || !collapsed ? (
      <div className="pad-form-head">
        <span className="label">New promise</span>
        <div className="pad-fields">
          <FieldShell
            id={`${ids}-token`}
            label="Token"
            error={shown("token")}
            control={(props) => (
              <select {...props} disabled={locked} value={values.token} onChange={(event) => set("token", event.target.value as Address, true)} onBlur={() => touch("token")}>
                {network.tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            )}
          />
          <FieldShell
            id={`${ids}-amount`}
            label="Amount"
            error={shown("amount")}
            hints={[balanceHint, amountHint].filter((hint): hint is string => hint !== undefined)}
            control={(props) => (
              <input
                {...props}
                type="text"
                readOnly={locked}
                inputMode="decimal"
                autoComplete="off"
                value={values.amount}
                onChange={(event) => set("amount", event.target.value)}
                onBlur={() => touch("amount")}
              />
            )}
          />
          <FieldShell
            id={`${ids}-referee`}
            label="Referee address"
            error={shown("referee")}
            hints={[HINTS.referee]}
            warning={shown("referee") === undefined && refereeHasCode ? WARNINGS.referee : ""}
            control={(props) => (
              <input
                {...props}
                type="text"
                readOnly={locked}
                autoComplete="off"
                spellCheck={false}
                value={values.referee}
                onChange={(event) => set("referee", event.target.value)}
                onBlur={() => touch("referee")}
              />
            )}
          />
          <FieldShell
            id={`${ids}-beneficiary`}
            label="Beneficiary address"
            error={shown("beneficiary")}
            caution={BENEFICIARY_CAUTION} // LLR-FE-034
            warning={shown("beneficiary") === undefined && beneficiaryHasCode ? WARNINGS.beneficiary : ""}
            control={(props) => (
              <input
                {...props}
                type="text"
                readOnly={locked}
                autoComplete="off"
                spellCheck={false}
                value={values.beneficiary}
                onChange={(event) => set("beneficiary", event.target.value)}
                onBlur={() => touch("beneficiary")}
              />
            )}
          />
        </div>
      </div>
    ) : (
      <>
        <span className="label">{`Promise #${created.id.toString()} · sealed`}</span>
        <div className="who">
          <span>
            Staker <b className="mono">{shorten(created.staker)}</b>
          </span>
          <span>
            Referee <b className="mono">{shorten(created.referee)}</b>
          </span>
          <span>
            Beneficiary <b className="mono">{shorten(created.beneficiary)}</b>
          </span>
        </div>
      </>
    );

  const foot = sealed ? (
    <section ref={panel} className="sealed" aria-label="Sealed promise" tabIndex={-1}>
      <div>
        <span className="label">Sealed in transaction</span>
        <HashValue
          kind="transaction"
          value={created.hash}
          explorerUrl={network.explorerUrl}
          copyNoun="the transaction hash"
          viewNoun="the creation transaction"
        />
      </div>
      <div>
        <span className="label">Promise number</span>
        <b>{`#${created.id.toString()}`}</b>
      </div>
      <div>
        {/* The stake leaves the contract only when someone sends the payout, which no verdict or deadline does by itself. */}
        <span className="label">Stake held</span>
        <b>{`Until the payout is sent, after the referee rules or ${formatLocalTime(created.deadline)}`}</b>
      </div>
      <div className="sealed-share">
        <span className="label">Send this link to your referee and your beneficiary</span>
        <code>{shareLink(created.id)}</code>
        <div className="btns">
          <CopyLink id={created.id} bare />
          <a className="b ghost" href={`#/p/${created.id.toString()}`}>
            Open the promise
          </a>
          <button type="button" className="b ghost" onClick={another}>
            Make another promise
          </button>
        </div>
      </div>
    </section>
  ) : (
    <div className="pad-foot">
      {/* The deadline is left when focus goes out of the whole group, and not when it moves from Custom to its date. */}
      <fieldset
        aria-describedby={`${ids}-deadline-end ${ids}-deadline-error`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) touch("deadline");
        }}
      >
        <legend className="label">Deadline</legend>
        <div className="choices">
          {choices.map((option) => (
            <label className="choice" key={option.key}>
              <input
                id={`${ids}-deadline-${option.key}`}
                type="radio"
                name={`${ids}-deadline`}
                disabled={locked}
                checked={option.checked}
                onChange={option.select}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p id={`${ids}-deadline-end`} className="hint">
          {presetEnds}
        </p>
        {choice.kind === "custom" && (
          <div className="field">
            <label htmlFor={`${ids}-custom`} className="label">
              Custom date and time
            </label>
            <input
              id={`${ids}-custom`}
              type="datetime-local"
              aria-describedby={`${ids}-custom-hint ${ids}-deadline-error`}
              aria-invalid={deadlineFailure ? true : undefined}
              readOnly={locked}
              min={bounds?.min}
              max={bounds?.max}
              value={choice.local}
              onChange={(event) => set("deadline", { kind: "custom", local: event.target.value })}
            />
            <p id={`${ids}-custom-hint`} className="hint">
              In your local time.
            </p>
          </div>
        )}
        <p id={`${ids}-deadline-error`} className="field-error" aria-live="polite">
          {deadlineFailure ?? ""}
        </p>
      </fieldset>

      <div className="field">
        <label className="choice ack">
          <input
            id={`${ids}-acknowledged`}
            type="checkbox"
            disabled={locked}
            checked={values.acknowledged}
            aria-describedby={`${ids}-acknowledged-error`}
            aria-invalid={shown("acknowledged") ? true : undefined}
            onChange={(event) => set("acknowledged", event.target.checked, true)}
            onBlur={() => touch("acknowledged")}
          />
          {ACKNOWLEDGEMENT}
        </label>
        <p id={`${ids}-acknowledged-error`} className="field-error" aria-live="polite">
          {shown("acknowledged") ?? ""}
        </p>
      </div>

      <div className="submit-area">
        {/* aria-disabled and not the disabled attribute, so the control stays reachable by keyboard and its reasons can be heard. */}
        <button type="submit" className="b ink" aria-disabled={!canSubmit} aria-describedby={`${ids}-prompts ${ids}-submit-help`}>
          {sealLabel}
        </button>
        {/* The status and every note, in one block: beside the button on a wide pad, under it on a phone. */}
        <div className="submit-notes">
          <p id={`${ids}-prompts`} className="hint">
            {progress === null ? PROMPT_COUNT_HINT : ""}
          </p>
          <div id={`${ids}-submit-help`} className="hint">
            {gate.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            {health.tokens === null && <p>Checking the tokens.</p>}
            {incomplete.length > 0 && <p>Still to complete: {incomplete.join(", ")}.</p>}
          </div>
          <div role="status" aria-label="Promise progress" className="progress">
            {progress !== null && (
              <>
                <ul>
                  {progress.steps.map((step) => (
                    <li key={step.id}>
                      {stepLabel(step, progress)}. {STAGE_TEXT[step.stage]}
                    </li>
                  ))}
                </ul>
                {progress.kept && (
                  <p>Your approval of {progress.amountText} is confirmed and stays in place, so trying again asks your wallet once.</p>
                )}
              </>
            )}
          </div>
          <RequestNotice error={failure.error} label="Create notices">
            {unconfirmed !== null && (
              <>
                <p className="notice notice-failure">{UNCONFIRMED_MESSAGE}</p>
                <p>
                  Transaction: <code>{unconfirmed.hash}</code>
                </p>
                <p>
                  <a href="#/mine">My promises</a>
                </p>
              </>
            )}
          </RequestNotice>
        </div>
      </div>
    </div>
  );

  const hash = created === null ? null : sealBytesOf(created.hash);
  return (
    <Hero
      custom={custom}
      onCustomChange={setCustom}
      maxLength={PROMISE_FIELD_LIMIT}
      title={variant === "page" ? "New promise | SatStake" : "SatStake"}
      autoFocus={variant === "page"}
      sub={variant === "page" ? INTRO : LANDING_SUB}
      inputProps={{
        id: promiseId,
        "aria-describedby": `${promiseId}-hint ${promiseId}-error`,
        "aria-invalid": shown("promise") ? true : undefined,
        readOnly: locked,
        onBlur: () => touch("promise"),
      }}
    >
      <form id={formId} className="create-pad" aria-label="New promise" noValidate onSubmit={(event) => void submit(event)}>
        {created === null && (
          <div className="field promise-meta">
            <div id={`${promiseId}-hint`} className="hint">
              <p>{HINTS.promise}</p>
              <p>{`${promiseBytes(values.promise)} of ${MAX_PROMISE_BYTES} bytes`}</p>
            </div>
            <p id={`${promiseId}-error`} className="field-error" aria-live="polite">
              {shown("promise") ?? ""}
            </p>
          </div>
        )}
        <SignaturePad
          head={head}
          foot={foot}
          sealBytes={sealed ? hash : null}
          sealLabel={
            created === null
              ? ""
              : sealLabelOf({
                  id: created.id,
                  stake: stakeWords(network, created.token, created.amount),
                  networkName: network.name,
                  hash: created.hash,
                })
          }
          collapsing={created !== null && !collapsed}
          onCollapsed={() => setCollapsed(true)}
        />
      </form>
      {variant === "landing" && (
        <p className="home-need">You need a browser wallet on Arc with a little USDC for network fees. Reading needs none.</p>
      )}
    </Hero>
  );
}
