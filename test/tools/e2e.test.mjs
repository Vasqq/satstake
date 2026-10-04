// Tests for the logic of the live testnet script (LLR-VV-005). The script itself needs a funded
// key and a network, so what is tested here is everything that decides whether it is safe and
// honest: the chain guard and its ordering before any signing, the argument and key parsing, the
// retry rule for Arc's -32014, the decoding of a revert into a named custom error, the mined
// refusal check, the balance assertions, and the evidence writer. Network calls are replaced by
// stubs.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeErrorResult, encodeEventTopics, erc20Abi, getAddress, parseAbi } from "viem";
import {
  CHAIN_ID,
  assertBalanceDelta,
  assertChainId,
  assertStakeTransfer,
  allowedSendTarget,
  decodeRevert,
  explorerTx,
  expectRevert,
  fundingFor,
  isRetryable,
  makeSteps,
  parseArgs,
  parseEnvKey,
  renderEvidence,
  runE2E,
  sweepToOperator,
  sweepValue,
  Evidence,
  withRetry,
} from "../../e2e/lib.mjs";

const ABI = parseAbi([
  "error AlreadySettled()",
  "error NotSettleable(uint64 deadline)",
  "error VerdictWindowClosed(uint64 deadline)",
]);
const KEY = "0x" + "ab".repeat(32);
const TX = "0x" + "12".repeat(32);
const addr = (n) => getAddress("0x" + n.toString(16).padStart(40, "0"));
const [OPERATOR, REFEREE, BENEFICIARY, SETTLER, CONTRACT, CIRBTC, USDC, OTHER] = [1, 2, 3, 4, 5, 6, 7, 8].map(addr);

const revertError = (data) => {
  const inner = Object.assign(new Error("execution reverted"), { data });
  return Object.assign(new Error("call failed"), { cause: Object.assign(new Error("wrapped"), { cause: inner }) });
};

describe("LLR-VV-005 chain guard", () => {
  it("targets Arc testnet", () => assert.equal(CHAIN_ID, 5042002));
  it("accepts chain 5042002", () => assert.doesNotThrow(() => assertChainId(5042002)));
  it("accepts the id as a bigint or a hex string", () => {
    assert.doesNotThrow(() => assertChainId(5042002n));
    assert.doesNotThrow(() => assertChainId("0x4cef52"));
  });
  it("refuses Arc mainnet and names both ids", () => {
    assert.throws(() => assertChainId(5042), /5042.*5042002/s);
  });
  // Arc mainnet, Ethereum, Anvil, and the two chains either side of the testnet: a denylist that
  // names only 5042 would let every one of these through.
  for (const id of [1, 31337, 5042001, 5042003]) {
    it(`refuses chain ${id}`, () => assert.throws(() => assertChainId(id), /refusing to run/));
  }
  it("refuses an undefined id as not a number", () => assert.throws(() => assertChainId(undefined), /not a number/));
});

// A world of stubs that records every call able to sign or send, in order, together with the
// moment the chain id resolved, so the guard-before-send ordering can be asserted.
function world({ chainId = CHAIN_ID, dryRun = false } = {}) {
  const events = [];
  const stop = new Error("STOP");
  const signer = (name) => async () => {
    events.push(name);
    throw stop;
  };
  const accounts = Object.fromEntries(
    [
      ["staker", OPERATOR],
      ["referee", REFEREE],
      ["beneficiary", BENEFICIARY],
      ["settler", SETTLER],
    ].map(([role, address]) => [role, { address, privateKey: KEY, signTransaction: signer(`${role}.signTransaction`) }]),
  );
  const pub = {
    getChainId: async () => {
      events.push("getChainId");
      await new Promise((r) => setImmediate(r));
      events.push("chainIdResolved");
      return chainId;
    },
    getCode: async () => "0x6001",
    getBalance: async () => 10n ** 20n,
    readContract: async () => 10n ** 10n,
    getBlock: async () => ({ timestamp: 1n }),
    estimateFeesPerGas: async () => ({ maxFeePerGas: 1000n, maxPriorityFeePerGas: 1n }),
    getTransactionCount: async () => 0,
    sendRawTransaction: signer("sendRawTransaction"),
    waitForTransactionReceipt: async () => ({ status: "success", logs: [] }),
  };
  const wallet = () => ({ writeContract: signer("writeContract"), sendTransaction: signer("sendTransaction") });
  const evidence = new Evidence({ chainId: CHAIN_ID, contract: CONTRACT });
  const env = { pub, wallet, accounts, abi: ABI, contract: CONTRACT, usdc: USDC, cirbtc: CIRBTC, evidence, dryRun, sleep: async () => {}, log: () => {}, retry: { sleep: async () => {} } };
  return { env, events, evidence };
}
const SIGNING = /signTransaction|sendRawTransaction|writeContract|sendTransaction/;

