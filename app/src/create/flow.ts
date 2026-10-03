import { type Address, type Hex, type PublicClient, decodeEventLog } from "viem";
import { satStakeAbi } from "../abi";
import { type CustomCheck, checkCustomDeadline, presetDeadline } from "./deadline";

export type Stage = "wallet" | "confirming" | "done";
export type StepId = "approve" | "create";
export interface Step {
  id: StepId;
  stage: Stage | "waiting";
}
export interface ReceiptLike {
  status: "success" | "reverted";
  logs: readonly { address: string; topics: readonly Hex[]; data: Hex }[];
}
export interface FlowIO {
  contract: Address;
  allowance(): Promise<bigint>;
  approve(amount: bigint): Promise<Hex>;
  create(deadline: bigint): Promise<Hex>;
  receipt(hash: Hex): Promise<ReceiptLike>;
  /** A fresh reading of chain time, for a preset deadline. */
  chainTime(): Promise<bigint>;
  /** The page's own estimate of chain time right now, which needs no request, for judging a custom deadline. */
  clockNow(): bigint | null;
}
export interface CreateInput {
  amount: bigint;
  deadline: { kind: "preset"; seconds: bigint } | { kind: "custom"; timestamp: bigint };
}

/** How long a receipt is waited for before the creation is reported as sent and unconfirmed (LLR-FE-033). */
export const RECEIPT_TIMEOUT_MS = 180_000;
/** Arc makes about two blocks a second, so the client's 4 s default would leave each step seconds behind the chain. */
export const RECEIPT_POLL_MS = 1_000;

/**
 * The receipt of a transaction the wallet has just returned the hash of. viem's wait follows a transaction the
 * wallet replaces (a speed-up or a cancel), which the hash the wallet returned would never show, and stops
 * after the timeout instead of waiting for ever.
 *
 * @trace LLR-FE-033
 */
export function receiptOf(client: PublicClient, hash: Hex): Promise<ReceiptLike> {
  return client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS, pollingInterval: RECEIPT_POLL_MS }); // LLR-FE-033
}

/**
 * The wallet returned a hash for `createPledge` but no usable receipt came back. The transaction may still be
 * mined, so the caller must not offer a second creation.
 *
 * @trace LLR-FE-062
 */
export class CreationUnconfirmedError extends Error {
  readonly hash: Hex;

  constructor(hash: Hex, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(`The creation was sent as ${hash}, but its receipt could not be used: ${reason}`, { cause });
    this.name = "CreationUnconfirmedError";
    this.hash = hash;
  }
}

/**
 * The identifier is read from the PledgeCreated event of the receipt, from the contract's own address, and
 * never from a pledge count: another pledge may be created between the creation and the read.
 *
 * @trace LLR-FE-037
 */
export function pledgeIdFromReceipt(receipt: ReceiptLike, contract: Address): bigint {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contract.toLowerCase()) continue; // LLR-FE-037
    try {
      const event = decodeEventLog({
        abi: satStakeAbi,
        eventName: "PledgeCreated",
        topics: log.topics as [Hex, ...Hex[]],
        data: log.data,
      });
      const id = (event.args as { id?: unknown } | undefined)?.id;
      if (typeof id === "bigint") return id; // LLR-FE-037
    } catch {
      // Any other event of the contract has a different signature, which is not an error here.
    }
  }
  throw new Error("The creation receipt holds no PledgeCreated event from the SatStake contract.");
}

/**
 * A custom deadline failed the check made when submit was activated or just before the creation was sent. No
 * request was sent for the creation it stopped.
 *
 * @trace LLR-FE-031
 */
export class DeadlineCheckError extends Error {
  readonly check: Exclude<CustomCheck, "ok">;

  constructor(check: Exclude<CustomCheck, "ok">) {
    super(`The custom deadline failed its check (${check}), so the creation was not sent.`);
    this.name = "DeadlineCheckError";
    this.check = check;
  }
}

// Time passes while a person reads the page and while an approval confirms, so a custom deadline that was in
// range when the form was last drawn may not be now.
function assertDeadlineInRange(io: FlowIO, input: CreateInput): void {
  if (input.deadline.kind !== "custom") return;
  const check = checkCustomDeadline(input.deadline.timestamp, io.clockNow());
  if (check !== "ok") throw new DeadlineCheckError(check); // LLR-FE-031
}

const progressOf = (approve: Stage | null, create: Stage | "waiting"): Step[] =>
  approve === null
    ? [{ id: "create", stage: create }]
    : [
        { id: "approve", stage: approve },
        { id: "create", stage: create },
      ];

/**
 * Approval of exactly the amount when the allowance is short, then the creation. The allowance is read on
 * every run, so a retry after a refused or failed creation skips an approval that still stands.
 *
 * @trace LLR-FE-031 LLR-FE-033 LLR-FE-062
 */
export async function runCreate(io: FlowIO, input: CreateInput, onProgress: (steps: Step[]) => void): Promise<bigint> {
  assertDeadlineInRange(io, input); // LLR-FE-031
  const approving = (await io.allowance()) < input.amount; // LLR-FE-033
  if (approving) {
    onProgress(progressOf("wallet", "waiting"));
    const approval = await io.approve(input.amount); // LLR-FE-033
    onProgress(progressOf("confirming", "waiting"));
    if ((await io.receipt(approval)).status !== "success") throw new Error("The approval transaction was mined and reverted.");
    onProgress(progressOf("done", "wallet"));
  } else {
    onProgress(progressOf(null, "wallet"));
  }

  // Read after any approval has confirmed, so the time the approval took is not taken out of a preset.
  assertDeadlineInRange(io, input); // LLR-FE-031
  const deadline =
    input.deadline.kind === "preset" ? presetDeadline(await io.chainTime(), input.deadline.seconds) : input.deadline.timestamp; // LLR-FE-031
  const creation = await io.create(deadline);
  onProgress(progressOf(approving ? "done" : null, "confirming"));
  // From here the wallet has sent the transaction, so a failure to learn its outcome is not a failure of it.
  let receipt: ReceiptLike;
  try {
    receipt = await io.receipt(creation);
  } catch (cause) {
    throw new CreationUnconfirmedError(creation, cause); // LLR-FE-062
  }
  if (receipt.status !== "success") throw new Error("The creation transaction was mined and reverted.");
  let id: bigint;
  try {
    id = pledgeIdFromReceipt(receipt, io.contract);
  } catch (cause) {
    throw new CreationUnconfirmedError(creation, cause); // LLR-FE-062
  }
  onProgress(progressOf(approving ? "done" : null, "done"));
  return id;
}
