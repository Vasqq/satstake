/**
 * Logic behind the live testnet script (LLR-VV-005), kept apart from the network calls so that
 * what decides safety and honesty can be tested with stubs: the chain guard, key and argument
 * parsing, the retry rule, revert decoding, balance assertions, and the evidence record.
 */
import { decodeErrorResult, encodeFunctionData, erc20Abi, getAddress, parseEventLogs } from "viem";

export const CHAIN_ID = 5042002;
export const EXPLORER = "https://explorer.testnet.arc.io";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

export function explorerTx(hash) {
  return `${EXPLORER}/tx/${hash}`;
}

// The script holds a funded key. A wrong network must stop it before anything is signed.
export function assertChainId(actual) {
  let id;
  try {
    id = BigInt(actual);
  } catch {
    throw new Error(`refusing to run: chain id ${String(actual)} is not a number, expected ${CHAIN_ID}`);
  }
  if (id !== BigInt(CHAIN_ID)) {
    throw new Error(`refusing to run: chain id ${id}, expected ${CHAIN_ID} (Arc testnet)`);
  }
}

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (const a of argv) {
    if (a === "--dry-run") out.dryRun = true;
    else throw new Error(`unknown argument ${a}; the only option is --dry-run`);
  }
  return out;
}

// Messages never include file content: a failure here must not leak the key into a log.
export function parseEnvKey(text) {
  const line = text.split("\n").find((l) => l.startsWith("TESTNET_PRIVATE_KEY="));
  if (!line) throw new Error("TESTNET_PRIVATE_KEY is missing from .env");
  const value = line.slice("TESTNET_PRIVATE_KEY=".length).trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("TESTNET_PRIVATE_KEY in .env is not a 32-byte hex key");
  return value;
}

// A browser wallet bridge that holds a funded key signs whatever a page asks. Limiting the target to
// SatStake and its tokens means a page that went wrong cannot move the key's funds anywhere else.
export function allowedSendTarget(to, allowed) {
  if (typeof to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(to)) return false;
  return allowed.some((a) => a.toLowerCase() === to.toLowerCase());
}

function* causes(err) {
  const seen = new Set();
  for (let e = err; e && typeof e === "object" && !seen.has(e); e = e.cause) {
    seen.add(e);
    yield e;
  }
}

// Arc's public RPC answers -32014 for state it has not yet indexed (01 V-10, V-11).
export function isRetryable(err) {
  for (const e of causes(err)) {
    if (e.code === -32014) return true;
    if (typeof e.message === "string" && e.message.includes("-32014")) return true;
  }
  return false;
}

export async function withRetry(fn, { attempts = 8, delayMs = 750, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let n = 1; ; n++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || n >= attempts) throw err;
      await sleep(delayMs * n);
    }
  }
}

export function decodeRevert(err, abi) {
  for (const e of causes(err)) {
    for (const field of [e.data, e.raw]) {
      if (typeof field !== "string" || !field.startsWith("0x")) continue;
      try {
        const { errorName, args } = decodeErrorResult({ abi, data: field });
        return { name: errorName, args };
      } catch {
        // Not data for an error in this ABI; keep looking down the cause chain.
      }
    }
  }
  return null;
}

// A refusal only counts as evidence if it is the contract's own named error, so a network fault
// or an out-of-gas cannot pass as a rejected action.
export async function expectRevert(fn, abi, name, args) {
  let result;
  try {
    result = await fn();
  } catch (err) {
    const decoded = decodeRevert(err, abi);
    if (!decoded) throw new Error(`expected ${name} but the failure was not a revert with a known error: ${err.shortMessage ?? err.message}`);
    if (decoded.name !== name) throw new Error(`expected ${name} but the call reverted with ${decoded.name}`);
    if (args) {
      const got = decoded.args ?? [];
      args.forEach((want, i) => {
        if (got[i] !== want) throw new Error(`${name} argument ${i} was ${got[i]}, expected ${want}`);
      });
    }
    return decoded;
  }
  throw new Error(`expected ${name} but the call did not revert (returned ${String(result)})`);
}