describe("LLR-VV-005 guard before any signing", () => {
  it("signs and sends nothing, at all, when the chain id is wrong", async () => {
    const { env, events } = world({ chainId: 5042 });
    await assert.rejects(runE2E(env), /refusing to run/);
    assert.deepEqual(events.filter((e) => SIGNING.test(e)), []);
  });
  it("signs and sends nothing in a dry run on the right chain", async () => {
    const { env, events } = world({ dryRun: true });
    await runE2E(env);
    assert.deepEqual(events.filter((e) => SIGNING.test(e)), []);
  });
  it("makes its first signing or sending call only after the chain id has resolved", async () => {
    const { env, events } = world();
    await assert.rejects(runE2E(env), /STOP/);
    const first = events.findIndex((e) => SIGNING.test(e));
    assert.ok(first > 0, `a signing call was expected, saw ${events.join(",")}`);
    assert.ok(events.indexOf("chainIdResolved") < first);
  });
});

describe("LLR-VV-005 arguments and key", () => {
  it("defaults to a live run", () => assert.deepEqual(parseArgs([]), { dryRun: false }));
  it("accepts --dry-run", () => assert.deepEqual(parseArgs(["--dry-run"]), { dryRun: true }));
  it("refuses any other argument, naming it", () => {
    assert.throws(() => parseArgs(["--mainnet"]), /--mainnet/);
  });
  it("reads the testnet key from .env text", () => {
    assert.equal(parseEnvKey(`# c\nTESTNET_ADDRESS=0x1\nTESTNET_PRIVATE_KEY=${KEY}\n`), KEY);
  });
  it("refuses a missing key without printing anything from the file", () => {
    assert.throws(() => parseEnvKey("OTHER=secretvalue123\n"), (e) => /TESTNET_PRIVATE_KEY/.test(e.message) && !/secretvalue123/.test(e.message));
  });
  it("names the missing key and not a TypeError when the line is absent", () => {
    assert.throws(() => parseEnvKey(""), (e) => e.constructor === Error && /missing/.test(e.message));
  });
  it("refuses a malformed key without echoing it", () => {
    const bad = "TESTNET_PRIVATE_KEY=0xnothex";
    assert.throws(() => parseEnvKey(bad), (e) => /not a 32-byte/.test(e.message) && !/nothex/.test(e.message));
  });
  it("refuses a key one byte short", () => {
    assert.throws(() => parseEnvKey(`TESTNET_PRIVATE_KEY=0x${"ab".repeat(31)}`), /32-byte/);
  });
});

describe("LLR-VV-005 retry on -32014", () => {
  it("treats code -32014 as retryable, at any depth", () => {
    assert.ok(isRetryable({ code: -32014 }));
    assert.ok(isRetryable(Object.assign(new Error("x"), { cause: { code: -32014 } })));
  });
  it("treats the message text as retryable too", () => {
    assert.ok(isRetryable(new Error("RPC error -32014: block not found")));
  });
  it("does not retry other errors", () => {
    assert.ok(!isRetryable(new Error("execution reverted")));
  });
  it("retries until the call succeeds", async () => {
    let n = 0;
    const v = await withRetry(async () => {
      if (++n < 3) throw { code: -32014 };
      return "ok";
    }, { sleep: async () => {} });
    assert.equal(v, "ok");
    assert.equal(n, 3);
  });
  it("gives up after the attempt limit and rethrows the last error", async () => {
    let n = 0;
    await assert.rejects(
      withRetry(async () => { n++; throw { code: -32014, message: "again" }; }, { attempts: 4, sleep: async () => {} }),
      (e) => e.message === "again",
    );
    assert.equal(n, 4);
  });
  it("does not retry a revert", async () => {
    let n = 0;
    await assert.rejects(withRetry(async () => { n++; throw new Error("execution reverted"); }, { sleep: async () => {} }));
    assert.equal(n, 1);
  });
});

