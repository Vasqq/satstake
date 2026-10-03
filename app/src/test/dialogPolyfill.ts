/**
 * jsdom has no modal dialog. This gives `HTMLDialogElement` the behaviours the pledge page relies on: `showModal`
 * sets `open` and marks the dialog modal, `close` clears it and fires `close`, and while a modal is open `focus()`
 * on anything outside it does nothing, as in a browser, where the rest of the page is inert. There is no focus
 * trap, backdrop, or Escape key.
 */
export function installDialogPolyfill(): void {
  const proto = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.dataset.modal = "true";
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    delete this.dataset.modal;
    this.dispatchEvent(new Event("close"));
  };
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function inertAwareFocus(this: HTMLElement, options?: FocusOptions) {
    const modal = document.querySelector("dialog[data-modal]");
    if (modal !== null && !modal.contains(this)) return;
    focus.call(this, options);
  };
}
