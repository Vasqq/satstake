// The whole sequence of the live testnet script (LLR-VV-005) run against a stub chain that has the
// semantics of the four SatStake functions, two tokens, receipts with logs, block time and signed
// transactions. The stub never throws at the first signature, so every per-step assertion in
// runE2E executes, and a single wrong receipt or read can be injected to see that step fail.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, encodeAbiParameters, encodeErrorResult, encodeEventTopics, erc20Abi, getAddress, parseAbi } from "viem";
import { CHAIN_ID, Evidence, assertNoTransferTo, recordFailure, runE2E } from "../../e2e/lib.mjs";

const KEY = "0x" + "ab".repeat(32);
const TX = "0x" + "12".repeat(32);
const addr = (n) => getAddress("0x" + n.toString(16).padStart(40, "0"));
const [OPERATOR, REFEREE, BENEFICIARY, SETTLER, CONTRACT, CIRBTC, USDC] = [1, 2, 3, 4, 5, 6, 7].map(addr);
const HASH = /^0x[0-9a-f]{64}$/;

const revertError = (data) => {
  const inner = Object.assign(new Error("execution reverted"), { data });
  return Object.assign(new Error("call failed"), { cause: inner });
};

const erc20Log = (token, from, to, value) => ({
  address: token,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }),
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  logIndex: 0,
  blockNumber: 1n,
  blockHash: "0x" + "00".repeat(32),
  transactionHash: TX,
  transactionIndex: 0,
  removed: false,
});

describe("LLR-VV-005 no payment to the settler", () => {
  it("accepts a receipt whose Transfers all go elsewhere", () => {
    assert.doesNotThrow(() => assertNoTransferTo({ logs: [erc20Log(USDC, CONTRACT, BENEFICIARY, 10_000n)], who: SETTLER, label: "settler" }));
  });
  it("accepts a receipt with no logs", () => {
    assert.doesNotThrow(() => assertNoTransferTo({ logs: [], who: SETTLER, label: "settler" }));
  });
  it("fails when any token Transfer goes to the settler, however small", () => {
    const logs = [erc20Log(USDC, CONTRACT, BENEFICIARY, 10_000n), erc20Log(USDC, CONTRACT, SETTLER, 1n)];
    assert.throws(() => assertNoTransferTo({ logs, who: SETTLER, label: "settler" }), /Transfer to the settler/);
  });
});

const FULL_ABI = parseAbi([
  "event PledgeCreated(uint256 indexed id, address indexed staker, address indexed token, uint256 amount, address referee, address beneficiary, uint64 deadline)",
  "function createPledge(address token, uint256 amount, address referee, address beneficiary, uint64 deadline, string promiseText) returns (uint256)",
  "function markKept(uint256 id)",
  "function markBroken(uint256 id)",
  "function settle(uint256 id)",
  "error AlreadySettled()",
  "error NotSettleable(uint64 deadline)",
  "error VerdictWindowClosed(uint64 deadline)",
]);

