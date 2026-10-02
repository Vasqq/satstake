import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BaseError, UserRejectedRequestError } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAILED_MESSAGE, REJECTED_MESSAGE, RequestNotice, isUserRejection, rawErrorText } from "./failure";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
});

const coded = (code: number, cause?: unknown) => Object.assign(new Error(`code ${code}`), { code, cause });

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
}

describe("LLR-FE-061 a wallet rejection is recognised wherever code 4001 sits in the error's cause chain", () => {
  it("recognises a plain wallet error and a viem UserRejectedRequestError", () => {
    expect(isUserRejection(coded(4001))).toBe(true);
    expect(isUserRejection(new UserRejectedRequestError(new Error("no")))).toBe(true);
  });

  it("recognises 4001 at the first, middle, and last link of a chain when no link below it has a code", () => {
    expect(isUserRejection(coded(4001, new Error("x")))).toBe(true);
    expect(isUserRejection(coded(-32603, coded(4001, new Error("x"))))).toBe(true);
    expect(isUserRejection(new Error("outer", { cause: new BaseError("mid", { cause: coded(4001) }) }))).toBe(true);
  });

  it("decides by the innermost link that carries a numeric code, since wagmi wraps failures as rejections", () => {
    // wagmi wraps every failure of wallet_addEthereumChain in UserRejectedRequestError (4001).
    expect(isUserRejection(new UserRejectedRequestError(coded(-32602)))).toBe(false);
    expect(isUserRejection(coded(4001, coded(-32603)))).toBe(false);
    expect(isUserRejection(new UserRejectedRequestError(new UserRejectedRequestError(new Error("x"))))).toBe(true);
    expect(isUserRejection(coded(-32602, coded(4001)))).toBe(true);
    expect(isUserRejection(coded(4001, Object.assign(new Error("odd"), { code: "x" })))).toBe(true);
    expect(isUserRejection(new UserRejectedRequestError(new Error("User rejected switch after adding network.")))).toBe(true);
  });

  it("recognises a rejection inside a viem BaseError chain", () => {
    expect(isUserRejection(new BaseError("could not connect", { cause: new UserRejectedRequestError(coded(4001)) }))).toBe(true);
  });

  it("does not take any other code, or no code, for a rejection", () => {
    for (const code of [4000, 4002, 4100, 4200, 4900, 4902, -32603, 0]) {
      expect(isUserRejection(coded(code)), String(code)).toBe(false);
    }
    expect(isUserRejection(new Error("plain"))).toBe(false);
    expect(isUserRejection(new Error("x", { cause: new Error("y") }))).toBe(false);
  });

  it("does not take the text or the string form of 4001 for the code", () => {
    expect(isUserRejection({ code: "4001" })).toBe(false);
    expect(isUserRejection({ message: "code 4001" })).toBe(false);
    expect(isUserRejection("4001")).toBe(false);
  });

  it("answers false for a value that is not an object, and stops on a cause chain that loops", () => {
    for (const value of [null, undefined, 4001, true]) expect(isUserRejection(value), String(value)).toBe(false);
    const a: { code: number; cause?: unknown } = { code: 1 };
    const b: { code: number; cause?: unknown } = { code: 2, cause: a };
    a.cause = b;
    expect(isUserRejection(a)).toBe(false);
  });
});

