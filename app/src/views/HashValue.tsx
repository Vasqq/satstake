import { useState } from "react";
import { shorten } from "../format";

export interface HashValueProps {
  kind: "address" | "transaction";
  value: string;
  explorerUrl: string;
  /** What the Copy button copies, for its accessible name: "the referee's address" gives "Copy the referee's address". */
  copyNoun: string;
  /** What the explorer link opens: "the referee" gives "View the referee on the explorer". */
  viewNoun: string;
  /** Show the whole value in a block that wraps, for a place where a visitor compares it with a published one. */
  full?: boolean;
}

/**
 * An address or transaction hash with a copy control and an explorer link. A clipboard write has no visible
 * effect, so its result is said in a status element that is in the page before it is filled. Several of these
 * sit on one page, so each button and link carries its own accessible name.
 *
 * @trace LLR-FE-040
 */
export function HashValue({ kind, value, explorerUrl, copyNoun, viewNoun, full = false }: HashValueProps) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }

  const isTransaction = kind === "transaction";
  return (
    <span className="hash-value">
      <code className={full ? "hash-text hash-full" : "hash-text"} title={value}>
        {full ? value : shorten(value)}
      </code>
      <span className="hash-controls">
        <button type="button" aria-label={`Copy ${copyNoun}`} onClick={() => void copy()}>
          Copy
        </button>
        {/* A transaction opens in a new tab so a request still in progress on this page is not lost. */}
        <a
          href={`${explorerUrl}/${isTransaction ? "tx" : "address"}/${value}`} // LLR-FE-040
          target={isTransaction ? "_blank" : undefined}
          rel={isTransaction ? "noopener noreferrer" : "noreferrer"}
          aria-label={`View ${viewNoun} on the explorer`}
        >
          View on explorer
        </a>
      </span>
      <span role="status" className="hash-status">
        {result === "copied" && "Copied."}
        {result === "failed" && "Could not copy."}
      </span>
    </span>
  );
}