export function assertBalanceDelta(label, before, after, expected) {
  const delta = after - before;
  if (delta !== expected) throw new Error(`${label}: balance moved by ${delta}, expected ${expected}`);
}

// LLR-SC-020 says creation pulls the stake once; the receipt is where that is visible from the
// staker's side, so the script reads it there rather than inferring it from a balance.
export function assertStakeTransfer({ logs, token, from, to, amount }) {
  const own = parseEventLogs({ abi: erc20Abi, logs, eventName: "Transfer" }).filter((l) => getAddress(l.address) === getAddress(token));
  if (own.length !== 1) throw new Error(`expected exactly one Transfer from ${token}, saw ${own.length}`);
  const { args } = own[0];
  if (getAddress(args.from) !== getAddress(from)) throw new Error(`Transfer from was ${args.from}, expected ${from}`);
  if (getAddress(args.to) !== getAddress(to)) throw new Error(`Transfer to was ${args.to}, expected ${to}`);
  if (args.value !== amount) throw new Error(`Transfer amount was ${args.value}, expected ${amount}`);
}

// A third party who triggers a settlement must be paid nothing. Native gas makes the settler's
// USDC balance change, so for USDC the receipt's logs are the evidence and not the balance.
export function assertNoTransferTo({ logs, who, label }) {
  const hits = parseEventLogs({ abi: erc20Abi, logs, eventName: "Transfer" }).filter((l) => getAddress(l.args.to) === getAddress(who));
  if (hits.length > 0) throw new Error(`the settle receipt has ${hits.length} Transfer to the ${label} ${who}, expected none`);
}

// Gas is paid in USDC, so a throwaway account needs the worst case of its own transactions and
// nothing more; the margin covers a fee that rises while the run is going.
export const CALL_GAS = 300_000n;
const NATIVE_GAS = 21_000n;

export function fundingFor({ calls, feeCap, callGas = CALL_GAS }) {
  return ((BigInt(calls) * callGas + NATIVE_GAS) * feeCap * 125n) / 100n;
}

// A native transfer is only accepted if the balance covers its value and its full fee cap.
export function sweepValue(balance, feeCap) {
  const value = balance - NATIVE_GAS * feeCap;
  return value > 0n ? value : 0n;
}

const STATE = { Active: 0, Expired: 1, Kept: 2, Broken: 3, SettledToStaker: 4, SettledToBeneficiary: 5 };

