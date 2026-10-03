import {
  type Address,
  type Hex,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  numberToHex,
  pad,
} from "viem";
import { satStakeAbi } from "../abi";
import type { FakeChain, FakeReceipt } from "./fakeChain";
import { type FakeWallet, type SentTransaction, walletError } from "./fakeWallet";

export type Sent =
  | { to: Address; functionName: "approve"; args: readonly [Address, bigint]; hash: Hex; from: Address }
  | {
      to: Address;
      functionName: "createPledge";
      args: readonly [Address, bigint, Address, Address, bigint, string];
      hash: Hex;
      from: Address;
    };

/** A PledgeCreated log as the contract emits it, from whatever address the caller says emitted it. */
export function pledgeCreatedLog(fields: {
  address: Address;
  id: bigint;
  staker: Address;
  token: Address;
  amount: bigint;
  referee: Address;
  beneficiary: Address;
  deadline: bigint;
}): FakeReceipt["logs"][number] {
  const { address, id, staker, token, amount, referee, beneficiary, deadline } = fields;
  return {
    address,
    topics: encodeEventTopics({ abi: satStakeAbi, eventName: "PledgeCreated", args: { id, staker, token } }) as Hex[],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint64" }],
      [amount, referee, beneficiary, deadline],
    ),
  };
}

/**
 * The wallet and the chain acting together, enough for a pledge to be created: a transaction the wallet is
 * asked to send is decoded, mined at once, and its effects and receipt are put on the chain. What a real
 * node would refuse is not modelled here, since the contract's own tests cover it; a test that needs a
 * refusal scripts it with `failNext` on the wallet or `outcomes` here.
 */
export class FakeWorld {
  sent: Sent[] = [];
  /** The identifier the next createPledge gets. Distinct from any pledge count, so a wrong source shows. */
  nextPledgeId = 42n;
  /** How each mined transaction ends, oldest first. Anything not listed succeeds. */
  outcomes: ("success" | "reverted")[] = [];
  /** Added to the block timestamp as each transaction is mined, as the time a real approval takes. */
  blockAdvance = 0n;
  /** A creation that succeeds but whose receipt carries no PledgeCreated log. */
  omitCreatedEvent = false;
  /**
   * The next creation is replaced the way a wallet's speed-up replaces it: the hash the wallet returned stays
   * pending for good, and a transaction with the same sender and nonce is mined in its place.
   */
  replaceNextCreate = false;
  private counter = 0;
  private nonces = new Map<string, number>();

  constructor(
    readonly chain: FakeChain,
    readonly wallet: FakeWallet,
  ) {
    wallet.onSend = (tx) => this.mine(tx);
  }

  count(functionName: Sent["functionName"]): number {
    return this.sent.filter((s) => s.functionName === functionName).length;
  }

  private mine(tx: SentTransaction): Hex {
    const to = tx.to.toLowerCase();
    const hash = pad(numberToHex(++this.counter), { size: 32 });
    const outcome = this.outcomes.shift() ?? "success";
    this.chain.blockTimestamp += this.blockAdvance;
    let logs: FakeReceipt["logs"] = [];

    if (to === this.chain.contract.toLowerCase()) {
      const decoded = decodeFunctionData({ abi: satStakeAbi, data: tx.data });
      if (decoded.functionName !== "createPledge") throw walletError(4200, `FakeWorld does not send ${decoded.functionName}`);
      const args = decoded.args as unknown as Extract<Sent, { functionName: "createPledge" }>["args"];
      this.sent.push({ to: tx.to, functionName: "createPledge", args, hash, from: tx.from });
      if (outcome === "success") logs = this.create(tx.from, args);
    } else {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
      if (decoded.functionName !== "approve") throw walletError(4200, `FakeWorld does not send ${decoded.functionName}`);
      const args = decoded.args as readonly [Address, bigint];
      this.sent.push({ to: tx.to, functionName: "approve", args, hash, from: tx.from });
      if (outcome === "success") this.chain.setAllowance(tx.to, tx.from, args[0], args[1]);
    }

    const nonce = this.nonces.get(tx.from) ?? 0;
    this.nonces.set(tx.from, nonce + 1);
    const replaced = this.replaceNextCreate && to === this.chain.contract.toLowerCase();
    if (replaced) {
      this.replaceNextCreate = false;
      const replacement = pad(numberToHex(++this.counter), { size: 32 });
      this.chain.transactions.set(hash, { from: tx.from, to: tx.to, input: tx.data, nonce, mined: false });
      this.chain.transactions.set(replacement, { from: tx.from, to: tx.to, input: tx.data, nonce, mined: true });
      this.chain.receipts.set(replacement, { status: outcome, from: tx.from, to: tx.to, logs });
      return hash;
    }
    this.chain.transactions.set(hash, { from: tx.from, to: tx.to, input: tx.data, nonce, mined: true });
    this.chain.receipts.set(hash, { status: outcome, from: tx.from, to: tx.to, logs });
    return hash;
  }

  private create(staker: Address, args: Extract<Sent, { functionName: "createPledge" }>["args"]): FakeReceipt["logs"] {
    const [token, amount, referee, beneficiary, deadline, promiseText] = args;
    const id = this.nextPledgeId;
    this.chain.setBalance(token, staker, this.chain.balanceOf(token, staker) - amount);
    this.chain.setAllowance(token, staker, this.chain.contract, this.chain.allowanceOf(token, staker, this.chain.contract) - amount);
    this.chain.addPledge(id, {
      staker,
      token,
      amount,
      referee,
      beneficiary,
      deadline,
      createdAt: this.chain.blockTimestamp,
      status: 1,
      promiseText,
    });
    const created = pledgeCreatedLog({ address: this.chain.contract, id, staker, token, amount, referee, beneficiary, deadline });
    // The token's own event comes first, as it does in a real receipt, so the reader has to pick the right log.
    const transfer: FakeReceipt["logs"][number] = {
      address: token,
      topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: staker, to: this.chain.contract } }) as Hex[],
      data: encodeAbiParameters([{ type: "uint256" }], [amount]),
    };
    return this.omitCreatedEvent ? [transfer] : [transfer, created];
  }
}