describe("LLR-VV-005 revert decoding", () => {
  it("decodes a custom error found in a nested cause", () => {
    const err = revertError(encodeErrorResult({ abi: ABI, errorName: "NotSettleable", args: [1234n] }));
    assert.deepEqual(decodeRevert(err, ABI), { name: "NotSettleable", args: [1234n] });
  });
  it("decodes an error with no arguments", () => {
    assert.deepEqual(decodeRevert(revertError(encodeErrorResult({ abi: ABI, errorName: "AlreadySettled" })), ABI), { name: "AlreadySettled", args: undefined });
  });
  it("returns null when the failure carries no revert data", () => {
    assert.equal(decodeRevert(new Error("network down"), ABI), null);
  });
  it("returns null for data that matches no error in the ABI", () => {
    assert.equal(decodeRevert(revertError("0xdeadbeef"), ABI), null);
  });
  it("expectRevert passes on the named error and checks its arguments", async () => {
    const data = encodeErrorResult({ abi: ABI, errorName: "VerdictWindowClosed", args: [99n] });
    await expectRevert(async () => { throw revertError(data); }, ABI, "VerdictWindowClosed", [99n]);
  });
  it("expectRevert fails when the call succeeds", async () => {
    await assert.rejects(expectRevert(async () => "fine", ABI, "AlreadySettled"), /did not revert/);
  });
  it("expectRevert fails on a different error, naming both", async () => {
    const data = encodeErrorResult({ abi: ABI, errorName: "AlreadySettled" });
    await assert.rejects(expectRevert(async () => { throw revertError(data); }, ABI, "NotSettleable"), /NotSettleable.*AlreadySettled/s);
  });
  it("expectRevert fails on the right error with the wrong argument", async () => {
    const data = encodeErrorResult({ abi: ABI, errorName: "NotSettleable", args: [5n] });
    await assert.rejects(expectRevert(async () => { throw revertError(data); }, ABI, "NotSettleable", [6n]), /argument/);
  });
  it("expectRevert fails when the failure is not a revert at all", async () => {
    await assert.rejects(expectRevert(async () => { throw new Error("network down"); }, ABI, "AlreadySettled"), /not a revert|network down/);
  });
});