function check(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

export function makeSteps(env) {
  const { pub, accounts, abi, contract, evidence, retry } = env;
  const read = (fn) => withRetry(fn, retry);
  const balanceOf = (token, who, blockNumber) => read(() => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who], blockNumber }));
  const view = (functionName, args = [], blockNumber) => read(() => pub.readContract({ address: contract, abi, functionName, args, blockNumber }));
  const latestTimestamp = async () => (await read(() => pub.getBlock())).timestamp;

  // A refusal is evidence only when it is a real mined transaction: status reverted, the contract's
  // own named error when the same call is replayed at that block, and no balance or locked total
  // different across the block. `staker` is compared in the pledge's token, which is cirBTC for
  // every refusal, so the gas the sender pays in USDC cannot disturb it.
  //
  // The replay runs against the state at the end of the block, not the state the mined transaction
  // saw, so it cannot prove which check fired inside that block. Three things stand in for that:
  // the revert is not an out-of-gas (gasUsed is below the explicit limit), the replay decodes to
  // the named error, and the timing and balance checks hold across the block.
  async function refusal({ journey, who, functionName, args, errorName, errorArgs, description, token, deadline, timing, submit, gasLimit, observed }) {
    const hash = await submit();
    const receipt = await read(() => pub.waitForTransactionReceipt({ hash }));
    if (receipt.status !== "reverted") throw new Error(`${description}: mined with status ${receipt.status}, expected reverted`);
    if (typeof gasLimit !== "bigint" || receipt.gasUsed >= gasLimit) {
      throw new Error(`${description}: used ${receipt.gasUsed} of a ${gasLimit} gas limit, so the revert may be an out-of-gas and not the contract's refusal`);
    }
    await expectRevert(
      () => read(() => pub.simulateContract({ address: contract, abi, functionName, args, account: accounts[who].address, blockNumber: receipt.blockNumber })),
      abi,
      errorName,
      errorArgs,
    );
    const block = await read(() => pub.getBlock({ blockNumber: receipt.blockNumber }));
    if (timing === "before" && !(block.timestamp < deadline)) throw new Error(`${description}: mined at timestamp ${block.timestamp}, not before the deadline ${deadline}`);
    if (timing === "atOrAfter" && !(block.timestamp >= deadline)) throw new Error(`${description}: mined at timestamp ${block.timestamp}, not at or after the deadline ${deadline}`);
    const at = async (blockNumber) => ({
      contract: await balanceOf(token, contract, blockNumber),
      staker: await balanceOf(token, accounts.staker.address, blockNumber),
      beneficiary: await balanceOf(token, accounts.beneficiary.address, blockNumber),
      totalLocked: await view("totalLocked", [token], blockNumber),
    });
    const before = await at(receipt.blockNumber - 1n);
    const after = await at(receipt.blockNumber);
    for (const k of Object.keys(before)) assertBalanceDelta(`refused ${functionName}: ${k}`, before[k], after[k], 0n);
    const seen = observed ? `; signed at chain time ${observed.signedAt} with nonce ${observed.nonce}, the script's own observation` : "";
    evidence.step(journey, description, {
      tx: hash,
      error: errorName,
      note: `reverted in block ${receipt.blockNumber} at timestamp ${block.timestamp}, deadline ${deadline}, gas used ${receipt.gasUsed} of ${gasLimit}${seen}`,
      observed: observed ? { signedAtChainTime: String(observed.signedAt), nonce: Number(observed.nonce) } : undefined,
    });
    return { hash, receipt, block };
  }

  return { read, balanceOf, view, latestTimestamp, refusal };
}

async function sendNativeFrom(env, from, to, value, extra = {}) {
  const hash = await env.wallet(from).sendTransaction({ to, value, ...extra });
  const receipt = await withRetry(() => env.pub.waitForTransactionReceipt({ hash }), env.retry);
  check(receipt.status === "success", "native transfer reverted");
  return hash;
}

// Returns whatever the throwaway accounts hold to the operator. USDC is Arc's gas token and its
// ERC-20 balance is the same balance as the native one, so it leaves through the native transfers
// and not as a token transfer, which would try to move the gas along with it. One failed step
// does not stop the others, since the accounts' keys exist only in this process.
export async function sweepToOperator(env) {
  const { pub, wallet, accounts, cirbtc, evidence } = env;
  const { read, balanceOf } = makeSteps(env);
  const operator = accounts.staker;
  const f = await read(() => pub.estimateFeesPerGas());
  const cap = (f.maxFeePerGas * 13n) / 10n;
  const failures = [];
  const attempt = async (what, fn) => {
    try {
      await fn();
    } catch (err) {
      failures.push(`${what}: ${err.shortMessage ?? err.message}`);
    }
  };
  await attempt("cirBTC", async () => {
    const held = await balanceOf(cirbtc, accounts.beneficiary.address);
    if (held === 0n) return;
    const operatorBefore = await balanceOf(cirbtc, operator.address);
    const hash = await wallet(accounts.beneficiary).writeContract({ address: cirbtc, abi: erc20Abi, functionName: "transfer", args: [operator.address, held] });
    const receipt = await read(() => pub.waitForTransactionReceipt({ hash }));
    check(receipt.status === "success", "sweep of cirBTC reverted");
    assertBalanceDelta("sweep of cirBTC: operator", operatorBefore, await balanceOf(cirbtc, operator.address), held);
    check((await balanceOf(cirbtc, accounts.beneficiary.address)) === 0n, "beneficiary still holds cirBTC");
    evidence.step("sweep", `beneficiary returns ${held} units of cirBTC to the operator`, { tx: hash });
  });
  for (const role of ["referee", "beneficiary", "settler"]) {
    await attempt(role, async () => {
      const balance = await read(() => pub.getBalance({ address: accounts[role].address }));
      const value = sweepValue(balance, cap);
      if (value === 0n) return;
      const hash = await sendNativeFrom(env, accounts[role], operator.address, value, { gas: NATIVE_GAS, maxFeePerGas: cap, maxPriorityFeePerGas: f.maxPriorityFeePerGas });
      const left = await read(() => pub.getBalance({ address: accounts[role].address }));
      evidence.step("sweep", `${role} returns its remaining USDC to the operator`, { tx: hash, note: `${left} native units left, the unspent margin of the fee cap` });
    });
  }
  if (failures.length > 0) throw new Error(`sweep incomplete: ${failures.join("; ")}`);
}

