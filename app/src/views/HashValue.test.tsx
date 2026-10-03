import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HashValue } from "./HashValue";

const ADDRESS = "0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4";
const HASH = `0x${"ab".repeat(32)}`;
const EXPLORER = "https://explorer.example.test";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "clipboard");
});

function stubClipboard(write: (text: string) => Promise<void> = () => Promise.resolve()) {
  const writeText = vi.fn(write);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return writeText;
}

const address = (extra: Partial<Parameters<typeof HashValue>[0]> = {}) => (
  <HashValue kind="address" value={ADDRESS} explorerUrl={EXPLORER} copyNoun="the referee's address" viewNoun="the referee" {...extra} />
);
const transaction = () => (
  <HashValue kind="transaction" value={HASH} explorerUrl={EXPLORER} copyNoun="the transaction hash" viewNoun="the transaction" />
);

describe("LLR-FE-040 an address or hash with a copy control and an explorer link", () => {
  it("shows the shortened value in a monospace element whose title is the full value", () => {
    render(address());
    const shown = screen.getByText("0x3Ae2…Cac4");
    expect(shown.tagName).toBe("CODE");
    expect(shown.getAttribute("title")).toBe(ADDRESS);
    expect(screen.queryByText(ADDRESS)).toBeNull();
  });

  it("shows the whole value, in a block that wraps, when asked for the full one", () => {
    render(address({ full: true }));
    const shown = screen.getByText(ADDRESS);
    expect(shown.tagName).toBe("CODE");
    expect(shown.getAttribute("title")).toBe(ADDRESS);
    expect(shown.className).toContain("hash-full");
    expect(screen.queryByText("0x3Ae2…Cac4")).toBeNull();
  });

  it("does not use the wrapping block for the shortened value", () => {
    render(address());
    expect(screen.getByText("0x3Ae2…Cac4").className).not.toContain("hash-full");
  });

  it("has a Copy button named for what it copies, and a View on explorer link named for what it opens", () => {
    render(address());
    const copy = screen.getByRole("button", { name: "Copy the referee's address" });
    expect(copy.textContent).toBe("Copy");
    const view = screen.getByRole("link", { name: "View on explorer, the referee" });
    expect(view.textContent).toBe("View on explorer, the referee");
    expect(view.getAttribute("aria-label")).toBeNull();
    expect(view.firstChild?.textContent).toBe("View on explorer");
    expect(view.querySelector(".visually-hidden")?.textContent).toBe(", the referee");
  });

  it("names each use by its own noun, so two on one page can be told apart", () => {
    render(
      <>
        {address()}
        {address({ copyNoun: "the staker's address", viewNoun: "the staker" })}
        {transaction()}
      </>,
    );
    expect(screen.getByRole("button", { name: "Copy the referee's address" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy the staker's address" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy the transaction hash" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View on explorer, the referee" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View on explorer, the staker" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View on explorer, the transaction" })).toBeTruthy();
  });

  it("links an address to its explorer page in the same tab, without a referrer", () => {
    render(address());
    const link = screen.getByRole("link", { name: "View on explorer, the referee" });
    expect(link.getAttribute("href")).toBe(`${EXPLORER}/address/${ADDRESS}`);
    expect(link.getAttribute("target")).toBeNull();
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("links a transaction to its explorer page in a new tab, without a referrer or an opener", () => {
    render(transaction());
    const link = screen.getByRole("link", { name: "View on explorer, the transaction" });
    expect(link.getAttribute("href")).toBe(`${EXPLORER}/tx/${HASH}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("has a status element from the first render, with nothing in it", () => {
    render(address());
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
  });

  it("copies the full value, not the shortened one, and says so", async () => {
    const writeText = stubClipboard();
    render(transaction());
    fireEvent.click(screen.getByRole("button", { name: "Copy the transaction hash" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copied."));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(HASH);
  });

  it("says when the value could not be copied", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    render(address());
    fireEvent.click(screen.getByRole("button", { name: "Copy the referee's address" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Could not copy."));
  });

  it("says it could not copy when the browser has no clipboard", async () => {
    render(address());
    fireEvent.click(screen.getByRole("button", { name: "Copy the referee's address" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Could not copy."));
  });

  it("replaces an earlier result with the later one", async () => {
    let fail = true;
    stubClipboard(() => (fail ? Promise.reject(new Error("denied")) : Promise.resolve()));
    render(address());
    const copy = screen.getByRole("button", { name: "Copy the referee's address" });
    fireEvent.click(copy);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Could not copy."));
    fail = false;
    fireEvent.click(copy);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copied."));
  });

  it("keeps the status of each use to itself", async () => {
    stubClipboard();
    render(
      <>
        {address()}
        {transaction()}
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy the transaction hash" }));
    await waitFor(() => expect(screen.getAllByRole("status")[1]?.textContent).toBe("Copied."));
    expect(screen.getAllByRole("status")[0]?.textContent).toBe("");
  });
});