// A refusal is only evidence once it is mined with status 0, decodes to the named error when
// replayed at its own block, and leaves every watched balance and the locked total unchanged
// across that block. Each defect below must fail on exactly that check.
describe("LLR-VV-005 mined refusal", () => {
  function refusalWorld(over = {}) {
    const o = { status: "reverted", simData: encodeErrorResult({ abi: ABI, errorName: "NotSettleable", args: [500n] }), timestamp: 400n, contractAfter: 10n, lockedAfter: 10n, stakerAfter: 7n, beneficiaryAfter: 0n, gasUsed: 40_000n, ...over };
    const calls = { simulate: [], block: [] };
    const pub = {
      waitForTransactionReceipt: async () => ({ status: o.status, blockNumber: 100n, gasUsed: o.gasUsed }),
      getBlock: async (a) => {
        calls.block.push(a);
        return { timestamp: o.timestamp };
      },
      simulateContract: async (a) => {
        calls.simulate.push(a);
        if (o.simData) throw revertError(o.simData);
        return {};
      },
      readContract: async ({ functionName, args, blockNumber }) => {
        const after = blockNumber === 100n;
        if (functionName === "totalLocked") return after ? o.lockedAfter : 10n;
        const [who] = args;
        if (who === CONTRACT) return after ? o.contractAfter : 10n;
        if (who === OPERATOR) return after ? o.stakerAfter : 7n;
        if (who === BENEFICIARY) return after ? o.beneficiaryAfter : 0n;
        throw new Error(`unexpected read of ${who}`);
      },
    };
    const accounts = { staker: { address: OPERATOR }, referee: { address: REFEREE }, beneficiary: { address: BENEFICIARY }, settler: { address: SETTLER } };
    const evidence = new Evidence({ chainId: CHAIN_ID, contract: CONTRACT });
    const steps = makeSteps({ pub, accounts, abi: ABI, contract: CONTRACT, usdc: USDC, cirbtc: CIRBTC, evidence, retry: { sleep: async () => {} } });
    const spec = { journey: "UJ-44", who: "settler", functionName: "settle", args: [1n], errorName: "NotSettleable", errorArgs: [500n], description: "settle before the deadline refused", token: CIRBTC, deadline: 500n, timing: "before", gasLimit: 300_000n, submit: async () => TX };
    return { steps, spec, evidence, calls };
  }
  it("records the reverted transaction's hash, the error, and the block timestamp against the deadline", async () => {
    const { steps, spec, evidence, calls } = refusalWorld();
    await steps.refusal(spec);
    const [s] = evidence.toJSON().steps;
    assert.equal(s.tx, TX);
    assert.equal(s.error, "NotSettleable");
    assert.match(s.note, /block 100/);
    assert.match(s.note, /timestamp 400/);
    assert.match(s.note, /deadline 500/);
    assert.equal(calls.simulate[0].blockNumber, 100n);
    assert.equal(getAddress(calls.simulate[0].account), SETTLER);
  });
  it("fails when the transaction was mined with status success", async () => {
    const { steps, spec } = refusalWorld({ status: "success" });
    await assert.rejects(steps.refusal(spec), /revert/);
  });
  it("fails when the replay reverts with a different error", async () => {
    const { steps, spec } = refusalWorld({ simData: encodeErrorResult({ abi: ABI, errorName: "AlreadySettled" }) });
    await assert.rejects(steps.refusal(spec), /NotSettleable.*AlreadySettled/s);
  });
  it("fails when the replay does not revert", async () => {
    const { steps, spec } = refusalWorld({ simData: undefined });
    await assert.rejects(steps.refusal(spec), /did not revert/);
  });
  it("fails when the error carries the wrong argument", async () => {
    const { steps, spec } = refusalWorld();
    await assert.rejects(steps.refusal({ ...spec, errorArgs: [501n] }), /argument/);
  });
  it("fails when the contract's token balance moved across the block", async () => {
    const { steps, spec } = refusalWorld({ contractAfter: 9n });
    await assert.rejects(steps.refusal(spec), /contract/);
  });
  it("fails when the staker's token balance moved across the block", async () => {
    const { steps, spec } = refusalWorld({ stakerAfter: 8n });
    await assert.rejects(steps.refusal(spec), /staker/);
  });
  it("fails when the beneficiary's token balance moved across the block", async () => {
    const { steps, spec } = refusalWorld({ beneficiaryAfter: 1n });
    await assert.rejects(steps.refusal(spec), /beneficiary/);
  });
  it("fails when the locked total moved across the block", async () => {
    const { steps, spec } = refusalWorld({ lockedAfter: 0n });
    await assert.rejects(steps.refusal(spec), /totalLocked/);
  });
  it("fails a refusal expected before the deadline that was mined at it", async () => {
    const { steps, spec } = refusalWorld({ timestamp: 500n });
    await assert.rejects(steps.refusal(spec), /before the deadline/);
  });
  it("fails a refusal expected at or after the deadline that was mined before it", async () => {
    const { steps, spec } = refusalWorld({ timestamp: 499n, simData: encodeErrorResult({ abi: ABI, errorName: "VerdictWindowClosed", args: [500n] }) });
    await assert.rejects(steps.refusal({ ...spec, errorName: "VerdictWindowClosed", timing: "atOrAfter" }), /at or after the deadline/);
  });
  it("fails when the revert used the whole gas limit, which may be an out-of-gas", async () => {
    const { steps, spec } = refusalWorld({ gasUsed: 300_000n });
    await assert.rejects(steps.refusal(spec), /gas limit/);
  });
  it("fails when the revert used more than the gas limit", async () => {
    const { steps, spec } = refusalWorld({ gasUsed: 300_001n });
    await assert.rejects(steps.refusal(spec), /gas limit/);
  });
  it("fails when no gas limit is given, since the out-of-gas check cannot run", async () => {
    const { steps, spec } = refusalWorld();
    await assert.rejects(steps.refusal({ ...spec, gasLimit: undefined }), /gas limit/);
  });
  it("records what the script observed when it signed a held transaction", async () => {
    const { steps, spec, evidence } = refusalWorld();
    await steps.refusal({ ...spec, observed: { signedAt: 390n, nonce: 7 } });
    const [s] = evidence.toJSON().steps;
    assert.deepEqual(s.observed, { signedAtChainTime: "390", nonce: 7 });
    assert.match(s.note, /signed at chain time 390 with nonce 7/);
    assert.match(s.note, /own observation/);
    assert.match(s.note, /gas used 40000 of 300000/);
  });
  it("accepts a refusal mined exactly at the deadline when at or after is expected", async () => {
    const { steps, spec } = refusalWorld({ timestamp: 500n, simData: encodeErrorResult({ abi: ABI, errorName: "VerdictWindowClosed", args: [500n] }) });
    await steps.refusal({ ...spec, errorName: "VerdictWindowClosed", timing: "atOrAfter" });
  });
});

