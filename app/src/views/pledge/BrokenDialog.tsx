import { useEffect, useId, useRef } from "react";

export interface BrokenDialogProps {
  open: boolean;
  /** The amount with its symbol, as the page shows it. */
  amount: string;
  /** The shortened beneficiary address. */
  beneficiary: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The confirmation before a Broken verdict, which cannot be taken back. A native modal dialog gives the focus
 * trap and the inert page behind it. Focus starts on Cancel so that Enter does not confirm by accident. Escape
 * is routed to `onCancel` so focus goes back to the control that opened it in code, not by browser habit.
 *
 * @trace LLR-FE-044
 */
export function BrokenDialog({ open, amount, beneficiary, onCancel, onConfirm }: BrokenDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const ids = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.hasAttribute("open")) {
      element.showModal();
      cancel.current?.focus(); // LLR-FE-044
    } else if (!open && element.hasAttribute("open")) {
      element.close();
    }
  }, [open]);

  // The dialog is closed before the caller moves focus, since the page behind an open modal is inert and
  // would refuse it.
  const closeThen = (next: () => void) => () => {
    dialog.current?.close();
    next();
  };

  return (
    <dialog
      ref={dialog}
      className="broken-dialog"
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-body`}
      onCancel={(event) => {
        event.preventDefault();
        closeThen(onCancel)(); // LLR-FE-044
      }}
    >
      <h2 id={`${ids}-title`}>Mark this promise broken?</h2>
      <p id={`${ids}-body`}>
        {`The stake of ${amount} will go to the beneficiary, ${beneficiary}. Your verdict cannot be changed.`}
      </p>
      <div className="dialog-actions">
        <button type="button" ref={cancel} onClick={closeThen(onCancel)}>
          Cancel
        </button>
        <button type="button" className="button-primary" onClick={closeThen(onConfirm)}>
          Mark it broken
        </button>
      </div>
    </dialog>
  );
}
