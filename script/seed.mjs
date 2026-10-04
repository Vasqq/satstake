#!/usr/bin/env node
/**
 * Seeds a SatStake deployment with four example pledges, in three phases (LLR-DP-009):
 *
 *   create    the staker approves what the pledges still to create lock, then creates them
 *   verdicts  the referee marks the first kept and the third broken
 *   settle    any account settles the first, the second once it has expired, and the third
 *
 * Usage: node script/seed.mjs <create|verdicts|settle> --account <keystore> --password-file <path> [--send]
 *        node script/seed.mjs <phase> --testnet (--keystore <path> | --account <keystore>) --password-file <path> [--send]
 *
 * The first form is the Arc mainnet seed: fixed roles, `deployments/5042.json`, `deployments/config/5042.json`,
 * 1000 sats and 1 USDC per pledge. `--testnet` selects a rehearsal on Arc testnet instead, which reads a
 * rehearsal record and its roles from the gitignored `cache/seed-rehearsal/` and locks a tenth of the amounts.
 * Each plan names its own chain and every file it reads, and neither can reach the other's: the rehearsal
 * never reads a mainnet file, and the mainnet plan has no option that changes what it reads.
 *
 * Without --send nothing is sent: every transaction is only simulated. This is a Node tool and not a
 * Foundry script because Arc's USDC moves value through system precompiles that Foundry's EVM does
 * not have, so `forge script` cannot simulate a USDC transfer. `cast call` runs against the live
 * chain, whose node has the real precompiles, so each transaction is simulated there with the same
 * sender and calldata it would be sent with, and sent with `cast send` only if that succeeds
 * (LLR-DP-012). Gas is estimated by `cast`, so no limit comes from anywhere but Arc.
 *
 * The tool never reads the password file and never receives a key: `cast` takes the keystore and
 * the file path (LLR-DP-003). The pledges are found by identifier 1 to 4, which a fresh deployment
 * assigns in order. `create` refuses a contract that holds anything but a prefix of the seed, resumes
 * after that prefix, and approves only what the rest locks, so an interrupted run can be repeated;
 * every later phase compares each pledge with the seed before it acts.
 *
 * @trace LLR-DP-002 LLR-DP-003 LLR-DP-009 LLR-DP-012
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeFunctionResult, encodeFunctionData, getAddress, isAddress, parseAbi } from "viem";

const DAY = 86400;

const PLEDGES = [
  { id: 1, symbol: "cirBTC", deadline: { after: 7 * DAY }, text: "Walk for thirty minutes every day this week." },
  { id: 2, symbol: "USDC", deadline: { expiry: true }, text: "Send the draft to the editor before the deadline." },
  { id: 3, symbol: "USDC", deadline: { after: 7 * DAY }, text: "Cook dinner at home on all five weekdays." },
  // 2026-11-01T00:00:00Z.
  { id: 4, symbol: "cirBTC", deadline: { at: 1793491200 }, text: "Publish the first release notes by the end of October." },
];

// 1000 sats is 0.00001 BTC and 1 USDC is 1 USD: 2 USDC plus 2000 sats is 5 USD or less up to a
// bitcoin price of 150,000 USD, under the 5 USD cap of LLR-DP-009. The rehearsal locks a tenth.
const MAINNET_AMOUNTS = { cirBTC: 1000n, USDC: 1000000n };
const TESTNET_AMOUNTS = { cirBTC: 100n, USDC: 100000n };
const withAmounts = (amounts) => PLEDGES.map((p) => ({ ...p, amount: amounts[p.symbol] }));

/** The mainnet seed: who plays each role, and the four pledges (LLR-DP-009). */
export const SEED = {
  chainId: 5042,
  staker: "0xd1728F74Ac083a0F9B41a3Ec16ed3A25af33809f",
  referee: "0x0Fb1b0C69dD6bD29C8Ec3057a3cF16d0ABD9E4B9",
  beneficiary: "0x8bc7639eB29f2CaEc085E52eC1Fe0D0Ee8581cad",
  pledges: withAmounts(MAINNET_AMOUNTS),
  // Above the contract's minimum, so the few seconds between simulating and mining do not push the
  // deadline under it.
  expiryMargin: 60,
};

