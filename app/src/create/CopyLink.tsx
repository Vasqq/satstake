import { useState } from "react";

/**
 * Offered on the page of a pledge the visitor has just created, so the link can be sent to the referee and
 * the beneficiary. A clipboard write has no visible effect, so the result is said in a status element that
 * is in the page before it is filled, after the button and with its height kept.
 *
 * @trace LLR-FE-037
 */
export function CopyLink({ id }: { id: bigint }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/p/${id.toString()}`);
      setResult("copied");
    } catch {
      setResult("failed");
    }
  }

  return (
    <div className="copy-link">
      <p>Your pledge is created. Send this link to your referee and your beneficiary.</p>
      <button type="button" onClick={() => void copy()}>
        Copy the link to this pledge
      </button>
      <div role="status" aria-label="Link copy status" className="copy-status">
        {result === "copied" && <p>Link copied.</p>}
        {result === "failed" && <p>Could not copy the link.</p>}
      </div>
    </div>
  );
}
