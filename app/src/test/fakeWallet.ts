import { type Address, hexToNumber, numberToHex } from "viem";

export interface WalletRequest {
  method: string;
  params?: unknown;
}

/** The transaction object of an eth_sendTransaction request. */
export interface SentTransaction {
  from: Address;
  to: Address;
  data: `0x${string}`;
}

type Listener = (...args: unknown[]) => void;

export interface AnnouncedInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

/** An error as a wallet throws it: a plain Error with an EIP-1193 numeric code. */
export function walletError(code: number, message: string): Error & { code: number } {
  return Object.assign(new Error(message), { code });
}

export const rejection = () => walletError(4001, "User rejected the request.");

/** A 1x1 transparent GIF, standing in for the data: URI every real wallet announces as its icon. */
const ICON = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * An EIP-1193 provider that answers from memory and records every request it receives. Methods it does not
 * know fail with 4200, the code a real wallet uses, so a request the application should never make shows up
 * as both a record and an error.
 */
export class FakeWallet {
  chainId: number;
  accounts: Address[];
  /** Whether the site already holds permission, so eth_accounts answers with no prompt. */
  authorized: boolean;
  knownChains = new Set<number>();
  requests: WalletRequest[] = [];
  /**
   * What the wallet does with a transaction it is asked to send: returns the hash it would show the user.
   * Unset, eth_sendTransaction fails with 4200 like any other method this wallet does not know.
   */
  onSend: ((tx: SentTransaction) => `0x${string}` | Promise<`0x${string}`>) | undefined;
  private failures = new Map<string, Error[]>();
  private holds = new Map<string, Promise<void>[]>();
  private listeners = new Map<string, Set<Listener>>();

  constructor({ chainId, accounts, authorized = false }: { chainId: number; accounts: Address[]; authorized?: boolean }) {
    this.chainId = chainId;
    this.accounts = accounts;
    this.authorized = authorized;
    this.knownChains.add(chainId);
  }

  readonly provider = {
    request: ({ method, params }: { method: string; params?: unknown }) => this.handle(method, params),
    on: (event: string, listener: Listener) => {
      const set = this.listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      this.listeners.set(event, set);
    },
    removeListener: (event: string, listener: Listener) => {
      this.listeners.get(event)?.delete(listener);
    },
  };

  /** The next request of this method throws the error, once. */
  failNext(method: string, error: Error): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), error]);
  }

  /** The next request of this method waits until the returned function is called, as when a prompt is open. */
  hold(method: string): () => void {
    let release = () => {};
    const waiting = new Promise<void>((resolve) => (release = resolve));
    this.holds.set(method, [...(this.holds.get(method) ?? []), waiting]);
    return release;
  }

  methods(): string[] {
    return this.requests.map((r) => r.method);
  }

  count(method: string): number {
    return this.requests.filter((r) => r.method === method).length;
  }

  paramsOf(method: string): unknown[] {
    return this.requests.filter((r) => r.method === method).map((r) => r.params);
  }

  /** The user changes account in the wallet's own window. */
  changeAccounts(next: Address[]): void {
    this.accounts = next;
    this.authorized = next.length > 0;
    this.emit("accountsChanged", next);
  }

  /** The user changes network in the wallet's own window. */
  changeChain(id: number): void {
    this.chainId = id;
    this.knownChains.add(id);
    this.emit("chainChanged", numberToHex(id));
  }

  private emit(event: string, payload: unknown): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(payload);
  }

  private async handle(method: string, params: unknown): Promise<unknown> {
    this.requests.push({ method, params });
    const failure = this.failures.get(method)?.shift();
    if (failure) throw failure;
    await this.holds.get(method)?.shift();
    switch (method) {
      case "eth_accounts":
        return this.authorized ? [...this.accounts] : [];
      case "eth_chainId":
        return numberToHex(this.chainId);
      case "eth_requestAccounts":
        this.authorized = true;
        return [...this.accounts];
      case "wallet_requestPermissions":
        this.authorized = true;
        return [
          { parentCapability: "eth_accounts", caveats: [{ type: "restrictReturnedAccounts", value: [...this.accounts] }] },
        ];
      case "wallet_revokePermissions":
        this.authorized = false;
        return null;
      case "wallet_switchEthereumChain": {
        const id = hexToNumber((params as { chainId: `0x${string}` }[])[0]?.chainId ?? "0x0");
        if (!this.knownChains.has(id)) throw walletError(4902, "Unrecognized chain ID. Try adding the chain first.");
        this.changeChain(id);
        return null;
      }
      case "wallet_addEthereumChain": {
        const id = hexToNumber((params as { chainId: `0x${string}` }[])[0]?.chainId ?? "0x0");
        this.changeChain(id);
        return null;
      }
      case "eth_sendTransaction": {
        if (!this.onSend) throw walletError(4200, `The method ${method} is not supported.`);
        return this.onSend((params as SentTransaction[])[0] as SentTransaction);
      }
      default:
        throw walletError(4200, `The method ${method} is not supported.`);
    }
  }
}

/**
 * Announces the wallet over EIP-6963 now and whenever a page asks, as an extension does. The returned
 * function stops answering, so one test's wallet is gone for the next.
 */
export function announce(wallet: FakeWallet, name: string, rdns: string): { stop: () => void; again: () => void } {
  const info: AnnouncedInfo = { uuid: `${rdns}-uuid`, name, icon: ICON, rdns };
  const detail = Object.freeze({ info, provider: wallet.provider });
  const send = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
  window.addEventListener("eip6963:requestProvider", send);
  send();
  return { stop: () => window.removeEventListener("eip6963:requestProvider", send), again: send };
}

/** Puts the wallet at window.ethereum, as an extension that predates EIP-6963 does. */
export function installWindowEthereum(wallet: FakeWallet): () => void {
  Object.defineProperty(window, "ethereum", { configurable: true, value: wallet.provider });
  return () => {
    Reflect.deleteProperty(window, "ethereum");
  };
}
