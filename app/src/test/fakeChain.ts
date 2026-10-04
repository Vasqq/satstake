import {
  type Address,
  type Hex,
  type Transport,
  RpcRequestError,
  custom,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  erc20Abi,
  numberToHex,
} from "viem";
import { satStakeAbi } from "../abi";

export interface FakePledge {
  staker: Address;
  token: Address;
  amount: bigint;
  referee: Address;
  beneficiary: Address;
  deadline: bigint;
  createdAt: bigint;
  status: number;
  promiseText: string;
}

export interface FakeToken {
  decimals: number;
  symbol: string;
}

/** A receipt as a node returns it, before viem formats it. */
export interface FakeReceipt {
  status: "success" | "reverted";
  from: Address;
  to: Address;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
}

/** A transaction as a node holds it: pending until `mined`, and found by `from` and `nonce` when it is replaced. */
export interface FakeTransaction {
  from: Address;
  to: Address;
  input: Hex;
  nonce: number;
  mined: boolean;
}

export interface RequestRecord {
  method: string;
  functionName?: string;
  to?: string;
  /** The raw params of an eth_call, so a test can check the block and the overrides it was made with. */
  params?: unknown[];
}

export const samplePledge: FakePledge = {
  staker: "0x1111111111111111111111111111111111111111",
  token: "0x3600000000000000000000000000000000000000",
  amount: 2_500_000n,
  referee: "0x2222222222222222222222222222222222222222",
  beneficiary: "0x3333333333333333333333333333333333333333",
  deadline: 1_790_000_000n,
  createdAt: 1_789_000_000n,
  status: 1,
  promiseText: "Run 5 km before Friday",
};

/**
 * A JSON-RPC endpoint that answers from memory. Contract calls are decoded and answered with the real
 * ABI, so the app's reads go through the same encode and decode path as against a node.
 */
export class FakeChain {
  chainId = 5042002;
  blockTimestamp = 1_789_500_000n;
  pledges = new Map<bigint, FakePledge>();
  states = new Map<bigint, number>();
  /** The ids each account takes part in, oldest first, keyed by lower-cased account, as the contract's per-address index. */
  accountPledges = new Map<string, bigint[]>();
  /** Each `pledgeIdsOf` read the contract answered, so a test can check the window the page asked for. */
  pagedReads: { account: string; offset: bigint; limit: bigint }[] = [];
  tokens = new Map<string, FakeToken>();
  /** Keyed by lower-cased token and account, so a read for an account nobody set up is 0. */
  balances = new Map<string, bigint>();
  /** Keyed by lower-cased token, owner, and spender. */
  allowances = new Map<string, bigint>();
  /** Lower-cased addresses that hold contract code. */
  code = new Set<string>();
  /** Lower-cased address to the exact code it holds, for a test that needs code other than the stock bytes. */
  codeBytes = new Map<string, string>();
  receipts = new Map<Hex, FakeReceipt>();
  transactions = new Map<Hex, FakeTransaction>();
  contract: Address;
  requests: RequestRecord[] = [];
  /** Errors thrown for the next requests, one per request, oldest first. */
  failures: Error[] = [];
  /** When set, every request of any method fails with it until cleared, as when the endpoint is down. */
  outage: Error | undefined;
  /** When set, every eth_call fails with it until cleared. */
  callError: Error | undefined;
  /** When set, every eth_getBlockByNumber fails with it until cleared, as when the time of the network cannot be read. */
  blockError: Error | undefined;
  /** When set, every balanceOf call fails with it until cleared, while the other reads still answer. */
  balanceError: Error | undefined;
  /** When set, every eth_call reverts with this contract error until cleared, or only those made at `block` when it is given. */
  callRevert: { errorName: string; args?: unknown[]; block?: string } | undefined;
  /** When set, every eth_call waits for it before answering. */
  gate: Promise<void> | undefined;
  /** When set, every eth_getTransactionReceipt waits for it before answering, as when a transaction is not yet mined. */
  receiptGate: Promise<void> | undefined;
  /** When set, every eth_getTransactionReceipt fails with it, as when the endpoint breaks after a transaction was sent. */
  receiptError: Error | undefined;
  /**
   * Called for each answered request once its answer is fixed, which is when a real node would have read
   * its state. The request returns after the promise it gets back, so a test can make one answer slow.
   */
  latency: ((record: RequestRecord) => Promise<void> | undefined) | undefined;