// The whole run, with every network client injected, so that the order of guard and signing is
// the same code in the test as on the network.
export async function runE2E(env) {
  const { pub, wallet, accounts, abi, contract, usdc, cirbtc, evidence, dryRun, sleep, log = () => {} } = env;
  const steps = makeSteps(env);
  const { read, balanceOf, view, latestTimestamp, refusal } = steps;
  const operator = accounts.staker;
  const CIRBTC_AMOUNT = 10n; // sats
  const USDC_AMOUNT = 10_000n; // 0.01 USDC
  const LONG_DEADLINE = 3600n;
  const EXPIRY_DEADLINE = 150n; // above the 60 s minimum, with room for the setup to finish first

  assertChainId(await read(() => pub.getChainId()));
  check((await read(() => pub.getCode({ address: contract })))?.length > 2, "no contract code at the deployment address");
  for (const [role, a] of Object.entries(accounts)) evidence.account(role, a);

  const fees = await read(() => pub.estimateFeesPerGas());
  const feeCap = fees.maxFeePerGas * 2n;
  const callsFor = { referee: 5, beneficiary: 4, settler: 2 }; // verdicts and held sends; settles and sweep transfers; settle and refusal
  const funding = Object.fromEntries(Object.entries(callsFor).map(([role, calls]) => [role, fundingFor({ calls, feeCap })]));
  const totalFunding = Object.values(funding).reduce((a, b) => a + b, 0n);

  const operatorGas = await read(() => pub.getBalance({ address: operator.address }));
  const operatorSats = await balanceOf(cirbtc, operator.address);
  log(`operator ${operator.address}: ${operatorGas} native units (18 decimals), ${operatorSats} sats; funding ${totalFunding} for the throwaway accounts`);
  check(operatorGas > totalFunding + fundingFor({ calls: 12, feeCap }), "operator holds too little USDC for gas and funding");
  check(operatorSats >= CIRBTC_AMOUNT * 3n, "operator holds too little cirBTC");
  check((await balanceOf(usdc, operator.address)) >= USDC_AMOUNT, "operator holds too little USDC for the USDC pledge");
  if (dryRun) {
    log("dry run: chain, contract code, and balances check out; nothing sent");
    return;
  }

  async function send(who, request) {
    const hash = await wallet(accounts[who]).writeContract({ address: contract, abi, ...request });
    const receipt = await read(() => pub.waitForTransactionReceipt({ hash }));
    check(receipt.status === "success", `${request.functionName} by ${who} reverted on chain`);
    return { hash, receipt };
  }

  const sendNative = (from, to, value, extra) => sendNativeFrom(env, from, to, value, extra);

  async function approve(token, amount) {
    const hash = await wallet(operator).writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [contract, amount] });
    const receipt = await read(() => pub.waitForTransactionReceipt({ hash }));
    check(receipt.status === "success", "approve reverted");
    const allowance = await read(() => pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [operator.address, contract] }));
    check(allowance === amount, `allowance is ${allowance}, expected exactly ${amount}`);
    return hash;
  }

  // The staker's balance of USDC is not asserted because the staker pays gas in USDC; the
  // contract's balance and the Transfer in the receipt are exact.
  async function create({ journey, label, token, amount, text, deadlineIn }) {
    const lockedBefore = await view("totalLocked", [token]);
    const heldBefore = await balanceOf(token, contract);
    const stakerBefore = await balanceOf(token, operator.address);
    const deadline = (await latestTimestamp()) + deadlineIn;
    evidence.step(journey, `${label}: approve exactly ${amount}`, { tx: await approve(token, amount) });
    const { hash, receipt } = await send("staker", {
      functionName: "createPledge",
      args: [token, amount, accounts.referee.address, accounts.beneficiary.address, deadline, text],
    });
    assertStakeTransfer({ logs: receipt.logs, token, from: operator.address, to: contract, amount });
    const [created] = parseEventLogs({ abi, logs: receipt.logs, eventName: "PledgeCreated" });
    check(created, "no PledgeCreated event");
    const id = created.args.id;
    const p = await view("getPledge", [id]);
    check(getAddress(p.staker) === operator.address && getAddress(p.token) === token, `${label}: staker and token recorded`);
    check(p.amount === amount && p.deadline === deadline && p.promiseText === text, `${label}: amount, deadline, text recorded`);
    check(getAddress(p.referee) === accounts.referee.address && getAddress(p.beneficiary) === accounts.beneficiary.address, `${label}: parties recorded`);
    check((await view("stateOf", [id])) === STATE.Active, `${label}: state is Active`);
    assertBalanceDelta(`${label}: contract ${token}`, heldBefore, await balanceOf(token, contract), amount);
    assertBalanceDelta(`${label}: totalLocked`, lockedBefore, await view("totalLocked", [token]), amount);
    if (token === cirbtc) assertBalanceDelta(`${label}: staker`, stakerBefore, await balanceOf(token, operator.address), -amount);
    evidence.step(journey, `${label}: createPledge, pledge ${id} Active; one Transfer of ${amount} from the staker to the contract in its receipt`, { tx: hash, note: `deadline ${deadline}` });
    return { id, deadline, token, amount };
  }

  const stateIs = async (pledge, name) => check((await view("stateOf", [pledge.id])) === STATE[name], `pledge ${pledge.id} is ${name}`);

  async function verdict(journey, pledge, kept) {
    const { hash } = await send("referee", { functionName: kept ? "markKept" : "markBroken", args: [pledge.id] });
    await stateIs(pledge, kept ? "Kept" : "Broken");
    evidence.step(journey, `referee marks pledge ${pledge.id} ${kept ? "kept" : "broken"}`, { tx: hash });
  }

  // Settles as `who` and asserts the recipient gains exactly the amount, the contract loses it,
  // and a settler who is not the recipient gains nothing.
  async function settle(journey, who, pledge, recipient, finalState, note) {
    const { token, amount } = pledge;
    const recipientBefore = await balanceOf(token, recipient);
    const settlerBefore = await balanceOf(token, accounts[who].address);
    const heldBefore = await balanceOf(token, contract);
    const lockedBefore = await view("totalLocked", [token]);
    const { hash, receipt } = await send(who, { functionName: "settle", args: [pledge.id] });
    if (accounts[who].address !== recipient) assertNoTransferTo({ logs: receipt.logs, who: accounts[who].address, label: "settler" });
    assertBalanceDelta(`pledge ${pledge.id} recipient`, recipientBefore, await balanceOf(token, recipient), amount);
    if (accounts[who].address !== recipient && token === cirbtc) {
      assertBalanceDelta(`pledge ${pledge.id} settler`, settlerBefore, await balanceOf(token, accounts[who].address), 0n);
    }
    assertBalanceDelta(`pledge ${pledge.id} contract`, heldBefore, await balanceOf(token, contract), -amount);
    assertBalanceDelta(`pledge ${pledge.id} totalLocked`, lockedBefore, await view("totalLocked", [token]), -amount);
    await stateIs(pledge, finalState);
    evidence.step(journey, `${who} settles pledge ${pledge.id}, ${finalState}`, { tx: hash, note });
  }

  // Explicit gas skips estimation, which would otherwise refuse to send a call that must revert.
  const refusedSend = (who, pledge, functionName, errorName, errorArgs, description, timing, journey) =>
    refusal({
      journey,
      who,
      functionName,
      args: [pledge.id],
      errorName,
      errorArgs,
      description,
      token: pledge.token,
      deadline: pledge.deadline,
      timing,
      gasLimit: CALL_GAS,
      submit: () => wallet(accounts[who]).writeContract({ address: contract, abi, functionName, args: [pledge.id], gas: CALL_GAS }),
    });

  const sweep = () => sweepToOperator(env);

  let fundingStarted = false;
  try {
    log("funding throwaway accounts with gas");
    fundingStarted = true;
    for (const role of ["referee", "beneficiary", "settler"]) {
      evidence.step("setup", `fund ${role} with gas`, { tx: await sendNative(operator, accounts[role].address, funding[role]), note: `${funding[role]} native units` });
    }

    // The expiring pledge is created first so its wait overlaps the other journeys.
    const expiring = await create({ journey: "UJ-42", label: "expiring cirBTC pledge", token: cirbtc, amount: CIRBTC_AMOUNT, text: "e2e: expires with no verdict", deadlineIn: EXPIRY_DEADLINE });
    const kept = await create({ journey: "UJ-10", label: "cirBTC pledge to be kept", token: cirbtc, amount: CIRBTC_AMOUNT, text: "e2e: kept promise", deadlineIn: LONG_DEADLINE });
    const brokenUsdc = await create({ journey: "UJ-11", label: "USDC pledge to be broken", token: usdc, amount: USDC_AMOUNT, text: "e2e: broken promise in USDC", deadlineIn: LONG_DEADLINE });
    const brokenBtc = await create({ journey: "UJ-10", label: "cirBTC pledge to be broken", token: cirbtc, amount: CIRBTC_AMOUNT, text: "e2e: broken promise in cirBTC", deadlineIn: LONG_DEADLINE });

    await refusedSend("settler", kept, "settle", "NotSettleable", [kept.deadline], `settle on active pledge ${kept.id} before its deadline refused`, "before", "UJ-44");

    await verdict("UJ-30", kept, true);
    await verdict("UJ-31", brokenUsdc, false);
    await verdict("UJ-31", brokenBtc, false);

    await settle("UJ-40", "staker", kept, operator.address, "SettledToStaker", "kept stake back to the staker");
    await refusedSend("staker", kept, "settle", "AlreadySettled", undefined, `second settle on pledge ${kept.id} refused, no balance moved`, undefined, "UJ-45");

    await settle("UJ-43", "settler", brokenUsdc, accounts.beneficiary.address, "SettledToBeneficiary", "third party triggers; the beneficiary receives, the settler receives nothing");
    await settle("UJ-41", "beneficiary", brokenBtc, accounts.beneficiary.address, "SettledToBeneficiary", "beneficiary claims a broken stake");

    // UJ-32: both verdicts are signed in time and broadcast after the deadline, which stands in
    // for a transaction sent in time and mined too late.
    const signedAt = await latestTimestamp();
    check(signedAt < expiring.deadline, `chain time ${signedAt} already reached the deadline ${expiring.deadline}; the held verdicts cannot be signed in time`);
    const startNonce = await read(() => pub.getTransactionCount({ address: accounts.referee.address, blockTag: "pending" }));
    const held = [];
    for (const [i, functionName] of ["markKept", "markBroken"].entries()) {
      const signed = await accounts.referee.signTransaction({
        type: "eip1559",
        chainId: CHAIN_ID,
        to: contract,
        data: encodeFunctionData({ abi, functionName, args: [expiring.id] }),
        value: 0n,
        nonce: startNonce + i,
        gas: CALL_GAS,
        maxFeePerGas: feeCap,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      held.push({ functionName, signed, nonce: startNonce + i });
    }

    log(`waiting for chain time to reach ${expiring.deadline}`);
    while ((await latestTimestamp()) < expiring.deadline) await sleep(5000);
    await stateIs(expiring, "Expired");
    evidence.step("UJ-42", `pledge ${expiring.id} reads Expired once chain time reaches the deadline`, { note: `signed at chain time ${signedAt}, deadline ${expiring.deadline}` });
    for (const h of held) {
      await refusal({
        journey: "UJ-32",
        who: "referee",
        functionName: h.functionName,
        args: [expiring.id],
        errorName: "VerdictWindowClosed",
        errorArgs: [expiring.deadline],
        description: `${h.functionName} on pledge ${expiring.id}, signed before the deadline and broadcast after it, refused`,
        token: expiring.token,
        deadline: expiring.deadline,
        timing: "atOrAfter",
        gasLimit: CALL_GAS,
        observed: { signedAt, nonce: h.nonce },
        submit: () => read(() => pub.sendRawTransaction({ serializedTransaction: h.signed })),
      });
    }
    await settle("UJ-42", "beneficiary", expiring, accounts.beneficiary.address, "SettledToBeneficiary", "expired stake claimed by the beneficiary");
  } catch (err) {
    if (fundingStarted) {
      try {
        await sweep();
      } catch (sweepErr) {
        log(`sweep after failure did not complete: ${sweepErr.shortMessage ?? sweepErr.message}`);
      }
    }
    throw err;
  }
  await sweep();
  evidence.finish(true);
}

export class Evidence {
  #data;
  constructor({ chainId, contract }) {
    this.#data = { requirement: "LLR-VV-005", chainId, contract, accounts: {}, steps: [], result: "incomplete" };
  }
  // Takes the whole account object and keeps only its address, so a key carried by it has no way
  // into the record.
  account(role, account) {
    const address = typeof account === "string" ? account : account?.address;
    if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`not an address: ${role}`);
    this.#data.accounts[role] = address;
  }
  step(journey, description, { tx, note, error, observed } = {}) {
    if (tx !== undefined && !HASH_RE.test(tx)) throw new Error(`not a transaction hash: ${tx}`);
    const s = { journey, description };
    if (observed !== undefined) s.observed = observed;
    if (tx !== undefined) s.tx = tx;
    if (note !== undefined) s.note = note;
    if (error !== undefined) s.error = error;
    this.#data.steps.push(s);
  }
  finish(passed) {
    this.#data.result = passed ? "pass" : "fail";
  }
  toJSON() {
    return structuredClone(this.#data);
  }
}

export function renderEvidence(d) {
  const lines = [
    "# Live testnet run",
    "",
    `This is the evidence for ${d.requirement}: every journey it names, run on Arc testnet with real tokens, with the hash of every transaction.`,
    "",
    `Chain ${d.chainId}. Contract \`${d.contract}\`.`,
    "",
    `Result: ${d.result}`,
    "",
    "## Accounts",
    "",
    "| Role | Address |",
    "|---|---|",
    ...Object.entries(d.accounts).map(([role, a]) => `| ${role} | \`${a}\` |`),
    "",
    "## Steps",
    "",
    "| Journey | Step | Transaction | Note |",
    "|---|---|---|---|",
    ...d.steps.map((s) => {
      const tx = s.tx ? `[\`${s.tx}\`](${explorerTx(s.tx)})` : "none (read only)";
      const note = [s.note, s.error ? `reverted with ${s.error}` : undefined].filter(Boolean).join("; ");
      return `| ${s.journey} | ${s.description} | ${tx} | ${note} |`;
    }),
    "",
  ];
  return lines.join("\n");
}

// Hashes already sent are public and worth keeping when a later step fails, since the funds they
// moved are real. The error text is the only thing added to the record.
export function recordFailure(evidence, err, writeFile) {
  evidence.finish(false);
  const data = { ...evidence.toJSON(), error: String(err?.shortMessage ?? err?.message ?? err) };
  writeFile(`${JSON.stringify(data, null, 2)}\n`);
  return data;
}
