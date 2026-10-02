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

export interface RequestRecord {
  method: string;
  functionName?: string;
  to?: string;
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
  tokens = new Map<string, FakeToken>();
  contract: Address;
  requests: RequestRecord[] = [];
  /** Errors thrown for the next requests, one per request, oldest first. */
  failures: Error[] = [];
  /** When set, every request of any method fails with it until cleared, as when the endpoint is down. */
  outage: Error | undefined;
  /** When set, every eth_call fails with it until cleared. */
  callError: Error | undefined;
  /** When set, every eth_call reverts with this contract error until cleared. */
  callRevert: { errorName: string; args?: unknown[] } | undefined;
  /** When set, every eth_call waits for it before answering. */
  gate: Promise<void> | undefined;
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
        const block = {
          number: "0x10",
          hash: "0x" + "ab".repeat(32),
          parentHash: "0x" + "cd".repeat(32),
          timestamp: numberToHex(this.blockTimestamp),
          transactions: [],
          uncles: [],
        };
        await this.latency?.(record);
        return block;
      }
      case "eth_call": {
        if (this.callError) throw this.callError;
        if (this.callRevert) throw this.revert(this.callRevert.errorName, this.callRevert.args);
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
      case "pledgeCountOf":
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "pledgeCountOf", result: 0n });
      case "pledgeIdsOf":
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "pledgeIdsOf", result: [] });
      case "totalLocked":
        return encodeFunctionResult({ abi: satStakeAbi, functionName: "totalLocked", result: 0n });
      default:
        throw new Error(`FakeChain does not answer ${decoded.functionName}`);
    }
  }

  private notFound(id: bigint): RpcRequestError {
    return this.revert("PledgeNotFound", [id]);
  }

  private revert(errorName: string, args: unknown[] = []): RpcRequestError {
    const data = encodeErrorResult({ abi: satStakeAbi, errorName, args });
    return new RpcRequestError({
      body: {},
      error: { code: 3, message: "execution reverted", data },
      url: "fake",
    });
  }
}
