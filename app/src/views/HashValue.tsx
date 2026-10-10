import { useState } from "react";
import { shorten } from "../format";

export interface HashValueProps {
  kind: "address" | "transaction";
  value: string;
  explorerUrl: string;
  /** What the Copy button copies, for its accessible name: "the referee's address" gives "Copy the referee's address". */
  copyNoun: string;
  /** What the explorer link opens: "the referee" gives "View on explorer, the referee". The visible text stays first so a voice command matches it (WCAG 2.5.3). */
  viewNoun: string;
  /** Show the whole value in a block that wraps, for a place where a visitor compares it with a published one. */
  full?: boolean;
  /** A few words that follow the value on its own line, before the controls, such as what the party does. */
  note?: string;
}

/**
 * An address or transaction hash with a copy control and an explorer link. A clipboard write has no visible
 * effect, so its result is said in a status element that is in the page before it is filled. Several of these
 * sit on one page, so each button and link carries its own accessible name.
 *
 * @trace LLR-FE-040
 */
export function HashValue({ kind, value, explorerUrl, copyNoun, viewNoun, full = false, note }: HashValueProps) {
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
      <span className="hash-line">
        <code className={full ? "hash-text hash-full" : "hash-text"} title={value}>
          {full ? value : shorten(value)}
        </code>
        {/* The dot is bound to the value by a no-break space, so a line that wraps never begins with it. */}
        {note !== undefined && note !== "" && <span className="hash-note">{`\u00a0· ${note}`}</span>}
      </span>
      <span className="hash-controls">
        <button type="button" aria-label={`Copy ${copyNoun}`} onClick={() => void copy()}>
          Copy
        </button>
        {/* A transaction opens in a new tab so a request still in progress on this page is not lost. */}
        <a
          href={`${explorerUrl}/${isTransaction ? "tx" : "address"}/${value}`} // LLR-FE-040
          target={isTransaction ? "_blank" : undefined}
          rel={isTransaction ? "noopener noreferrer" : "noreferrer"}
        >
          View on explorer<span className="visually-hidden">, {viewNoun}</span>
        </a>
      </span>
      <span role="status" className="hash-status">
        {result === "copied" && "Copied."}
        {result === "failed" && "Could not copy."}
      </span>
    </span>
  );
}