  constructor(contract: Address) {
    this.contract = contract;
  }

  addPledge(id: bigint, pledge: FakePledge = samplePledge, state = 0): void {
    this.pledges.set(id, pledge);
    this.states.set(id, state);
  }

  addToken(address: string, token: FakeToken): void {
    this.tokens.set(address.toLowerCase(), token);
  }

  setBalance(token: string, account: string, amount: bigint): void {
    this.balances.set(`${token}:${account}`.toLowerCase(), amount);
  }

  balanceOf(token: string, account: string): bigint {
    return this.balances.get(`${token}:${account}`.toLowerCase()) ?? 0n;
  }

  setAllowance(token: string, owner: string, spender: string, amount: bigint): void {
    this.allowances.set(`${token}:${owner}:${spender}`.toLowerCase(), amount);
  }

  allowanceOf(token: string, owner: string, spender: string): bigint {
    return this.allowances.get(`${token}:${owner}:${spender}`.toLowerCase()) ?? 0n;
  }

  count(method: string, functionName?: string): number {
    return this.requests.filter((r) => r.method === method && (functionName === undefined || r.functionName === functionName))
      .length;
  }

  get transport(): Transport {
    // viem's own retries are off so a scripted failure is seen once and a test does not wait on backoff.
    return custom(
      { request: async ({ method, params }) => this.handle(method, params as unknown[] | undefined) },
      { retryCount: 0 },
    );
  }

  private async handle(method: string, params: unknown[] | undefined): Promise<unknown> {
    const record: RequestRecord = { method };
    this.requests.push(record);
    const failure = this.failures.shift();
    if (failure) throw failure;
    if (this.outage) throw this.outage;

    switch (method) {
      case "eth_chainId":
        await this.latency?.(record);
        return numberToHex(this.chainId);
      case "eth_getBlockByNumber": {
        record.params = params;
        if (this.blockError) throw this.blockError;
        // A block with its transactions in full is what viem reads to look for a replacement of a pending one.
        const full = params?.[1] === true;
        const block = {
          number: "0x10",
          hash: "0x" + "ab".repeat(32),
          parentHash: "0x" + "cd".repeat(32),
          timestamp: numberToHex(this.blockTimestamp),
          transactions: full ? [...this.transactions].filter(([, tx]) => tx.mined).map(([hash, tx]) => this.formatTransaction(hash, tx)) : [],
          uncles: [],
        };
        await this.latency?.(record);
        return block;
      }
      case "eth_blockNumber":
        return "0x10";
      case "eth_getCode":
        record.to = String(params?.[0] ?? "").toLowerCase();
        return (
          this.codeBytes.get(String(params?.[0] ?? "").toLowerCase()) ??
          (this.code.has(String(params?.[0] ?? "").toLowerCase()) ? "0x6080604052" : "0x")
        );
      case "eth_getTransactionReceipt": {
        if (this.receiptGate) await this.receiptGate;
        if (this.receiptError) throw this.receiptError;
        return this.formatReceipt((params?.[0] ?? "0x") as Hex);
      }
      case "eth_getTransactionByHash": {
        const hash = (params?.[0] ?? "0x") as Hex;
        const tx = this.transactions.get(hash);
        return tx ? this.formatTransaction(hash, tx) : null;
      }
      case "eth_call": {
        record.params = params;
        if (this.callError) throw this.callError;
        if (this.callRevert && (this.callRevert.block === undefined || this.callRevert.block === params?.[1])) throw this.revert(this.callRevert.errorName, this.callRevert.args);
        if (this.gate) await this.gate;
        const answer = this.call(record, params);
        await this.latency?.(record);
        return answer;
      }
      default:
        throw new Error(`FakeChain does not answer ${method}`);
    }
  }