function fakeChain(opts = {}) {
  let now = 1_000_000n;
  let block = 100n;
  let counter = 0;
  const blockTs = new Map();
  const nextHash = () => `0x${(++counter).toString(16).padStart(64, "0")}`;
  const native = new Map([[OPERATOR, 10n ** 20n]]);
  const bal = { [CIRBTC]: new Map([[OPERATOR, 1_000n]]), [USDC]: new Map([[OPERATOR, 10_000_000n]]) };
  const allowance = new Map();
  const pledges = new Map();
  const locked = { [CIRBTC]: 0n, [USDC]: 0n };
  const receipts = new Map();
  const signed = new Map();
  let nextId = 1n;
  const held = (t, a) => bal[t].get(a) ?? 0n;
  const STATES = { Active: 0, Kept: 2, Broken: 3, SettledToStaker: 4, SettledToBeneficiary: 5 };
  const stateOf = (p) => (p.status !== "Active" ? STATES[p.status] : now >= p.deadline ? 1 : 0);
  const refuse = (name, args) => ({ error: { name, args } });

  function plan(from, fn, args) {
    if (fn === "createPledge") {
      const [token, amount, referee, beneficiary, deadline, text] = args;
      return {
        run() {
          bal[token].set(from, held(token, from) - amount);
          bal[token].set(CONTRACT, held(token, CONTRACT) + amount);
          locked[token] += amount;
          const id = nextId++;
          pledges.set(id, { id, staker: from, token, amount, referee, beneficiary, deadline, promiseText: text, status: "Active" });
          const created = {
            address: CONTRACT,
            topics: encodeEventTopics({ abi: FULL_ABI, eventName: "PledgeCreated", args: { id, staker: from, token } }),
            data: encodeAbiParameters([{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint64" }], [amount, referee, beneficiary, deadline]),
            logIndex: 1,
            blockNumber: block,
            blockHash: "0x" + "00".repeat(32),
            transactionHash: TX,
            transactionIndex: 0,
            removed: false,
          };
          return opts.noStakeLog ? [created] : [erc20Log(token, from, CONTRACT, amount), created];
        },
      };
    }
    const p = pledges.get(args[0]);
    if (fn === "markKept" || fn === "markBroken") {
      if (now >= p.deadline) return refuse("VerdictWindowClosed", [p.deadline]);
      return {
        run() {
          if (!opts.stuckVerdict) p.status = fn === "markKept" ? "Kept" : "Broken";
          return [];
        },
      };
    }
    if (p.status.startsWith("Settled")) return refuse("AlreadySettled");
    if (stateOf(p) === 0) return refuse("NotSettleable", [p.deadline]);
    return {
      run() {
        const toStaker = p.status === "Kept";
        const recipient = toStaker ? p.staker : p.beneficiary;
        const pay = p.amount - (opts.skim ?? 0n);
        bal[p.token].set(CONTRACT, held(p.token, CONTRACT) - p.amount);
        bal[p.token].set(recipient, held(p.token, recipient) + pay);
        locked[p.token] -= p.amount;
        p.status = toStaker ? "SettledToStaker" : "SettledToBeneficiary";
        const logs = [erc20Log(p.token, CONTRACT, recipient, pay)];
        if (opts.payToSettler && from !== recipient) {
          bal[p.token].set(from, held(p.token, from) + 1n);
          bal[p.token].set(CONTRACT, held(p.token, CONTRACT) - 1n);
          logs.push(erc20Log(p.token, CONTRACT, from, 1n));
        }
        return logs;
      },
    };
  }

  function tick() {
    block += 1n;
    now += 2n;
    blockTs.set(block, now);
  }
  function mine({ from, fn, args, gas = 300_000n }) {
    tick();
    const hash = nextHash();
    const p = plan(from, fn, args);
    if (p.error) receipts.set(hash, { status: "reverted", blockNumber: block, gasUsed: opts.outOfGas ? gas : 40_000n, logs: [] });
    else receipts.set(hash, { status: "success", blockNumber: block, gasUsed: 90_000n, logs: p.run() });
    return hash;
  }
  function mineSimple(run) {
    tick();
    run();
    const hash = nextHash();
    receipts.set(hash, { status: "success", blockNumber: block, gasUsed: 50_000n, logs: [] });
    return hash;
  }

  const pub = {
    getChainId: async () => CHAIN_ID,
    getCode: async () => "0x6001",
    getBalance: async ({ address }) => native.get(address) ?? 0n,
    estimateFeesPerGas: async () => ({ maxFeePerGas: 1000n, maxPriorityFeePerGas: 1n }),
    getTransactionCount: async () => 7,
    getBlock: async (a) => ({ timestamp: a?.blockNumber ? (blockTs.get(a.blockNumber) ?? now) : now }),
    waitForTransactionReceipt: async ({ hash }) => receipts.get(hash),
    sendRawTransaction: async ({ serializedTransaction }) => mine(signed.get(serializedTransaction)),
    simulateContract: async ({ functionName, args, account }) => {
      const p = plan(account, functionName, args);
      if (p.error) throw revertError(encodeErrorResult({ abi: FULL_ABI, errorName: p.error.name, args: p.error.args }));
      return {};
    },
    readContract: async ({ address, functionName, args }) => {
      if (address === CONTRACT) {
        if (functionName === "totalLocked") return locked[args[0]];
        if (functionName === "stateOf") return stateOf(pledges.get(args[0]));
        if (functionName === "getPledge") return pledges.get(args[0]);
      }
      if (functionName === "balanceOf") return held(address, args[0]);
      if (functionName === "allowance") return allowance.get(address) ?? 0n;
      throw new Error(`unexpected read ${functionName}`);
    },
  };
  const wallet = (account) => ({
    writeContract: async ({ address, functionName, args, gas }) => {
      if (address === CONTRACT) return mine({ from: account.address, fn: functionName, args, gas });
      if (functionName === "approve") return mineSimple(() => allowance.set(address, args[1]));
      return mineSimple(() => {
        bal[address].set(account.address, held(address, account.address) - args[1]);
        bal[address].set(args[0], held(address, args[0]) + args[1]);
      });
    },
    sendTransaction: async ({ to, value, gas = 0n, maxFeePerGas = 0n }) =>
      mineSimple(() => {
        native.set(account.address, (native.get(account.address) ?? 0n) - value - gas * maxFeePerGas);
        native.set(to, (native.get(to) ?? 0n) + value);
      }),
  });
  const signs = [];
  const accounts = Object.fromEntries(
    [["staker", OPERATOR], ["referee", REFEREE], ["beneficiary", BENEFICIARY], ["settler", SETTLER]].map(([role, address]) => [
      role,
      {
        address,
        privateKey: KEY,
        signTransaction: async (tx) => {
          const d = decodeFunctionData({ abi: FULL_ABI, data: tx.data });
          const key = nextHash();
          signed.set(key, { from: address, fn: d.functionName, args: d.args, gas: tx.gas });
          signs.push({ nonce: tx.nonce, at: now });
          return key;
        },
      },
    ]),
  );
  const evidence = new Evidence({ chainId: CHAIN_ID, contract: CONTRACT });
  const world = {
    pub,
    wallet,
    accounts,
    abi: FULL_ABI,
    contract: CONTRACT,
    usdc: USDC,
    cirbtc: CIRBTC,
    evidence,
    dryRun: false,
    sleep: async (ms) => {
      now += BigInt(ms) / 1000n;
    },
    log: () => {},
    retry: { sleep: async () => {} },
  };
  return { world, evidence, signs, held };
}

describe("LLR-VV-005 the whole sequence, step by step, on a stub chain", () => {
  it("runs every journey to a pass and returns the beneficiary's cirBTC to the operator", async () => {
    const { world, evidence, held } = fakeChain();
    await runE2E(world);
    const j = evidence.toJSON();
    assert.equal(j.result, "pass");
    assert.equal(held(CIRBTC, BENEFICIARY), 0n);
    assert.equal(held(CIRBTC, OPERATOR), 1_000n);
    const journeys = new Set(j.steps.map((s) => s.journey));
    for (const uj of ["UJ-10", "UJ-11", "UJ-30", "UJ-31", "UJ-32", "UJ-40", "UJ-41", "UJ-42", "UJ-43", "UJ-44", "UJ-45"]) assert.ok(journeys.has(uj), uj);
  });
  it("records, on both UJ-32 rows, when and with which nonce the script signed", async () => {
    const { world, evidence, signs } = fakeChain();
    await runE2E(world);
    const rows = evidence.toJSON().steps.filter((s) => s.journey === "UJ-32");
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.observed.nonce), [7, 8]);
    assert.ok(rows.every((r) => r.observed.signedAtChainTime === String(signs[0].at)));
    assert.ok(rows.every((r) => /signed at chain time \d+ with nonce \d+/.test(r.note)));
  });
  it("gives every UJ-32 refusal a mined hash and the contract's own error", async () => {
    const { world, evidence } = fakeChain();
    await runE2E(world);
    const rows = evidence.toJSON().steps.filter((s) => s.journey === "UJ-32");
    assert.ok(rows.every((r) => r.error === "VerdictWindowClosed" && HASH.test(r.tx)));
  });
  it("fails when a create receipt has no Transfer of the stake", async () => {
    await assert.rejects(runE2E(fakeChain({ noStakeLog: true }).world), /expected exactly one Transfer/);
  });
  it("fails when a settlement pays the recipient one unit short", async () => {
    await assert.rejects(runE2E(fakeChain({ skim: 1n }).world), /recipient: balance moved by/);
  });
  it("fails when a verdict leaves the pledge in the wrong state", async () => {
    await assert.rejects(runE2E(fakeChain({ stuckVerdict: true }).world), /pledge \d+ is Kept/);
  });
  it("fails when a third-party settlement also pays the settler, in USDC where only logs can show it", async () => {
    await assert.rejects(runE2E(fakeChain({ payToSettler: true }).world), /Transfer to the settler/);
  });
  it("fails when a refusal is an out-of-gas that used the whole limit", async () => {
    await assert.rejects(runE2E(fakeChain({ outOfGas: true }).world), /gas limit/);
  });
});

describe("LLR-VV-005 partial record of a failed run", () => {
  it("writes the hashes sent so far, marked failed, with the error and no key", async () => {
    const { world, evidence } = fakeChain({ stuckVerdict: true });
    let err;
    try {
      await runE2E(world);
    } catch (e) {
      err = e;
    }
    assert.ok(err, "the run should have failed");
    const written = [];
    recordFailure(evidence, err, (text) => written.push(text));
    assert.equal(written.length, 1);
    const data = JSON.parse(written[0]);
    assert.equal(data.result, "fail");
    assert.match(data.error, /is Kept/);
    assert.ok(data.steps.length > 3);
    assert.ok(data.steps.filter((s) => s.tx).every((s) => HASH.test(s.tx)));
    assert.ok(!written[0].toLowerCase().includes(KEY.slice(2)));
  });
});
