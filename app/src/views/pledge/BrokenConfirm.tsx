import { type KeyboardEvent, useEffect, useId, useRef } from "react";

export interface BrokenConfirmProps {
  /** The amount with its symbol, as the page shows it. */
  amount: string;
  /** The shortened beneficiary address. */
  beneficiary: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The step between Broken and the wallet, which cannot be taken back. It sits in the agreement under the line it
 * concerns, so the page behind it stays readable. Focus starts on Cancel so that Enter does not confirm by
 * accident, and Escape inside the step is Cancel.
 *
 * @trace LLR-FE-044
 */
export function BrokenConfirm({ amount, beneficiary, onCancel, onConfirm }: BrokenConfirmProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const ids = useId();

  useEffect(() => {
    cancel.current?.focus(); // LLR-FE-044
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onCancel(); // LLR-FE-044
  };

  return (
    <div role="group" className="broken-confirm" aria-labelledby={`${ids}-title`} aria-describedby={`${ids}-body`} onKeyDown={onKeyDown}>
      <p id={`${ids}-title`} className="broken-confirm-title">
        Mark this promise broken?
      </p>
      <p id={`${ids}-body`}>{`The stake of ${amount} will go to the beneficiary, ${beneficiary}. Your verdict cannot be changed.`}</p>
      <div className="action-buttons">
        <button type="button" className="b ghost" ref={cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="b ink" onClick={onConfirm}>
          Mark it broken
        </button>
      </div>
    </div>
  );
}