  private call(record: RequestRecord, params: unknown[] | undefined): Hex {
    const tx = (params?.[0] ?? {}) as { to?: string; data?: Hex };
    record.to = tx.to?.toLowerCase();
    const data = tx.data ?? "0x";
    if (record.to === this.contract.toLowerCase()) return this.callContract(record, data);
    const token = record.to ? this.tokens.get(record.to) : undefined;
    if (!token) throw new Error(`FakeChain has no contract at ${tx.to}`);
    const { functionName } = decodeFunctionData({ abi: erc20Abi, data });
    record.functionName = functionName;
    if (functionName === "decimals") {
      return encodeFunctionResult({ abi: erc20Abi, functionName, result: token.decimals });
    }
    if (functionName === "symbol") {
      return encodeFunctionResult({ abi: erc20Abi, functionName, result: token.symbol });
    }
    const args = (decodeFunctionData({ abi: erc20Abi, data }).args ?? []) as readonly string[];
    if (functionName === "balanceOf") {
      if (this.balanceError) throw this.balanceError;
      return encodeFunctionResult({ abi: erc20Abi, functionName, result: this.balanceOf(tx.to as string, args[0] as string) });
    }
    if (functionName === "allowance") {
      return encodeFunctionResult({
        abi: erc20Abi,
        functionName,
        result: this.allowanceOf(tx.to as string, args[0] as string, args[1] as string),
      });
    }
    throw new Error(`FakeChain does not answer token call ${functionName}`);
  }

  private callContract(record: RequestRecord, data: Hex): Hex {
    const decoded = decodeFunctionData({ abi: satStakeAbi, data });
    const args = (decoded.args ?? []) as readonly unknown[];
    record.functionName = decoded.functionName;
    switch (decoded.functionName) {
      case "pledgeCount":
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "pledgeCount", result: BigInt(this.pledges.size) });
      case "getPledge": {
        const id = args[0] as bigint;
        const pledge = this.pledges.get(id);
        if (!pledge) throw this.notFound(id);
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "getPledge", result: pledge });
      }
      case "stateOf": {
        const id = args[0] as bigint;
        const state = this.states.get(id);
        if (state === undefined) throw this.notFound(id);
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "stateOf", result: state });
      }
      case "pledgeCountOf": {
        const ids = this.accountPledges.get(String(args[0]).toLowerCase()) ?? [];
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "pledgeCountOf", result: BigInt(ids.length) });
      }
      case "pledgeIdsOf": {
        const [account, offset, limit] = args as [string, bigint, bigint];
        this.pagedReads.push({ account: account.toLowerCase(), offset, limit });
        const ids = this.accountPledges.get(account.toLowerCase()) ?? [];
        // The contract clamps the window to what exists and returns nothing past the end.
        return encodeFunctionResult({
          abi: satStakeAbi,
          functionName: "pledgeIdsOf",
          result: ids.slice(Number(offset), Number(offset + limit)),
        });
      }
      case "totalLocked":
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "totalLocked", result: 0n });
      default:
        throw new Error(`FakeChain does not answer ${decoded.functionName}`);
    }
  }

  private formatTransaction(hash: Hex, tx: FakeTransaction): unknown {
    return {
      hash,
      from: tx.from,
      to: tx.to,
      input: tx.input,
      nonce: numberToHex(tx.nonce),
      value: "0x0",
      gas: "0x5208",
      gasPrice: "0x1",
      type: "0x0",
      blockHash: tx.mined ? "0x" + "ab".repeat(32) : null,
      blockNumber: tx.mined ? "0x10" : null,
      transactionIndex: tx.mined ? "0x0" : null,
    };
  }

  private formatReceipt(hash: Hex): unknown {
    const receipt = this.receipts.get(hash);
    if (!receipt) return null;
    const common = { blockHash: "0x" + "ab".repeat(32), blockNumber: "0x10", transactionHash: hash, transactionIndex: "0x0" };
    return {
      ...common,
      from: receipt.from,
      to: receipt.to,
      contractAddress: null,
      cumulativeGasUsed: "0x5208",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x1",
      logsBloom: "0x" + "00".repeat(256),
      status: receipt.status === "success" ? "0x1" : "0x0",
      type: "0x2",
      logs: receipt.logs.map((log, index) => ({ ...common, ...log, logIndex: numberToHex(index), removed: false })),
    };
  }

  private notFound(id: bigint): RpcRequestError {
    return this.revert("PledgeNotFound", [id]);
  }

  private revert(errorName: string, args: unknown[] = []): RpcRequestError {
    // A token's own revert string is not in SatStake's ABI, so the standard Error(string) is encoded by hand.
    const data =
      errorName === "Error"
        ? encodeErrorResult({ abi: [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }], errorName, args: args as [string] })
        : encodeErrorResult({ abi: satStakeAbi, errorName, args });
    return new RpcRequestError({
      body: {},
      error: { code: 3, message: "execution reverted", data },
      url: "fake",
    });
  }
}
