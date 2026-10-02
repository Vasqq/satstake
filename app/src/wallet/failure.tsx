import { useState } from "react";

/** The wording of 05 section 2.2 for a wallet rejection (4001). */
export const REJECTED_MESSAGE = "You cancelled the request in your wallet. Nothing was sent.";

/** The wording of LLR-FE-062. */
export const FAILED_MESSAGE = "Something went wrong. Nothing was changed.";

const USER_REJECTED = 4001;

const causeOf = (value: unknown): unknown =>
  typeof value === "object" && value !== null ? (value as { cause?: unknown }).cause : undefined;

// The error, then its cause, then that cause's cause. wagmi and viem wrap what a wallet throws, so the code a
// wallet set is often several links down. A loop in the chain ends the walk instead of the page.
function chainOf(error: unknown): unknown[] {
  const chain = [error];
  for (let next = causeOf(error); next !== undefined && !chain.includes(next); next = causeOf(next)) chain.push(next);
  return chain;
}

/**
 * A rejection is decided by the innermost link that carries a numeric code. wagmi wraps every failure of
 * wallet_addEthereumChain in UserRejectedRequestError (4001), so an outer 4001 says nothing about what the
 * wallet answered; the code at the bottom is the wallet's own.
 *
 * @trace LLR-FE-061
 */
export function isUserRejection(error: unknown): boolean {
  const codes = chainOf(error)
    .map((link) => (typeof link === "object" && link !== null ? (link as { code?: unknown }).code : undefined))
    .filter((code): code is number => typeof code === "number");
  return codes.at(-1) === USER_REJECTED; // LLR-FE-061
}

function describeLink(value: unknown): string {
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return `${value.name}: ${value.message}${typeof code === "number" ? ` (code ${code})` : ""}`;
  }
  if (typeof value === "string") return value;
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string") return json;
  } catch {
    // A loop or a bigint has no JSON form; the string form below is the best that remains.
  }
  return String(value);
}

/**
 * The error as text for a bug report. It carries every cause, because the outermost error is usually a
 * wrapper whose message hides what the wallet or the node actually said.
 *
 * @trace LLR-FE-062
 */
export function rawErrorText(error: unknown): string {
  return chainOf(error).map(describeLink).join("\nCaused by: "); // LLR-FE-062
}

/**
 * Shows what became of a request to the wallet. The status container is always in the page, so a message
 * that fills it later is announced. A null error shows nothing. The copy button sits after the container,
 * so a screen reader does not read it as part of the message.
 *
 * @trace LLR-FE-061 LLR-FE-062
 */
export function RequestNotice({ error, label }: { error: unknown; label: string }) {
  const [copy, setCopy] = useState<{ error: unknown; result: "copied" | "failed" } | null>(null);
  const shown = error !== null && error !== undefined;
  const failed = shown && !isUserRejection(error);

  async function copyError() {
    try {
      await navigator.clipboard.writeText(rawErrorText(error));
      setCopy({ error, result: "copied" });
    } catch {
      setCopy({ error, result: "failed" });
    }
  }

  return (
    <div className="notice-area">
      <div role="status" aria-label={label}>
        {shown && !failed && <p className="notice">{REJECTED_MESSAGE}</p>}
        {failed && <p className="notice notice-failure">{FAILED_MESSAGE}</p>}
        {/* The result belongs to the error it was made for, so a newer error starts without it. */}
        {failed && copy?.error === error && <p>{copy.result === "copied" ? "Copied." : "Could not copy."}</p>}
      </div>
      {failed && (
        <button type="button" onClick={() => void copyError()}>
          Copy the error
        </button>
      )}
    </div>
  );
}