describe("LLR-VV-005 stake transfer in the create receipt", () => {
  const transferLog = (token, from, to, value) => ({
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
  const check = (logs, over = {}) => assertStakeTransfer({ logs, token: USDC, from: OPERATOR, to: CONTRACT, amount: 10_000n, ...over });
  it("accepts exactly one Transfer from the token, staker to contract, for the amount", () => {
    assert.doesNotThrow(() => check([transferLog(USDC, OPERATOR, CONTRACT, 10_000n)]));
  });
  it("ignores a Transfer emitted by another contract", () => {
    assert.doesNotThrow(() => check([transferLog(OTHER, OPERATOR, CONTRACT, 1n), transferLog(USDC, OPERATOR, CONTRACT, 10_000n)]));
  });
  it("fails when the token emitted no Transfer", () => {
    assert.throws(() => check([transferLog(OTHER, OPERATOR, CONTRACT, 10_000n)]), /exactly one/);
  });
  it("fails when the token emitted two Transfers", () => {
    const t = transferLog(USDC, OPERATOR, CONTRACT, 10_000n);
    assert.throws(() => check([t, t]), /exactly one/);
  });
  it("fails on the wrong amount, sender, or recipient", () => {
    assert.throws(() => check([transferLog(USDC, OPERATOR, CONTRACT, 9_999n)]), /Transfer amount was/);
    assert.throws(() => check([transferLog(USDC, OTHER, CONTRACT, 10_000n)]), /Transfer from was/);
    assert.throws(() => check([transferLog(USDC, OPERATOR, OTHER, 10_000n)]), /Transfer to was/);
  });
});

describe("LLR-VV-005 gas funding and sweep", () => {
  it("funds exactly the worst case of the planned calls plus a native transfer, with 25 percent margin", () => {
    assert.equal(fundingFor({ calls: 2, feeCap: 1000n, callGas: 300_000n }), ((2n * 300_000n + 21_000n) * 1000n * 125n) / 100n);
  });
  it("funds more for more calls", () => {
    assert.ok(fundingFor({ calls: 3, feeCap: 1000n, callGas: 300_000n }) > fundingFor({ calls: 2, feeCap: 1000n, callGas: 300_000n }));
  });
  it("sweeps the balance less the gas of the sweep itself", () => {
    assert.equal(sweepValue(1_000_000n, 10n), 1_000_000n - 21_000n * 10n);
  });
  it("sweeps nothing when the balance cannot pay for the sweep", () => {
    assert.equal(sweepValue(210_000n, 10n), 0n);
    assert.equal(sweepValue(5n, 10n), 0n);
  });
});

describe("LLR-VV-005 sweep back to the operator", () => {
  // Native and ERC-20 USDC are one balance on Arc, so the mock keeps one number per account.
  function sweepWorld({ failCirbtc = false } = {}) {
    const native = new Map([[REFEREE, 5_000_000n], [BENEFICIARY, 8_000_000n], [SETTLER, 3_000_000n], [OPERATOR, 0n]]);
    const sats = new Map([[BENEFICIARY, 20n], [OPERATOR, 100n]]);
    const sent = { transfers: [], natives: [] };
    const pub = {
      estimateFeesPerGas: async () => ({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n }),
      getBalance: async ({ address }) => native.get(address),
      readContract: async ({ address, args: [who] }) => (address === CIRBTC ? (sats.get(who) ?? 0n) : native.get(who)),
      waitForTransactionReceipt: async () => ({ status: "success" }),
    };
    const wallet = (account) => ({
      writeContract: async ({ address, functionName, args }) => {
        if (failCirbtc) throw new Error("cirBTC transfer failed");
        assert.equal(functionName, "transfer");
        sent.transfers.push({ token: address, from: account.address, args });
        sats.set(account.address, 0n);
        sats.set(args[0], sats.get(args[0]) + args[1]);
        return TX;
      },
      sendTransaction: async ({ to, value, gas, maxFeePerGas }) => {
        sent.natives.push({ from: account.address, to, value, gas, maxFeePerGas });
        native.set(account.address, native.get(account.address) - value - gas * maxFeePerGas);
        return TX;
      },
    });
    const accounts = { staker: { address: OPERATOR }, referee: { address: REFEREE }, beneficiary: { address: BENEFICIARY }, settler: { address: SETTLER } };
    const evidence = new Evidence({ chainId: CHAIN_ID, contract: CONTRACT });
    return { env: { pub, wallet, accounts, abi: ABI, contract: CONTRACT, usdc: USDC, cirbtc: CIRBTC, evidence, retry: { sleep: async () => {} } }, sent, evidence, native };
  }
  it("returns the beneficiary's cirBTC and every account's USDC to the operator, with a hash for each", async () => {
    const { env, sent, evidence, native } = sweepWorld();
    await sweepToOperator(env);
    assert.deepEqual(sent.transfers.map((t) => [t.token, t.from, t.args[0], t.args[1]]), [[CIRBTC, BENEFICIARY, OPERATOR, 20n]]);
    assert.deepEqual(sent.natives.map((n) => n.from).sort(), [REFEREE, BENEFICIARY, SETTLER].sort());
    assert.ok(sent.natives.every((n) => n.to === OPERATOR && n.gas === 21_000n));
    assert.equal(evidence.toJSON().steps.length, 4);
    for (const who of [REFEREE, BENEFICIARY, SETTLER]) assert.ok(native.get(who) >= 0n && native.get(who) < 21_000n * 13n, `${who} keeps only dust`);
  });
  it("does not move USDC as a token, which would take the gas needed to send it", async () => {
    const { env, sent } = sweepWorld();
    await sweepToOperator(env);
    assert.ok(sent.transfers.every((t) => t.token !== USDC));
  });
  it("still sweeps the native balances when the cirBTC transfer fails, then reports the failure", async () => {
    const { env, sent } = sweepWorld({ failCirbtc: true });
    await assert.rejects(sweepToOperator(env), /sweep incomplete.*cirBTC/s);
    assert.equal(sent.natives.length, 3);
  });
});

describe("LLR-VV-005 balance assertions", () => {
  it("passes on the exact delta", () => assert.doesNotThrow(() => assertBalanceDelta("staker", 100n, 110n, 10n)));
  it("passes on a negative delta", () => assert.doesNotThrow(() => assertBalanceDelta("contract", 10n, 0n, -10n)));
  it("passes on zero when nothing may move", () => assert.doesNotThrow(() => assertBalanceDelta("x", 5n, 5n, 0n)));
  it("fails when the delta is one unit short, naming the account", () => {
    assert.throws(() => assertBalanceDelta("beneficiary", 100n, 109n, 10n), /beneficiary/);
  });
  it("fails when the delta is one unit over", () => {
    assert.throws(() => assertBalanceDelta("beneficiary", 100n, 111n, 10n));
  });
});

describe("LLR-VV-005 evidence", () => {
  const sample = () => {
    const e = new Evidence({ chainId: CHAIN_ID, contract: "0x3Ae26b15B9085ddB223FfEb503B4f713e682Cac4" });
    e.account("referee", "0x00000000000000000000000000000000000000a1");
    e.step("UJ-10", "createPledge cirBTC", { tx: TX, note: "id 7" });
    e.step("UJ-44", "settle before the deadline refused", { tx: "0x" + "34".repeat(32), error: "NotSettleable" });
    return e;
  };
  it("names the requirement it evidences in the record and the markdown", () => {
    assert.equal(sample().toJSON().requirement, "LLR-VV-005");
    assert.ok(renderEvidence(sample().toJSON()).includes("LLR-VV-005"));
  });
  it("builds the explorer link for a transaction", () => {
    assert.equal(explorerTx(TX), `https://explorer.testnet.arc.io/tx/${TX}`);
  });
  it("keeps steps in order with their journey and hash", () => {
    const j = sample().toJSON();
    assert.equal(j.steps.length, 2);
    assert.deepEqual([j.steps[0].journey, j.steps[0].tx], ["UJ-10", TX]);
    assert.equal(j.steps[1].error, "NotSettleable");
  });
  it("records an account's address and drops everything else it carries", () => {
    const e = new Evidence({ chainId: CHAIN_ID, contract: CONTRACT });
    e.account("staker", { address: OPERATOR, privateKey: KEY, source: "privateKey" });
    const json = JSON.stringify(e.toJSON());
    assert.ok(json.includes(OPERATOR));
    assert.ok(!json.toLowerCase().includes(KEY.slice(2)));
    assert.ok(!renderEvidence(e.toJSON()).toLowerCase().includes(KEY.slice(2)));
  });
  it("never lets a key reach the evidence of a whole run", async () => {
    const { env, evidence } = world({ dryRun: true });
    await runE2E(env);
    const text = JSON.stringify(evidence.toJSON()) + renderEvidence(evidence.toJSON());
    assert.ok(text.includes(OPERATOR), "the run should have recorded the staker address");
    assert.ok(!text.toLowerCase().includes(KEY.slice(2).toLowerCase()));
    assert.ok(!/privatekey/i.test(text));
  });
  it("rejects a malformed transaction hash", () => {
    assert.throws(() => sample().step("UJ-10", "x", { tx: "0x12" }), /not a transaction hash/);
  });
  it("lists every hash with its link in the markdown", () => {
    const md = renderEvidence(sample().toJSON());
    assert.ok(md.includes(TX));
    assert.ok(md.includes(explorerTx(TX)));
    assert.ok(md.includes("UJ-44"));
  });
  it("contains no em dash and no local path", () => {
    const md = renderEvidence(sample().toJSON());
    assert.ok(!md.includes(String.fromCharCode(0x2014)));
    assert.ok(!/\/Users\/|\/home\//.test(md));
  });
  it("states the journeys it covers as passed only when marked so", () => {
    const e = sample();
    assert.ok(!renderEvidence(e.toJSON()).includes("Result: pass"));
    assert.ok(renderEvidence(e.toJSON()).includes("Result: incomplete"));
    e.finish(true);
    assert.ok(renderEvidence(e.toJSON()).includes("Result: pass"));
    e.finish(false);
    assert.ok(renderEvidence(e.toJSON()).includes("Result: fail"));
  });
});

describe("LLR-VV-005 a wallet bridge sends only to SatStake and its tokens", () => {
  const allowed = [CONTRACT, CIRBTC, USDC];

  it("accepts each allowed target in any letter case", () => {
    for (const to of allowed) {
      assert.equal(allowedSendTarget(to, allowed), true);
      assert.equal(allowedSendTarget(to.toLowerCase(), allowed), true);
    }
  });

  it("refuses any other address, a missing target, and a malformed one", () => {
    assert.equal(allowedSendTarget(OTHER, allowed), false);
    assert.equal(allowedSendTarget(OPERATOR, allowed), false);
    assert.equal(allowedSendTarget(undefined, allowed), false);
    assert.equal(allowedSendTarget(null, allowed), false);
    assert.equal(allowedSendTarget("", allowed), false);
    assert.equal(allowedSendTarget("0x1234", allowed), false);
    assert.equal(allowedSendTarget("not an address", allowed), false);
  });

  it("refuses everything when nothing is allowed", () => {
    assert.equal(allowedSendTarget(CONTRACT, []), false);
  });
});
