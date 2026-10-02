import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeWallet, walletError } from "./test/fakeWallet";
import { ACCOUNT, FOREIGN_CHAIN, OTHER_ACCOUNT, findConnected, mountApp, network, teardownWallets } from "./test/walletHarness";

afterEach(teardownWallets);

// What the application may ask a wallet for: account access, a chain query, a network switch or add, and
// sending a transaction. Nothing calls disconnect(), so revoking a permission is not on the list.
const ALLOWED = new Set([
  "eth_requestAccounts",
  "eth_accounts",
  "eth_chainId",
  "wallet_requestPermissions",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "eth_sendTransaction",
]);

const SIGNING_NAMES = [
  "signMessage",
  "signTypedData",
  "signTransaction",
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTransaction",
  "signAuthorization",
  "wallet_grantPermissions",
];

/** Case-insensitive and not tied to a call, so a string literal, a comment, or a hook name is found too. */
function findSigningApis(source: string): string[] {
  const lower = source.toLowerCase();
  return SIGNING_NAMES.filter((name) => lower.includes(name.toLowerCase()));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx|css|html)$/.test(name) && !/\.test\.[a-z]+$/.test(name) ? [path] : [];
  });
}

const srcDir = import.meta.dirname;

describe("LLR-FE-074 the application never asks a wallet to sign a message or typed data (the requests a wallet is sent)", () => {
  async function drive() {
    // Scenarios chosen so the application runs every wallet path it has: silent reconnect, connect through
    // permissions, connect through eth_requestAccounts, the window.ethereum fallback, a switch, an add, and
    // an account change.
    const fresh = (over: Partial<ConstructorParameters<typeof FakeWallet>[0]> = {}) =>
      new FakeWallet({ chainId: network.chainId, accounts: [ACCOUNT], ...over });
    const wallets: FakeWallet[] = [];
    const track = (w: FakeWallet) => {
      wallets.push(w);
      return w;
    };

    // 1. A wallet that already trusts the site, on another chain that it knows of: reconnect, then switch.
    const reconnecting = track(fresh({ chainId: FOREIGN_CHAIN, authorized: true }));
    reconnecting.knownChains.add(network.chainId);
    mountApp({ wallets: [{ wallet: reconnecting, name: "Alpha Wallet", rdns: "test.alpha" }] });
    await findConnected(ACCOUNT);
    fireEvent.click(await screen.findByRole("button", { name: `Switch to ${network.name}` }));
    await waitFor(() => expect(screen.queryByText(/another network/)).toBeNull());
    act(() => reconnecting.changeAccounts([OTHER_ACCOUNT]));
    await findConnected(OTHER_ACCOUNT);
    teardownWallets();

    // 2. A wallet the user connects, on a chain it has never heard of: switch refused with 4902, then add.
    const connecting = track(fresh({ chainId: FOREIGN_CHAIN }));
    mountApp({ wallets: [{ wallet: connecting, name: "Alpha Wallet", rdns: "test.alpha" }] });
    fireEvent.click(await screen.findByRole("button", { name: "Connect Alpha Wallet" }));
    await findConnected(ACCOUNT);
    fireEvent.click(await screen.findByRole("button", { name: `Switch to ${network.name}` }));
    await waitFor(() => expect(screen.queryByText(/another network/)).toBeNull());
    act(() => connecting.changeAccounts([]));
    await screen.findByRole("button", { name: "Connect Alpha Wallet" });
    teardownWallets();

    // 3. A wallet with no permissions method, so connecting falls through to eth_requestAccounts.
    const legacy = track(fresh());
    legacy.failNext("wallet_requestPermissions", walletError(4200, "unsupported"));
    mountApp({ wallets: [{ wallet: legacy, name: "Alpha Wallet", rdns: "test.alpha" }] });
    fireEvent.click(await screen.findByRole("button", { name: "Connect Alpha Wallet" }));
    await findConnected(ACCOUNT);
    teardownWallets();

    // 4. A wallet found only at window.ethereum.
    const injected = track(fresh());
    mountApp({ windowEthereum: injected });
    fireEvent.click(await screen.findByRole("button", { name: "Connect browser wallet" }));
    await findConnected(ACCOUNT);

    return wallets;
  }

  it("sends only account access, chain queries, network switch or add, and transactions, across every wallet path", async () => {
    const wallets = await drive();
    const seen = new Set(wallets.flatMap((w) => w.methods()));
    const outside = [...seen].filter((m) => !ALLOWED.has(m));
    expect(outside).toEqual([]);
    // The run is only evidence if it reached each of the paths it names.
    for (const required of [
      "eth_accounts",
      "eth_chainId",
      "wallet_requestPermissions",
      "eth_requestAccounts",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain",
    ]) {
      expect(seen.has(required), required).toBe(true);
    }
  });

  it("the permitted list itself holds no signing method", () => {
    expect(findSigningApis([...ALLOWED].join(" "))).toEqual([]);
  });
});

describe("LLR-FE-074 no file of the application names a signing API, as a call, a hook, or a string", () => {
  const files = sourceFiles(srcDir);

  it("scans the application's files, and not only a few", () => {
    const names = files.map((f) => relative(srcDir, f));
    expect(names).toContain("App.tsx");
    expect(names).toContain(join("wallet", "WalletBar.tsx"));
    expect(names).toContain(join("chain", "wagmi.ts"));
    expect(names.some((n) => /\.test\./.test(n))).toBe(false);
  });

  it("finds none in any of them", () => {
    const found = files.flatMap((f) => findSigningApis(readFileSync(f, "utf8")).map((name) => `${relative(srcDir, f)}: ${name}`));
    expect(found).toEqual([]);
  });

  it.each([
    ["a method call", "await walletClient.signMessage({ message })", ["signMessage"]],
    ["typed data", "client.signTypedData(args)", ["signTypedData"]],
    ["a transaction signature", "const raw = await account.signTransaction(tx)", ["signTransaction"]],
    ["a wagmi hook", "const { mutate } = useSignMessage()", ["signMessage"]],
    ["a wagmi typed-data hook", "useSignTypedData()", ["signTypedData"]],
    ["a wagmi transaction hook", "useSignTransaction()", ["signTransaction"]],
    ["an action import", 'import { signMessage } from "wagmi/actions";', ["signMessage"]],
    ["a string literal in double quotes", 'provider.request({ method: "personal_sign", params })', ["personal_sign"]],
    ["a string literal in single quotes", "provider.request({ method: 'eth_signTypedData_v4' })", ["eth_sign", "eth_signTypedData", "signTypedData"]],
    ["a template literal", "request({ method: `eth_sign` })", ["eth_sign"]],
    ["the transaction form of the raw method", 'request({ method: "eth_signTransaction" })', ["eth_sign", "eth_signTransaction", "signTransaction"]],
    ["a different letter case", "PERSONAL_SIGN", ["personal_sign"]],
    ["an EIP-7702 authorization", "await client.signAuthorization({ contractAddress })", ["signAuthorization"]],
    ["a permission grant", 'request({ method: "wallet_grantPermissions", params })', ["wallet_grantPermissions"]],
  ])("finds %s", (_label, source, expected) => {
    expect(findSigningApis(source).sort()).toEqual([...expected].sort());
  });

  it("does not take unrelated words for signing", () => {
    expect(findSigningApis("design a signature field; assign it; designated")).toEqual([]);
    expect(findSigningApis('request({ method: "eth_sendTransaction" })')).toEqual([]);
  });
});