describe("LLR-FE-061 a rejection shows the neutral message in section 2.2 and no error styling", () => {
  it("shows exactly the section 2.2 wording for a rejection", () => {
    render(<RequestNotice error={coded(4001)} label="Notices" />);
    expect(REJECTED_MESSAGE).toBe("You cancelled the request in your wallet. Nothing was sent.");
    expect(screen.getByRole("status", { name: "Notices" }).textContent).toBe(REJECTED_MESSAGE);
  });

  it("has no alert role and no class that names an error or a failure", () => {
    const { container } = render(<RequestNotice error={new UserRejectedRequestError(new Error("no"))} label="Notices" />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("[role=alert]")).toBeNull();
    for (const element of container.querySelectorAll("*")) {
      expect(element.className.toString(), element.outerHTML).not.toMatch(/error|fail|danger|warn/i);
    }
  });

  it("offers no copy control for a rejection, since nothing went wrong", () => {
    render(<RequestNotice error={coded(4001)} label="Notices" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("LLR-FE-062 any other failure shows a plain message and a control to copy the raw error", () => {
  it("shows the wording of LLR-FE-062 and a copy button for an error that is not a rejection", () => {
    render(<RequestNotice error={coded(-32603)} label="Notices" />);
    expect(FAILED_MESSAGE).toBe("Something went wrong. Nothing was changed.");
    expect(screen.getByRole("status", { name: "Notices" }).textContent).toContain(FAILED_MESSAGE);
    expect(screen.getByRole("button", { name: "Copy the error" }).tagName).toBe("BUTTON");
    expect(screen.getByRole("status", { name: "Notices" }).textContent).not.toContain(REJECTED_MESSAGE);
  });

  it("keeps the copy button outside the live region, so it is not read as part of the message", async () => {
    stubClipboard(async () => {});
    render(<RequestNotice error={new Error("boom")} label="Notices" />);
    const status = screen.getByRole("status", { name: "Notices" });
    const button = screen.getByRole("button", { name: "Copy the error" });
    expect(status.contains(button)).toBe(false);
    expect(status.textContent).not.toContain("Copy the error");
    expect(button.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(status.textContent).toContain("Copied."));
  });

  it("shows a failure that is not an Error object the same way", () => {
    render(<RequestNotice error={{ code: -32000, message: "insufficient funds" }} label="Notices" />);
    expect(screen.getByRole("status").textContent).toContain(FAILED_MESSAGE);
  });

  it("marks the failure with the error style, which a rejection never gets", () => {
    const { container } = render(<RequestNotice error={new Error("boom")} label="Notices" />);
    expect(container.querySelector("[class*=error], [class*=failure]")).not.toBeNull();
  });

  it("copies the raw error text, and says so", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    stubClipboard(writeText);
    render(<RequestNotice error={new Error("boom")} label="Notices" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Copied."));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("Error: boom");
  });

  it("copies every cause, not only the outermost message", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    stubClipboard(writeText);
    render(<RequestNotice error={new Error("outer", { cause: coded(-32000) })} label="Notices" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("Error: outer\nCaused by: Error: code -32000 (code -32000)");
  });

  it("says when the browser refused the copy, and does not claim a copy was made", async () => {
    stubClipboard(async () => {
      throw new Error("denied");
    });
    render(<RequestNotice error={new Error("boom")} label="Notices" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Could not copy."));
    expect(screen.getByRole("status").textContent).not.toContain("Copied.");
  });

  it("says nothing about copying again for a different error", async () => {
    stubClipboard(async () => {});
    const { rerender } = render(<RequestNotice error={new Error("one")} label="Notices" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Copied."));
    rerender(<RequestNotice error={new Error("two")} label="Notices" />);
    expect(screen.getByRole("status").textContent).not.toContain("Copied.");
  });

  it("shows nothing for no error, whether it is null or undefined", () => {
    const { rerender } = render(<RequestNotice error={null} label="Notices" />);
    expect(screen.getByRole("status").textContent).toBe("");
    rerender(<RequestNotice error={undefined} label="Notices" />);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says Could not copy when the browser has no clipboard at all", async () => {
    render(<RequestNotice error={new Error("boom")} label="Notices" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy the error" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Could not copy."));
  });

  it("keeps one status container mounted whether or not there is an error, so a change is announced", () => {
    const { rerender } = render(<RequestNotice error={null} label="Notices" />);
    const box = screen.getByRole("status", { name: "Notices" });
    expect(box.textContent).toBe("");
    rerender(<RequestNotice error={new Error("boom")} label="Notices" />);
    expect(screen.getByRole("status", { name: "Notices" })).toBe(box);
    expect(box.textContent).toContain(FAILED_MESSAGE);
    rerender(<RequestNotice error={coded(4001)} label="Notices" />);
    expect(screen.getByRole("status", { name: "Notices" })).toBe(box);
    expect(box.textContent).toContain(REJECTED_MESSAGE);
    rerender(<RequestNotice error={null} label="Notices" />);
    expect(box.textContent).toBe("");
  });
});

describe("LLR-FE-062 the raw error text carries the message and every cause", () => {
  it("names the error and its message", () => {
    expect(rawErrorText(new TypeError("bad input"))).toBe("TypeError: bad input");
  });

  it("adds the numeric code a wallet set, since the message rarely carries it", () => {
    expect(rawErrorText(coded(-32603))).toBe("Error: code -32603 (code -32603)");
    expect(rawErrorText(Object.assign(new Error("odd"), { code: "x" }))).toBe("Error: odd");
  });

  it("appends each cause on its own line, outermost first", () => {
    const error = new Error("outer", { cause: new Error("middle", { cause: new RangeError("inner") }) });
    expect(rawErrorText(error)).toBe("Error: outer\nCaused by: Error: middle\nCaused by: RangeError: inner");
  });

  it("stops on a cause chain that loops", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    Object.defineProperty(a, "cause", { value: b });
    expect(rawErrorText(a)).toBe("Error: a\nCaused by: Error: b");
  });

  it("writes a wallet's plain error object as JSON, and a string as itself", () => {
    expect(rawErrorText({ code: -32000, message: "insufficient funds" })).toBe('{"code":-32000,"message":"insufficient funds"}');
    expect(rawErrorText("it broke")).toBe("it broke");
    expect(rawErrorText(undefined)).toBe("undefined");
  });

  it("falls back to the string form for a value JSON cannot write", () => {
    const loop: { self?: unknown } = {};
    loop.self = loop;
    expect(rawErrorText(loop)).toBe("[object Object]");
    expect(rawErrorText(10n)).toBe("10");
  });
});
