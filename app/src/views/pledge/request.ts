import type { Hex } from "viem";
import type { ReceiptLike } from "../../create/flow";

export interface RequestIO {
  send(): Promise<Hex>;
  receipt(hash: Hex): Promise<ReceiptLike>;
  /**
   * Replays the call to find the contract's error for a mined revert, or null when it finds none. It gets the
   * receipt so the replay can be made where the transaction was mined and not against whatever state holds now.
   */
  explain(receipt: ReceiptLike): Promise<unknown>;
}

export type RequestOutcome =
  | { kind: "confirmed"; hash: Hex }
  | { kind: "reverted"; hash: Hex; error: unknown }
  | { kind: "unconfirmed"; hash: Hex; cause: unknown };

/**
 * A verdict or settlement from the wallet's hash to its receipt. A failure to send is not caught: the caller
 * has no hash yet and decides what it was (a rejection, a revert found before sending, anything else). From
 * the hash on, a failure to learn the outcome is reported as unconfirmed and never as a failure, because the
 * transaction may still be mined.
 *
 * @trace LLR-FE-046
 */
export async function runRequest(io: RequestIO, onHash: (hash: Hex) => void): Promise<RequestOutcome> {
  const hash = await io.send();
  onHash(hash); // LLR-FE-046
  let receipt: ReceiptLike;
  try {
    receipt = await io.receipt(hash);
  } catch (cause) {
    return { kind: "unconfirmed", hash, cause }; // LLR-FE-046
  }
  if (receipt.status === "success") return { kind: "confirmed", hash };
  // The receipt names no reason, so the call is replayed. A replay that cannot answer is not a second failure.
  const found = await io.explain(receipt).catch(() => null);
  return { kind: "reverted", hash, error: found ?? new Error("The transaction was mined and reverted.") }; // LLR-FE-046
}
