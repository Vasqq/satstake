import { act, cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRequestError } from "viem";
import { freshChain, mountApp, network, teardownWallets } from "../test/walletHarness";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  teardownWallets();
});

const home = (chain = freshChain()) => mountApp({ hash: "#/", chain });
const linkTo = (href: string) => [...document.querySelectorAll("a")].find((a) => a.getAttribute("href") === href);

// The words and layout of the landing page are Liam's (05 v1.27): these tests find things by what they do,
// not by what they say.
describe("LLR-FE-070 the calls to action", () => {
  it("links to the create form and to the configured example pledge", () => {
    home();
    expect(linkTo("#/create")).toBeTruthy();
    expect(linkTo(`#/p/${network.examplePledgeId}`)).toBeTruthy();
  });
});

describe("LLR-FE-070 the evidence that it is live", () => {
  it("names the network and its chain", () => {
    home();
    expect(document.body.textContent).toContain(network.name);
    expect(document.body.textContent).toContain(String(network.chainId));
  });

  it("shows the whole contract address with a copy control and an explorer link", () => {
    home();
    const address = [...document.querySelectorAll("code")].find((c) => c.textContent === network.contract);
    expect(address).toBeTruthy();
    const holder = address!.closest("dd, li, div, p") as HTMLElement;
    expect(within(holder).getAllByRole("button").length).toBeGreaterThan(0);
    expect(linkTo(`${network.explorerUrl}/address/${network.contract}`)).toBeTruthy();
  });

  it("links to the verified source on Sourcify", () => {
    home();
    expect(linkTo(`https://repo.sourcify.dev/${network.chainId}/${network.contract}`)).toBeTruthy();
  });

  it("shows the live pledge count after saying it is reading", async () => {
    const chain = freshChain();
    chain.addPledge(2n);
    let open = () => {};
    chain.gate = new Promise<void>((resolve) => (open = resolve));
    home(chain);
    expect(await screen.findByText("Reading")).toBeTruthy();
    expect(screen.getByText("Pledges created")).toBeTruthy();
    await act(async () => open());
    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.queryByText("Reading")).toBeNull();
    expect(chain.count("eth_call", "pledgeCount")).toBe(1);
  });

  it("shows a count of zero as 0, not as still reading", async () => {
    const chain = freshChain();
    chain.pledges.clear();
    home(chain);
    expect(await screen.findByText("0")).toBeTruthy();
    expect(screen.queryByText("Reading")).toBeNull();
  });

  it("says the count is not available when the read fails, and tries again every 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chain = freshChain();
    chain.callError = new HttpRequestError({ url: "https://rpc.example" });
    home(chain);
    expect(await screen.findByText("Not available right now")).toBeTruthy();
    // A failed call is never decoded, so it is counted by method, not by function name.
    const before = chain.count("eth_call");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(chain.count("eth_call")).toBe(before);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_500);
    });
    expect(chain.count("eth_call")).toBeGreaterThan(before);
    chain.callError = undefined;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(await screen.findByText("1")).toBeTruthy();
    expect(screen.queryByText("Not available right now")).toBeNull();
  });

  it("stops asking once the count is known", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const chain = freshChain();
    home(chain);
    await screen.findByText("1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(chain.count("eth_call", "pledgeCount")).toBe(1);
  });

  it("reads no logs", async () => {
    const chain = freshChain();
    home(chain);
    await screen.findByText("1");
    expect(chain.count("eth_getLogs")).toBe(0);
  });
});