const REHEARSAL_DIR = "cache/seed-rehearsal";

// Each plan holds everything that differs between the two chains, so no value is chosen at the point
// of use. `rpc` is an alias in foundry.toml, so each endpoint is named once.
const PLANS = {
  mainnet: {
    chainId: SEED.chainId,
    rpc: "arc_mainnet",
    explorerTx: "https://explorer.arc.io/tx/",
    recordPath: `deployments/${SEED.chainId}.json`,
    configPath: `deployments/config/${SEED.chainId}.json`,
    rolesPath: undefined,
    pledges: SEED.pledges,
  },
  testnet: {
    chainId: 5042002,
    rpc: "arc_testnet",
    explorerTx: "https://explorer.testnet.arc.io/tx/",
    recordPath: `${REHEARSAL_DIR}/record.json`,
    configPath: "deployments/config/5042002.json",
    rolesPath: `${REHEARSAL_DIR}/roles.json`,
    pledges: withAmounts(TESTNET_AMOUNTS),
  },
};

const ABI = parseAbi([
  "function pledgeCount() view returns (uint256)",
  "function allowedTokens() view returns (address[])",
  "function MIN_DURATION() view returns (uint64)",
  "function stateOf(uint256) view returns (uint8)",
  "function getPledge(uint256) view returns ((address staker, address token, uint256 amount, address referee, address beneficiary, uint64 deadline, uint64 createdAt, uint8 status, string promiseText))",
  "function createPledge(address token, uint256 amount, address referee, address beneficiary, uint64 deadline, string promiseText) returns (uint256)",
  "function markKept(uint256 id)",
  "function markBroken(uint256 id)",
  "function settle(uint256 id)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

const STATES = ["Active", "Expired", "Kept", "Broken", "SettledToStaker", "SettledToBeneficiary"];
const PHASES = ["create", "verdicts", "settle"];
const VALUE_OPTIONS = ["--account", "--keystore", "--password-file"];

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The repository is public and a failure message may be pasted into evidence, where CLAUDE.md
// section 5 forbids local paths, so the machine's home directory is removed from what cast reports.
const redact = (text) =>
  String(text)
    .replaceAll(root, "<repo>")
    .replace(/\/Users\/[^\s/'"]+/g, "<home>")
    .replace(/\/home\/[^\s/'"]+/g, "<home>");

/** The options of a command line, or a throw naming what is wrong. */
export function parseArgs(argv) {
  const options = { phase: undefined, account: undefined, keystore: undefined, passwordFile: undefined, send: false, testnet: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--send") options.send = true;
    else if (arg === "--testnet") options.testnet = true;
    else if (VALUE_OPTIONS.includes(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      if (arg === "--account") options.account = value;
      else if (arg === "--keystore") options.keystore = value;
      else options.passwordFile = value;
    } else if (arg.startsWith("--")) throw new Error(`unknown argument ${arg}`);
    else if (options.phase === undefined) options.phase = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  if (!PHASES.includes(options.phase)) throw new Error(`the first argument must be a phase: ${PHASES.join(", ")}`);
  // A keystore file is how the rehearsal's throwaway signers are held; mainnet signs only through a
  // named keystore of the operator (LLR-DP-003).
  if (options.keystore !== undefined && !options.testnet) throw new Error("--keystore is only for the --testnet rehearsal; mainnet signs with --account");
  if (options.account !== undefined && options.keystore !== undefined) throw new Error("name the signer with one of --account or --keystore, not both");
  if (options.account === undefined && options.keystore === undefined) {
    throw new Error("--account <keystore> is required (the --testnet rehearsal may use --keystore <path> instead)");
  }
  if (!options.passwordFile) throw new Error("--password-file <path> is required");
  return options;
}

/**
 * A runner that executes `cast` with an argument array and no shell, so nothing in an argument is
 * ever interpreted. `spawn` is a parameter so a test can check that.
 */
export function makeCastRunner(spawn = spawnSync) {
  return (args) => {
    const result = spawn("cast", args, { encoding: "utf8" });
    if (result.error) return { status: 1, stdout: "", stderr: String(result.error.message ?? result.error) };
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}

const readRepoJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

/**
 * Runs one phase. `run` executes a `cast` command line, `readJson` reads a repository JSON file and
 * `log` prints a line; all three are parameters so a test can supply a fake chain.
 */
export async function runSeed({ phase, account, keystore, passwordFile, send, testnet }, { run, readJson, log }) {
  const plan = testnet === true ? PLANS.testnet : PLANS.mainnet;
  const rpc = plan.rpc;

  const cast = async (args) => {
    const result = await run(args);
    if (result.status !== 0) throw new Error(`cast ${args[0]} failed: ${redact((result.stderr || result.stdout).trim())}`);
    return result.stdout.trim();
  };

  // Before anything is read from the chain or the repository that could be taken for another chain's.
  const chainId = Number(await cast(["chain-id", "--rpc-url", rpc]));
  if (chainId !== plan.chainId) throw new Error(`the RPC reports chain ${chainId}, not ${plan.chainId}`); // LLR-DP-009
  if (!testnet && keystore !== undefined) throw new Error("a keystore path is only for the --testnet rehearsal; mainnet signs with --account"); // LLR-DP-003

  const record = readJson(plan.recordPath);
  if (record.chainId !== plan.chainId) throw new Error(`the deployment record is for chain ${record.chainId}`);
  if (!record.address) throw new Error("the deployment record has no address");
  const config = readJson(plan.configPath);
  if (config.chainId !== plan.chainId) throw new Error(`the config is for chain ${config.chainId}`);
  const tokenAddress = {};
  for (const symbol of ["USDC", "cirBTC"]) {
    const entry = config.tokens.find((t) => t.symbol === symbol);
    if (!entry) throw new Error(`the config has no ${symbol}`);
    // A token address is only used with the official page it was confirmed against on record.
    for (const field of ["source", "confirmed"]) {
      if (!entry[field]) throw new Error(`the config entry for ${symbol} has no ${field}`); // LLR-DP-002
    }
    tokenAddress[symbol] = entry.address;
  }
  const satStake = getAddress(record.address);

  let roles = { staker: SEED.staker, referee: SEED.referee, beneficiary: SEED.beneficiary };
  if (plan.rolesPath !== undefined) {
    const file = readJson(plan.rolesPath);
    for (const name of ["staker", "referee", "beneficiary"]) {
      if (typeof file[name] !== "string" || !isAddress(file[name], { strict: false })) {
        throw new Error(`the rehearsal roles file has no valid ${name} address`);
      }
    }
    roles = { staker: file.staker, referee: file.referee, beneficiary: file.beneficiary };
  }

  const read = async (to, functionName, args = [], block) => {
    const data = encodeFunctionData({ abi: ABI, functionName, args });
    const out = await cast(["call", to, data, ...(block === undefined ? [] : ["--block", String(block)]), "--rpc-url", rpc]);
    return decodeFunctionResult({ abi: ABI, functionName, data: out });
  };

  // Before any simulation, so an approval is never made to an address that is not the contract the
  // seed was written for.
  const code = await cast(["code", satStake, "--rpc-url", rpc]);
  if (!/^0x[0-9a-fA-F]+$/.test(code)) throw new Error(`no contract code at ${satStake}`); // LLR-DP-009
  const expectedTokens = [tokenAddress.USDC, tokenAddress.cirBTC];
  const allowed = await read(satStake, "allowedTokens");
  if (allowed.length !== expectedTokens.length || !expectedTokens.every((t) => allowed.some((a) => same(a, t)))) {
    throw new Error(`allowedTokens() of ${satStake} is [${allowed.join(", ")}], not the config's [${expectedTokens.join(", ")}]`); // LLR-DP-009
  }

  const signerArgs = keystore === undefined ? ["--account", account] : ["--keystore", keystore];
  const signer = await cast(["wallet", "address", ...signerArgs, "--password-file", passwordFile]);

  /**
   * Simulates a transaction from the signer, then sends it if --send was given. Returns the receipt
   * block. `probe` re-reads the state the transaction changes, for a send that fails after broadcast.
   */
  const transact = async (what, to, functionName, args, probe) => {
    const data = encodeFunctionData({ abi: ABI, functionName, args });
    const simulation = await run(["call", to, data, "--from", signer, "--rpc-url", rpc]); // LLR-DP-012
    if (simulation.status !== 0) {
      throw new Error(`simulation of ${what} failed, nothing sent: ${redact((simulation.stderr || simulation.stdout).trim())}`); // LLR-DP-012
    }
    if (!send) {
      log(`${what} to ${to}: simulated ok, not sent`);
      return undefined;
    }
    const result = await run(["send", to, data, ...signerArgs, "--password-file", passwordFile, "--rpc-url", rpc, "--json"]); // LLR-DP-012
    if (result.status !== 0) {
      const detail = redact((result.stderr || result.stdout).trim());
      // Bounded on both sides, so the first 32 bytes of longer revert data are not taken for a hash.
      const hash = /(?<![0-9a-fA-F])0x[0-9a-fA-F]{64}(?![0-9a-fA-F])/.exec(detail)?.[0];
      // The transaction may have been broadcast and still be mined, and a rerun before it is would
      // act on the state without it, so the state is read again for the operator to compare.
      let now;
      try {
        now = probe === undefined ? "not re-read" : await probe();
      } catch (error) {
        now = `could not be re-read: ${redact(error.message)}`;
      }
      throw new Error(
        `${what} failed after it may have been broadcast: ${detail}. ` +
          `${hash === undefined ? "No hash was reported" : `Transaction ${hash} ${plan.explorerTx}${hash}`}. ` +
          `State now: ${now}. The transaction may still be pending: wait until it is mined or dropped, then rerun the same command.`, // LLR-DP-009
      );
    }
    const sent = JSON.parse(result.stdout.trim());
    const ok = ["0x1", "1", "success"].includes(String(sent.status));
    log(`${what} to ${to}: simulated ok, sent ${sent.transactionHash} ${plan.explorerTx}${sent.transactionHash}`);
    if (!ok) throw new Error(`${what} was mined with status ${sent.status}, stopping`);
    return BigInt(sent.blockNumber);
  };

  const requireSigner = (expected, role) => {
    if (!same(signer, expected)) throw new Error(`the signer ${signer} is not the ${role} account ${expected}`);
  };

  // Pledges 1 to `through` are compared with the seed: identifiers alone do not say a pledge is the
  // seed's. A fixed deadline is compared exactly; the others are relative to the block they were
  // created in, which the seed does not know.
  const requireSeeded = async (through, hint = "") => {
    for (const seed of plan.pledges.filter((p) => p.id <= through)) {
      const p = await read(satStake, "getPledge", [BigInt(seed.id)]).catch((error) => {
        throw new Error(`pledge ${seed.id} could not be read: ${error.message}`);
      });
      const fields = [
        ["staker", same(p.staker, roles.staker)],
        ["token", same(p.token, tokenAddress[seed.symbol])],
        ["amount", p.amount === seed.amount],
        ["referee", same(p.referee, roles.referee)],
        ["beneficiary", same(p.beneficiary, roles.beneficiary)],
        ["promise", p.promiseText === seed.text],
        ...(seed.deadline.at === undefined ? [] : [["deadline", p.deadline === BigInt(seed.deadline.at)]]),
      ];
      const wrong = fields.filter(([, ok]) => !ok).map(([name]) => name);
      if (wrong.length > 0) throw new Error(`pledge ${seed.id} is not the seed's: ${wrong.join(", ")} differ${hint}`); // LLR-DP-009
    }
  };

  if (phase === "create") {
    requireSigner(roles.staker, "staker"); // LLR-DP-009
    const count = Number(await read(satStake, "pledgeCount"));
    if (count >= plan.pledges.length) throw new Error(`pledgeCount is ${count}, the seed has nothing left to create`); // LLR-DP-009
    // Anyone can create a pledge, so one that is not the seed's can take an identifier before the seed does.
    await requireSeeded(count, "; a pledge that is not part of the seed exists on this contract, so create cannot continue here"); // LLR-DP-009
    const remaining = plan.pledges.filter((p) => p.id > count);

    // One approval per token for exactly what the pledges still to create lock. An allowance a
    // previous run left behind is kept when it already is that amount, and replaced by it otherwise.
    let approvalPending = false;
    for (const symbol of ["cirBTC", "USDC"]) {
      const total = remaining.filter((p) => p.symbol === symbol).reduce((sum, p) => sum + p.amount, 0n);
      if (total === 0n) continue;
      const outstanding = await read(tokenAddress[symbol], "allowance", [signer, satStake]);
      if (outstanding === total) {
        log(`approve ${symbol} ${total}: the allowance already is that amount, nothing to send`);
        continue;
      }
      const block = await transact(`approve ${symbol} ${total}`, tokenAddress[symbol], "approve", [satStake, total], async () => {
        return `the ${symbol} allowance is ${await read(tokenAddress[symbol], "allowance", [signer, satStake])}`;
      });
      if (block === undefined) {
        approvalPending = true;
        continue;
      }
      const allowance = await read(tokenAddress[symbol], "allowance", [signer, satStake], block); // LLR-DP-009
      if (allowance !== total) throw new Error(`the ${symbol} allowance is ${allowance} after the approval, not ${total}`);
    }
    if (approvalPending) {
      log(`createPledge x${remaining.length}: not simulated, each needs its approval mined first; run with --send`);
      return;
    }
    const minDuration = Number(await read(satStake, "MIN_DURATION"));
    for (const seed of remaining) {
      // The latest block's time, read just before this transaction: time has moved since the last.
      const now = Number(await cast(["block", "latest", "--field", "timestamp", "--rpc-url", rpc]));
      const { after, expiry, at } = seed.deadline;
      const deadline = at ?? now + (expiry ? minDuration + SEED.expiryMargin : after);
      await transact(`createPledge ${seed.id} (${seed.symbol})`, satStake, "createPledge", [
        getAddress(tokenAddress[seed.symbol]),
        seed.amount,
        getAddress(roles.referee),
        getAddress(roles.beneficiary),
        BigInt(deadline),
        seed.text,
      ], async () => `pledgeCount is ${await read(satStake, "pledgeCount")}`);
    }
    return;
  }

  await requireSeeded(plan.pledges.length);

  // Each step is skipped when its pledge already is in the state the step leaves it in, so a phase
  // stopped by a failed send can be rerun; a pledge in any other state is refused (LLR-DP-009).
  const steps =
    phase === "verdicts"
      ? [
          { id: 1, from: "Active", done: "Kept", what: "markKept 1", fn: "markKept" },
          { id: 3, from: "Active", done: "Broken", what: "markBroken 3", fn: "markBroken" },
        ]
      : [
          { id: 1, from: "Kept", done: "SettledToStaker", what: "settle 1", fn: "settle" },
          // Expired, not Active: the stake of an unjudged pledge is not payable before its deadline.
          { id: 2, from: "Expired", done: "SettledToBeneficiary", what: "settle 2", fn: "settle" },
          { id: 3, from: "Broken", done: "SettledToBeneficiary", what: "settle 3", fn: "settle" },
        ];
  if (phase === "verdicts") requireSigner(roles.referee, "referee"); // LLR-DP-009
  const todo = [];
  for (const step of steps) {
    const actual = STATES[Number(await read(satStake, "stateOf", [BigInt(step.id)]))];
    if (actual === step.done) continue;
    if (actual !== step.from) throw new Error(`pledge ${step.id} is ${actual}, this phase needs it ${step.from} or already ${step.done}`); // LLR-DP-009
    todo.push(step);
  }
  if (todo.length === 0) {
    log(`${phase}: every pledge is already in its end state, nothing to send`);
    return;
  }
  for (const step of todo) {
    await transact(step.what, satStake, step.fn, [BigInt(step.id)], async () => {
      return `pledge ${step.id} is ${STATES[Number(await read(satStake, "stateOf", [BigInt(step.id)]))]}`;
    });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const options = parseArgs(process.argv.slice(2));
    await runSeed(options, { run: makeCastRunner(), readJson: readRepoJson, log: (line) => console.log(line) });
  } catch (error) {
    console.error(`seed: ${redact(error.message)}`);
    process.exitCode = 1;
  }
}
