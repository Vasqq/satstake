// Tests for the mainnet seed tool (LLR-DP-009, LLR-DP-012, LLR-DP-003). The tool talks to the chain
// only through `cast`, so these tests give it a fake `cast` over a small world with the semantics
// SatStake and the two tokens have: a simulation of a transaction that would revert fails, a send
// applies its effects, and time and blocks move. Nothing here touches a network or a keystore.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, encodeFunctionData, encodeFunctionResult, getAddress, parseAbi } from "viem";
import { SEED, makeCastRunner, parseArgs, runSeed } from "../../script/seed.mjs";

const STAKER = "0xd1728f74ac083a0f9b41a3ec16ed3a25af33809f";
const REFEREE = "0x0fb1b0c69dd6bd29c8ec3057a3cf16d0abd9e4b9";
const BENEFICIARY = "0x8bc7639eb29f2caec085e52ec1fe0d0ee8581cad";
const USDC = "0x3600000000000000000000000000000000000000";
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const SATSTAKE = "0x00000000000000000000000000000000005a7570";
const OTHER = "0x00000000000000000000000000000000000000aa";
const RPC = "arc_mainnet";
const ACCOUNT = "satstake-deployer";
const PASSWORD_FILE = "/pw/deployer.pw";
const DAY = 86400;
const PROVENANCE = { source: "https://docs.arc.io/arc/references/contract-addresses", confirmed: "2026-09-24" };

const TEXTS = [
  "Walk for thirty minutes every day this week.",
  "Send the draft to the editor before the deadline.",
  "Cook dinner at home on all five weekdays.",
  "Publish the first release notes by the end of October.",
];
const TOKENS = [CIRBTC, USDC, USDC, CIRBTC];
const AMOUNTS = [1000n, 1000000n, 1000000n, 1000n];

const ABI = parseAbi([
  "function pledgeCount() view returns (uint256)",
  "function MIN_DURATION() view returns (uint64)",
  "function stateOf(uint256) view returns (uint8)",
  "function getPledge(uint256) view returns ((address staker, address token, uint256 amount, address referee, address beneficiary, uint64 deadline, uint64 createdAt, uint8 status, string promiseText))",
  "function createPledge(address,uint256,address,address,uint64,string) returns (uint256)",
  "function markKept(uint256)",
  "function markBroken(uint256)",
  "function settle(uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function allowedTokens() view returns (address[])",
]);

// Stored status: 1 Active, 2 Kept, 3 Broken, 4 SettledToStaker, 5 SettledToBeneficiary.
// Reported state: 0 Active, 1 Expired, 2 Kept, 3 Broken, 4 SettledToStaker, 5 SettledToBeneficiary.
function stateOf(w, p) {
  if (p.status === 1) return w.now >= p.deadline ? 1 : 0;
  return p.status;
}

function revert(reason) {
  throw new Error(`execution reverted: ${reason}`);
}

function exec(w, to, data, from, commit) {
  const target = to.toLowerCase();
  const { functionName, args } = decodeFunctionData({ abi: ABI, data });
  const encode = (result) => encodeFunctionResult({ abi: ABI, functionName, result });
  const needPledge = (id) => w.pledges[Number(id) - 1] ?? revert("PledgeNotFound");
  const isToken = w.tokens.includes(target);
  if (isToken !== ["approve", "allowance"].includes(functionName)) revert("wrong target for " + functionName);
  if (!isToken && target !== SATSTAKE) revert("no contract at " + to);
  switch (functionName) {
    case "pledgeCount":
      return encode(BigInt(w.pledges.length));
    case "allowedTokens":
      // Reverse of the config's order on purpose: the contract stores them in the order it was given.
      return encode(w.allowedTokens ?? [...w.tokens].reverse());
    case "MIN_DURATION":
      return encode(60n);
    case "stateOf":
      return encode(stateOf(w, needPledge(args[0])));
    case "getPledge": {
      const p = needPledge(args[0]);
      return encode({ ...p, status: p.status });
    }
    case "allowance":
      return encode(w.allowances.get(`${target}|${args[0].toLowerCase()}|${args[1].toLowerCase()}`) ?? 0n);
    case "approve": {
      if (commit) w.allowances.set(`${target}|${from}|${args[0].toLowerCase()}`, args[1] + (w.approveSkew ?? 0n));
      return encode(true);
    }
    case "createPledge": {
      const [token, amount, referee, beneficiary, deadline, promiseText] = args;
      const key = `${token.toLowerCase()}|${from}|${SATSTAKE}`;
      if ((w.allowances.get(key) ?? 0n) < amount) revert("ERC20InsufficientAllowance");
      if (BigInt(w.now) + 60n > deadline) revert("DeadlineTooSoon");
      if (commit) {
        w.allowances.set(key, w.allowances.get(key) - amount);
        w.pledges.push({
          staker: from,
          token: token.toLowerCase(),
          amount,
          referee: referee.toLowerCase(),
          beneficiary: beneficiary.toLowerCase(),
          deadline,
          createdAt: BigInt(w.now),
          status: 1,
          promiseText,
        });
      }
      return encode(BigInt(w.pledges.length + (commit ? 0 : 1)));
    }
    case "markKept":
    case "markBroken": {
      const p = needPledge(args[0]);
      if (from !== p.referee) revert("NotReferee");
      if (stateOf(w, p) !== 0) revert("NotActive");
      if (commit) p.status = functionName === "markKept" ? 2 : 3;
      return encode(undefined);
    }
    case "settle": {
      const p = needPledge(args[0]);
      const s = stateOf(w, p);
      if (![1, 2, 3].includes(s)) revert("NotSettleable");
      if (commit) p.status = s === 2 ? 4 : 5;
      return encode(undefined);
    }
    default:
      revert("unknown " + functionName);
  }
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

/** The world and the fake `cast` over it. Every command line it is given is kept in `w.runs`. */
function makeWorld(over = {}) {
  const w = {
    chainId: 5042,
    now: 1_791_000_000,
    block: 1000,
    signer: STAKER,
    rpc: RPC,
    auth: ["--account", ACCOUNT],
    hasCode: () => true,
    tokens: [USDC, CIRBTC],
    pledges: [],
    allowances: new Map(),
    runs: [],
    failCall: () => false,
    failSend: () => false,
    pending: [],
    land: () => {
      while (w.pending.length > 0) w.pending.shift()();
    },
    ...over,
  };
  w.cast = (args) => {
    w.runs.push(args);
    const ok = (stdout) => ({ status: 0, stdout: `${stdout}\n`, stderr: "" });
    const bad = (stderr) => ({ status: 1, stdout: "", stderr });
    const [cmd] = args;
    if (flag(args, "--rpc-url") !== w.rpc && cmd !== "wallet") return bad("unexpected rpc");
    if (cmd === "chain-id") return ok(String(w.chainId));
    if (cmd === "block") {
      assert.deepEqual(args, ["block", "latest", "--field", "timestamp", "--rpc-url", w.rpc]);
      return ok(String(w.now));
    }
    if (cmd === "code") {
      assert.deepEqual(args, ["code", args[1], "--rpc-url", w.rpc]);
      return ok(w.hasCode(args[1].toLowerCase()) ? "0x6080604052" : "0x");
    }
    if (cmd === "wallet") {
      assert.deepEqual(args, ["wallet", "address", ...w.auth, "--password-file", PASSWORD_FILE]);
      return ok(w.signer);
    }
    const [, to, data] = args;
    const decoded = decodeFunctionData({ abi: ABI, data });
    try {
      if (cmd === "call") {
        const from = flag(args, "--from")?.toLowerCase() ?? "0x0000000000000000000000000000000000000000";
        if (w.failCall(decoded.functionName, decoded.args, to, from)) revert("injected");
        return ok(exec(w, to, data, from, false));
      }
      if (cmd === "send") {
        assert.equal(flag(args, w.auth[0]), w.auth[1]);
        assert.equal(flag(args, "--password-file"), PASSWORD_FILE);
        assert.ok(args.includes("--json"));
        // A send that reports failure to the caller while the transaction may still take effect: now
        // ("landed") or only later, when the test calls `w.land()` ("late").
        const fault = w.sendFault?.(decoded.functionName, decoded.args);
        if (fault) {
          if (fault === "landed") exec(w, to, data, w.signer, true);
          if (fault === "late") w.pending.push(() => exec(w, to, data, w.signer, true));
          return bad(`error: failed to get the receipt${w.sendFaultHash ? ` for ${w.sendFaultHash}` : ""}`);
        }
        const failed = w.failSend(decoded.functionName, decoded.args);
        if (!failed) exec(w, to, data, w.signer, true);
        w.now += 2;
        w.block += 1;
        const sent = w.runs.filter((r) => r[0] === "send").length;
        return ok(
          JSON.stringify({
            transactionHash: `0x${sent.toString(16).padStart(64, "0")}`,
            status: failed ? "0x0" : "0x1",
            blockNumber: `0x${w.block.toString(16)}`,
          }),
        );
      }
    } catch (error) {
      return bad(error.message);
    }
    return bad(`unexpected command ${cmd}`);
  };
  return w;
}

function harness(over, files = {}) {
  const w = makeWorld(over);
  const lines = [];
  const reads = [];
  const defaults = {
    "deployments/5042.json": { chainId: 5042, address: SATSTAKE },
    "deployments/config/5042.json": {
      chainId: 5042,
      tokens: [
        { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6, ...PROVENANCE },
        { symbol: "cirBTC", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8, ...PROVENANCE },
      ],
    },
    ...files,
  };
  const deps = {
    run: async (args) => w.cast(args),
    readJson: (path) => {
      reads.push(path);
      if (!(path in defaults)) throw new Error(`no such file ${path}`);
      return defaults[path];
    },
    log: (line) => lines.push(line),
  };
  const go = (phase, { send = false } = {}) =>
    runSeed({ phase, account: ACCOUNT, passwordFile: PASSWORD_FILE, send, testnet: false }, deps);
  return { w, deps, lines, reads, go };
}

const sends = (w) => w.runs.filter((r) => r[0] === "send");
const calls = (w) => w.runs.filter((r) => r[0] === "call");
const fnOf = (args) => decodeFunctionData({ abi: ABI, data: args[2] });
const sendsOf = (w) => sends(w).map((r) => fnOf(r).functionName);

/** A world that has been through `create --send`, signed by the staker. */
async function seeded(over) {
  const h = harness(over);
  await h.go("create", { send: true });
  h.w.runs.length = 0;
  h.lines.length = 0;
  return h;
}

describe("LLR-DP-003 arguments and the cast runner", () => {
  it("takes a phase, a keystore name, a password file, and an optional --send", () => {
    assert.deepEqual(parseArgs(["create", "--account", "k", "--password-file", "/p"]), {
      phase: "create",
      account: "k",
      keystore: undefined,
      passwordFile: "/p",
      send: false,
      testnet: false,
    });
    assert.equal(parseArgs(["settle", "--account", "k", "--password-file", "/p", "--send"]).send, true);
    assert.equal(parseArgs(["--send", "verdicts", "--password-file", "/p", "--account", "k"]).phase, "verdicts");
  });

  it("refuses an unknown phase, a missing keystore or password file, and any other argument", () => {
    assert.throws(() => parseArgs(["deploy", "--account", "k", "--password-file", "/p"]), /phase/);
    assert.throws(() => parseArgs(["--account", "k", "--password-file", "/p"]), /phase/);
    assert.throws(() => parseArgs(["create", "--password-file", "/p"]), /--account/);
    assert.throws(() => parseArgs(["create", "--account", "k"]), /--password-file/);
    assert.throws(() => parseArgs(["create", "--account", "k", "--password-file", "/p", "--private-key", "0x1"]), /--private-key/);
    assert.throws(() => parseArgs(["create", "--account", "k", "--password-file"]), /--password-file/);
  });

  it("runs cast with an argument array and no shell, and reports its exit status and output", () => {
    const seen = [];
    const spawn = (file, args, options) => {
      seen.push({ file, args, options });
      return { status: 0, stdout: "out", stderr: "err", error: undefined };
    };
    const result = makeCastRunner(spawn)(["call", "0x1; rm -rf /", "--from", "$(x)"]);
    assert.deepEqual(result, { status: 0, stdout: "out", stderr: "err" });
    assert.equal(seen[0].file, "cast");
    assert.deepEqual(seen[0].args, ["call", "0x1; rm -rf /", "--from", "$(x)"]);
    assert.ok(Array.isArray(seen[0].args));
    assert.notEqual(seen[0].options?.shell, true);
    assert.equal(seen[0].options.encoding, "utf8");
  });

  it("reports a cast that could not start as a failure", () => {
    const result = makeCastRunner(() => ({ status: null, stdout: "", stderr: "", error: new Error("ENOENT") }))(["x"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
  });

  it("reads no file but the deployment record and the config, and never the password file", async () => {
    const h = harness();
    await h.go("create");
    assert.deepEqual([...new Set(h.reads)].sort(), ["deployments/5042.json", "deployments/config/5042.json"]);
    const everything = JSON.stringify(h.w.runs) + h.lines.join("\n");
    assert.ok(!everything.includes("--password "), "a password value was passed on the command line");
  });
});

describe("LLR-DP-009 refusing any chain but Arc mainnet", () => {
  for (const phase of ["create", "verdicts", "settle"]) {
    it(`${phase} stops at the chain id before reading state or simulating`, async () => {
      const h = harness({ chainId: 5042002 });
      await assert.rejects(h.go(phase, { send: true }), /5042/);
      assert.deepEqual(h.w.runs, [["chain-id", "--rpc-url", RPC]]);
    });
  }

  it("refuses a config or a record written for another chain", async () => {
    await assert.rejects(
      harness({}, {
        "deployments/config/5042.json": {
          chainId: 5042002,
          tokens: [
            { symbol: "USDC", address: USDC, decimals: 6, ...PROVENANCE },
            { symbol: "cirBTC", address: CIRBTC, decimals: 8, ...PROVENANCE },
          ],
        },
      }).go("create"),
      /config is for chain/,
    );
    await assert.rejects(harness({}, { "deployments/5042.json": { chainId: 5042002, address: SATSTAKE } }).go("create"), /record/);
  });

  it("refuses a record with no address", async () => {
    await assert.rejects(harness({}, { "deployments/5042.json": { chainId: 5042 } }).go("create"), /address/);
  });
});

describe("LLR-DP-009 the create phase", () => {
  it("without --send simulates the two approvals from the staker and sends nothing", async () => {
    const h = harness();
    await h.go("create");
    assert.equal(sends(h.w).length, 0);
    const approveData = (amount) => encodeFunctionData({ abi: ABI, functionName: "approve", args: [SATSTAKE, amount] });
    const simulated = h.w.runs.filter((r) => r[0] === "call" && r[3] === "--from");
    assert.deepEqual(
      simulated.map((r) => [r[0], r[1].toLowerCase(), r[2], r[3], r[4], r[5], r[6]]),
      [
        ["call", CIRBTC, approveData(2000n), "--from", STAKER, "--rpc-url", RPC],
        ["call", USDC, approveData(2000000n), "--from", STAKER, "--rpc-url", RPC],
      ],
    );
  });

  it("without --send says the pledge creations are not simulated because the approval is not mined", async () => {
    const h = harness();
    await h.go("create");
    assert.match(h.lines.join("\n"), /createPledge[^\n]*not simulated[^\n]*approval/i);
  });

  it("with --send approves, then creates the four pledges, each only after its own simulation", async () => {
    const h = harness();
    await h.go("create", { send: true });
    assert.deepEqual(sendsOf(h.w), ["approve", "approve", "createPledge", "createPledge", "createPledge", "createPledge"]);
    // Every send is directly preceded, among the writes, by a simulation of the same call from the same sender.
    const writes = h.w.runs.filter((r) => ["call", "send"].includes(r[0]) && (r[0] === "send" || r.includes("--from")));
    writes.forEach((r, i) => {
      if (r[0] !== "send") return;
      const before = writes[i - 1];
      assert.equal(before[0], "call");
      assert.equal(before[1], r[1]);
      assert.equal(before[2], r[2]);
      assert.equal(flag(before, "--from"), STAKER);
    });
    for (const r of sends(h.w)) {
      assert.deepEqual(r.slice(3), ["--account", ACCOUNT, "--password-file", PASSWORD_FILE, "--rpc-url", RPC, "--json"]);
    }
  });

  it("approves each token for exactly what its two pledges lock, and creates the four pledges as the seed", async () => {
    const h = harness();
    await h.go("create", { send: true });
    const approvals = sends(h.w).slice(0, 2).map((r) => ({ to: r[1], args: fnOf(r).args }));
    assert.deepEqual(approvals, [
      { to: getAddress(CIRBTC), args: [getAddress(SATSTAKE), 2000n] },
      { to: getAddress(USDC), args: [getAddress(SATSTAKE), 2000000n] },
    ]);
    h.w.pledges.forEach((p, i) => {
      assert.equal(p.staker, STAKER);
      assert.equal(p.token, TOKENS[i]);
      assert.equal(p.amount, AMOUNTS[i]);
      assert.equal(p.referee, REFEREE);
      assert.equal(p.beneficiary, BENEFICIARY);
      assert.equal(p.promiseText, TEXTS[i]);
    });
    assert.equal(h.w.pledges.length, 4);
  });

  it("sets A and C seven days out, B at the minimum plus 60 s, and D at 2026-11-01, each from the latest block time", async () => {
    const h = harness();
    await h.go("create", { send: true });
    const [a, b, c, d] = h.w.pledges;
    // `createdAt` is the chain time the transaction ran at, and time advances between transactions,
    // so a deadline taken from the first block time would be early by the elapsed time.
    assert.equal(a.deadline, a.createdAt + BigInt(7 * DAY));
    assert.equal(b.deadline, b.createdAt + 120n);
    assert.equal(c.deadline, c.createdAt + BigInt(7 * DAY));
    assert.equal(d.deadline, 1793491200n);
    assert.ok(c.createdAt > a.createdAt);
  });

  it("reads the allowance after each approval at the receipt's block, and goes on only if it equals the amount", async () => {
    const h = harness();
    await h.go("create", { send: true });
    const reads = calls(h.w).filter((r) => fnOf(r).functionName === "allowance" && r.includes("--block"));
    assert.equal(reads.length, 2);
    for (const r of reads) {
      assert.ok(Number(flag(r, "--block")) > 1000, "allowance not read at a receipt block");
      assert.equal(r.includes("--from"), false);
    }
    assert.deepEqual(reads.map((r) => r[1].toLowerCase()), [CIRBTC, USDC]);
    // The block of each is the block of the approval before it: the world gives the first send block 1001.
    assert.equal(flag(reads[0], "--block"), "1001");
    assert.equal(flag(reads[1], "--block"), "1002");
  });

  it("stops before any pledge if an approval did not leave exactly the amount", async () => {
    const h = harness({ approveSkew: 1n });
    await assert.rejects(h.go("create", { send: true }), /allowance/);
    assert.deepEqual(sendsOf(h.w), ["approve"]);
  });

  it("refuses unless the signer is the deployer account", async () => {
    const h = harness({ signer: REFEREE });
    await assert.rejects(h.go("create", { send: true }), /staker/);
    assert.equal(sends(h.w).length, 0);
  });

  it("refuses a contract that already holds a pledge", async () => {
    const h = await seeded();
    await assert.rejects(h.go("create", { send: true }), /pledgeCount|already/);
    assert.equal(sends(h.w).length, 0);
  });

  it("refuses a contract that holds a single pledge that is not the seed's first", async () => {
    const h = await seeded();
    h.w.pledges.length = 1;
    h.w.pledges[0].amount += 1n;
    await assert.rejects(h.go("create", { send: true }), /pledge 1 is not the seed's: amount/);
    assert.equal(sends(h.w).length, 0);
  });

  it("sends nothing after a simulation that fails: not the first approval, not a later transaction", async () => {
    const first = harness({ failCall: (fn, args, to) => fn === "approve" && to.toLowerCase() === CIRBTC });
    await assert.rejects(first.go("create", { send: true }), /simulation/i);
    assert.equal(sends(first.w).length, 0);

    const second = harness({ failCall: (fn, args, to) => fn === "approve" && to.toLowerCase() === USDC });
    await assert.rejects(second.go("create", { send: true }), /simulation/i);
    assert.deepEqual(sendsOf(second.w), ["approve"]);

    const third = harness({ failCall: (fn, args) => fn === "createPledge" && args[5] === TEXTS[2] });
    await assert.rejects(third.go("create", { send: true }), /simulation/i);
    assert.deepEqual(sendsOf(third.w), ["approve", "approve", "createPledge", "createPledge"]);
  });

  it("stops when a transaction is mined with status 0", async () => {
    const h = harness({ failSend: (fn, args) => fn === "createPledge" && args[5] === TEXTS[1] });
    await assert.rejects(h.go("create", { send: true }), /status/i);
    assert.deepEqual(sendsOf(h.w), ["approve", "approve", "createPledge", "createPledge"]);
  });

  it("takes a failing cast for a failure, not an empty answer", async () => {
    const h = harness();
    const run = h.deps.run;
    h.deps.run = async (args) => (args[0] === "block" ? { status: 1, stdout: "", stderr: "rpc down" } : run(args));
    await assert.rejects(h.go("create", { send: true }), /rpc down/);
    assert.deepEqual(sendsOf(h.w), ["approve", "approve"]);
  });
});

describe("LLR-DP-009 the verdicts phase", () => {
  it("without --send simulates the two verdicts from the referee and sends nothing", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    await h.go("verdicts");
    assert.equal(sends(h.w).length, 0);
    const sim = calls(h.w).filter((r) => r.includes("--from"));
    assert.deepEqual(sim.map((r) => [fnOf(r).functionName, fnOf(r).args[0], flag(r, "--from"), r[1].toLowerCase()]), [
      ["markKept", 1n, REFEREE, SATSTAKE],
      ["markBroken", 3n, REFEREE, SATSTAKE],
    ]);
  });

  it("with --send marks the first kept and the third broken, each after its simulation", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    await h.go("verdicts", { send: true });
    assert.deepEqual(sendsOf(h.w), ["markKept", "markBroken"]);
    assert.deepEqual(h.w.pledges.map((p) => p.status), [2, 1, 3, 1]);
    const all = h.w.runs.filter((r) => r[0] === "send" || r.includes("--from"));
    assert.deepEqual(all.map((r) => r[0]), ["call", "send", "call", "send"]);
  });

  it("refuses a signer that is not the referee", async () => {
    const h = await seeded();
    await assert.rejects(h.go("verdicts", { send: true }), /referee/);
    assert.equal(sends(h.w).length, 0);
  });

  it("refuses when nothing was created", async () => {
    const h = harness({ signer: REFEREE });
    await assert.rejects(h.go("verdicts", { send: true }), /pledge/i);
    assert.equal(sends(h.w).length, 0);
  });

  it("run a second time sends nothing and says every pledge is already judged", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    await h.go("verdicts", { send: true });
    h.w.runs.length = 0;
    h.lines.length = 0;
    await h.go("verdicts", { send: true });
    assert.equal(sends(h.w).length, 0);
    assert.equal(calls(h.w).filter((r) => r.includes("--from")).length, 0);
    assert.match(h.lines.join("\n"), /already .*nothing to send/i);
  });

  it("resumes after markKept 1 was mined and markBroken 3 failed", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.failSend = (fn) => fn === "markBroken";
    await assert.rejects(h.go("verdicts", { send: true }), /status/i);
    h.w.failSend = () => false;
    h.w.runs.length = 0;
    await h.go("verdicts", { send: true });
    assert.deepEqual(sendsOf(h.w), ["markBroken"]);
    assert.deepEqual(h.w.pledges.map((p) => p.status), [2, 1, 3, 1]);
  });

  it("resumes when only pledge 1 is still Active, whatever happened to pledge 3", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.pledges[2].status = 3;
    await h.go("verdicts", { send: true });
    assert.deepEqual(sendsOf(h.w), ["markKept"]);
    assert.deepEqual(h.w.pledges.map((p) => p.status), [2, 1, 3, 1]);
  });

  it("without --send simulates only what remains", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.pledges[0].status = 2;
    await h.go("verdicts");
    const sim = calls(h.w).filter((r) => r.includes("--from"));
    assert.deepEqual(sim.map((r) => [fnOf(r).functionName, fnOf(r).args[0]]), [["markBroken", 3n]]);
  });

  it("still refuses a pledge in a state that is neither the start nor the end of the phase", async () => {
    for (const [index, status] of [[0, 3], [2, 2], [0, 4], [2, 5]]) {
      const h = await seeded();
      h.w.signer = REFEREE;
      h.w.pledges[index].status = status;
      await assert.rejects(h.go("verdicts", { send: true }), new RegExp(`pledge ${index + 1} is`));
      assert.equal(sends(h.w).length, 0, `a send was made with pledge ${index + 1} at status ${status}`);
    }
  });

  it("refuses when only the third pledge is out of state", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.pledges[2].status = 2;
    await assert.rejects(h.go("verdicts", { send: true }), /pledge 3/);
    assert.equal(sends(h.w).length, 0);
  });

  it("refuses when the verdict window of the first pledge has closed", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.now = Number(h.w.pledges[0].deadline);
    await assert.rejects(h.go("verdicts", { send: true }), /pledge 1.*Expired/s);
  });
});

describe("LLR-DP-009 the settle phase", () => {
  async function judged() {
    const h = await seeded();
    h.w.signer = REFEREE;
    await h.go("verdicts", { send: true });
    h.w.runs.length = 0;
    h.lines.length = 0;
    h.w.signer = OTHER;
    return h;
  }

  it("refuses until the second pledge has expired", async () => {
    const h = await judged();
    h.w.now = Number(h.w.pledges[1].deadline) - 1;
    await assert.rejects(h.go("settle", { send: true }), /pledge 2.*Active/s);
    assert.equal(sends(h.w).length, 0);
  });

  it("refuses until the verdicts are recorded", async () => {
    const h = await seeded();
    h.w.now = Number(h.w.pledges[1].deadline);
    await assert.rejects(h.go("settle", { send: true }), /pledge 1.*Active/s);
    assert.equal(sends(h.w).length, 0);
  });

  it("refuses when the third pledge was not judged broken", async () => {
    const h = await judged();
    h.w.pledges[2].status = 2;
    h.w.now = Number(h.w.pledges[1].deadline);
    await assert.rejects(h.go("settle", { send: true }), /pledge 3.*Kept/s);
  });

  it("without --send simulates three settlements from any signer and sends nothing", async () => {
    const h = await judged();
    h.w.now = Number(h.w.pledges[1].deadline);
    await h.go("settle");
    assert.equal(sends(h.w).length, 0);
    const sim = calls(h.w).filter((r) => r.includes("--from"));
    assert.deepEqual(sim.map((r) => [fnOf(r).functionName, fnOf(r).args[0], flag(r, "--from")]), [
      ["settle", 1n, OTHER],
      ["settle", 2n, OTHER],
      ["settle", 3n, OTHER],
    ]);
  });

  it("with --send settles the first, second and third and leaves the fourth active", async () => {
    const h = await judged();
    h.w.now = Number(h.w.pledges[1].deadline);
    await h.go("settle", { send: true });
    assert.deepEqual(sendsOf(h.w), ["settle", "settle", "settle"]);
    assert.deepEqual(h.w.pledges.map((p) => p.status), [4, 5, 5, 1]);
  });

  it("sends nothing after a failed simulation", async () => {
    const h = await judged();
    h.w.now = Number(h.w.pledges[1].deadline);
    h.w.failCall = (fn, args) => fn === "settle" && args[0] === 2n;
    await assert.rejects(h.go("settle", { send: true }), /simulation/i);
    assert.deepEqual(sendsOf(h.w), ["settle"]);
  });

  it("run a second time sends nothing and says every pledge is already settled", async () => {
    const h = await judged();
    h.w.now = Number(h.w.pledges[1].deadline);
    await h.go("settle", { send: true });
    h.w.runs.length = 0;
    h.lines.length = 0;
    await h.go("settle", { send: true });
    assert.equal(sends(h.w).length, 0);
    assert.equal(calls(h.w).filter((r) => r.includes("--from")).length, 0);
    assert.match(h.lines.join("\n"), /already .*nothing to send/i);
  });

  it("resumes after settle 1 was mined and settle 2 failed", async () => {
    const h = await judged();
    h.w.now = Number(h.w.pledges[1].deadline);
    h.w.failSend = (fn, args) => fn === "settle" && args[0] === 2n;
    await assert.rejects(h.go("settle", { send: true }), /status/i);
    h.w.failSend = () => false;
    h.w.runs.length = 0;
    await h.go("settle", { send: true });
    assert.deepEqual(h.w.runs.filter((r) => r[0] === "send").map((r) => fnOf(r).args[0]), [2n, 3n]);
    assert.deepEqual(h.w.pledges.map((p) => p.status), [4, 5, 5, 1]);
  });

  it("resumes with only the third pledge left", async () => {
    const h = await judged();
    h.w.now = Number(h.w.pledges[1].deadline);
    h.w.pledges[0].status = 4;
    h.w.pledges[1].status = 5;
    await h.go("settle", { send: true });
    assert.deepEqual(sends(h.w).map((r) => fnOf(r).args[0]), [3n]);
  });

  it("still refuses a pledge in a state that is neither the start nor the end of the phase", async () => {
    // Index, wrong status: 1 settled to the beneficiary, 2 settled to the staker, 3 settled to the staker, 3 kept, 2 active.
    for (const [index, status] of [[0, 5], [1, 4], [2, 4], [2, 2], [1, 1]]) {
      const h = await judged();
      h.w.now = Number(h.w.pledges[1].deadline);
      h.w.pledges[index].status = status;
      if (index === 1) h.w.now = Number(h.w.pledges[1].deadline) - 1;
      await assert.rejects(h.go("settle", { send: true }), new RegExp(`pledge ${index + 1} is`));
      assert.equal(sends(h.w).length, 0, `a send was made with pledge ${index + 1} at status ${status}`);
    }
  });
});

describe("LLR-DP-009 each pledge is checked against the seed field by field", () => {
  const defects = [
    ["staker", (p) => (p.staker = OTHER)],
    ["referee", (p) => (p.referee = OTHER)],
    ["beneficiary", (p) => (p.beneficiary = OTHER)],
    ["token", (p) => (p.token = p.token === USDC ? CIRBTC : USDC)],
    ["amount", (p) => (p.amount += 1n)],
    ["promise", (p) => (p.promiseText = "Changed.")],
  ];
  for (const phase of ["verdicts", "settle"]) {
    for (const [name, mutate] of defects) {
      for (const id of [1, 2, 3, 4]) {
        it(`${phase} names pledge ${id} when its ${name} differs`, async () => {
          const h = await seeded();
          h.w.signer = phase === "verdicts" ? REFEREE : OTHER;
          mutate(h.w.pledges[id - 1]);
          h.w.now = Number(h.w.pledges[1].deadline);
          await assert.rejects(h.go(phase, { send: true }), new RegExp(`pledge ${id}\\b.*${name}`, "s"));
          assert.equal(sends(h.w).length, 0);
        });
      }
    }
  }
});

describe("LLR-DP-012 simulation before every send, and what is reported", () => {
  it("prints one line per transaction with its target, the simulation result, and no hash when nothing is sent", async () => {
    const h = harness();
    await h.go("create");
    const text = h.lines.join("\n");
    assert.match(text, new RegExp(`approve[^\\n]*${CIRBTC}[^\\n]*simulated ok`, "i"));
    assert.match(text, new RegExp(`approve[^\\n]*${USDC}[^\\n]*simulated ok`, "i"));
    assert.ok(!text.includes("explorer.arc.io"));
  });

  it("prints the hash and the explorer link of every sent transaction", async () => {
    const h = harness();
    await h.go("create", { send: true });
    const text = h.lines.join("\n");
    for (let n = 1; n <= 6; n++) {
      const hash = `0x${n.toString(16).padStart(64, "0")}`;
      assert.ok(text.includes(`https://explorer.arc.io/tx/${hash}`), `no link for transaction ${n}`);
    }
  });

  it("takes the tokens from the config, not from a built-in list", async () => {
    const other = "0x00000000000000000000000000000000000000b1";
    const other2 = "0x00000000000000000000000000000000000000b2";
    const h = harness({ tokens: [other, other2] }, {
      "deployments/config/5042.json": {
        chainId: 5042,
        tokens: [
          { symbol: "USDC", address: other, decimals: 6, ...PROVENANCE },
          { symbol: "cirBTC", address: other2, decimals: 8, ...PROVENANCE },
        ],
      },
    });
    await h.go("create");
    const targets = calls(h.w).filter((r) => r.includes("--from")).map((r) => r[1].toLowerCase());
    assert.deepEqual(targets, [other2, other]);
  });

  it("refuses a token whose config entry has no source URL or no confirmation date", async () => {
    for (const missing of ["source", "confirmed"]) {
      const entry = { symbol: "cirBTC", address: CIRBTC, decimals: 8, ...PROVENANCE };
      delete entry[missing];
      const h = harness({}, {
        "deployments/config/5042.json": {
          chainId: 5042,
          tokens: [{ symbol: "USDC", address: USDC, decimals: 6, ...PROVENANCE }, entry],
        },
      });
      await assert.rejects(h.go("create"), new RegExp(`cirBTC.*${missing}`));
      assert.equal(h.w.runs.length, 1, "a call was made before the config was refused");
    }
  });

  it("refuses a config with no USDC or no cirBTC", async () => {
    const h = harness({}, {
      "deployments/config/5042.json": {
        chainId: 5042,
        tokens: [{ symbol: "USDC", address: USDC, decimals: 6, ...PROVENANCE }],
      },
    });
    await assert.rejects(h.go("create"), /cirBTC/);
  });

  it("states the seed's constants", () => {
    assert.equal(SEED.chainId, 5042);
    assert.equal(SEED.staker.toLowerCase(), STAKER);
    assert.equal(SEED.referee.toLowerCase(), REFEREE);
    assert.equal(SEED.beneficiary.toLowerCase(), BENEFICIARY);
    assert.deepEqual(SEED.pledges.map((p) => p.text), TEXTS);
    assert.deepEqual(SEED.pledges.map((p) => p.amount), AMOUNTS);
    assert.deepEqual(SEED.pledges.map((p) => p.symbol), ["cirBTC", "USDC", "USDC", "cirBTC"]);
  });

  it("keeps the total stake under five dollars: 2 USDC plus 2000 sats is five dollars up to 150,000 dollars a bitcoin", () => {
    const usdc = SEED.pledges.filter((p) => p.symbol === "USDC").reduce((s, p) => s + p.amount, 0n);
    const sats = SEED.pledges.filter((p) => p.symbol === "cirBTC").reduce((s, p) => s + p.amount, 0n);
    assert.equal(usdc, 2000000n);
    assert.equal(sats, 2000n);
    // dollars = usdc / 1e6 + sats * price / 1e8, at the highest price the bound is claimed for
    assert.ok(Number(usdc) / 1e6 + (Number(sats) * 150000) / 1e8 <= 5);
  });

  it("keeps the promise texts within the limit and free of em dashes", () => {
    for (const p of SEED.pledges) {
      assert.ok(p.text.length > 0 && Buffer.byteLength(p.text) <= 280);
      assert.ok(!p.text.includes("—"));
    }
  });
});

/** A world in which `create --send` was interrupted: `k` pledges exist and the next creation failed. */
async function interruptedAfter(k, over = {}) {
  const h = harness({ failSend: (fn, args) => fn === "createPledge" && args[5] === TEXTS[k], ...over });
  await assert.rejects(h.go("create", { send: true }), /status/i);
  h.w.failSend = () => false;
  h.w.runs.length = 0;
  h.lines.length = 0;
  return h;
}
const allowanceKey = (token, owner = STAKER) => `${token}|${owner}|${SATSTAKE}`;
const approveArgs = (w) =>
  sends(w)
    .filter((r) => fnOf(r).functionName === "approve")
    .map((r) => [r[1].toLowerCase(), fnOf(r).args[1]]);

describe("LLR-DP-009 create resumes after an interruption", () => {
  for (const k of [1, 2, 3]) {
    it(`continues at pledge ${k + 1} when ${k} seed pledge(s) exist, with no approval the allowance already covers`, async () => {
      const h = await interruptedAfter(k);
      assert.equal(h.w.pledges.length, k);
      await h.go("create", { send: true });
      assert.deepEqual(sendsOf(h.w), Array(4 - k).fill("createPledge"));
      assert.equal(h.w.pledges.length, 4);
      h.w.pledges.forEach((p, i) => {
        assert.equal(p.promiseText, TEXTS[i]);
        assert.equal(p.amount, AMOUNTS[i]);
        assert.equal(p.token, TOKENS[i]);
      });
      assert.deepEqual([...h.w.allowances.values()], [0n, 0n]);
    });
  }

  it("takes the deadlines of the resumed pledges from the latest block time, and D's from the fixed date", async () => {
    const h = await interruptedAfter(1);
    await h.go("create", { send: true });
    const [, b, c, d] = h.w.pledges;
    assert.equal(b.deadline, b.createdAt + 120n);
    assert.equal(c.deadline, c.createdAt + BigInt(7 * DAY));
    assert.equal(d.deadline, 1793491200n);
  });

  it("approves only the token whose approval was never mined, when stopped between the two approvals", async () => {
    const h = harness({ failSend: (fn, args) => fn === "approve" && args[1] === 2000000n });
    await assert.rejects(h.go("create", { send: true }), /status/i);
    h.w.failSend = () => false;
    h.w.runs.length = 0;
    await h.go("create", { send: true });
    assert.deepEqual(approveArgs(h.w), [[USDC, 2000000n]]);
    assert.equal(h.w.pledges.length, 4);
  });

  it("approves exactly the remainder when the allowance has fallen short of it", async () => {
    const h = await interruptedAfter(1);
    h.w.allowances.set(allowanceKey(CIRBTC), 0n);
    h.w.allowances.set(allowanceKey(USDC), 5n);
    await h.go("create", { send: true });
    assert.deepEqual(approveArgs(h.w), [
      [CIRBTC, 1000n],
      [USDC, 2000000n],
    ]);
    assert.deepEqual(sendsOf(h.w), ["approve", "approve", "createPledge", "createPledge", "createPledge"]);
  });

  it("never approves more than the remainder, even when the allowance is larger", async () => {
    const h = await interruptedAfter(1);
    h.w.allowances.set(allowanceKey(CIRBTC), 5000n);
    await h.go("create", { send: true });
    assert.deepEqual(approveArgs(h.w), [[CIRBTC, 1000n]]);
  });

  it("approves nothing for a token no remaining pledge locks", async () => {
    const h = await interruptedAfter(3);
    h.w.allowances.set(allowanceKey(USDC), 7n);
    await h.go("create", { send: true });
    assert.deepEqual(approveArgs(h.w), []);
  });

  it("without --send simulates the remaining creations when no approval is needed, and sends nothing", async () => {
    const h = await interruptedAfter(2);
    await h.go("create");
    assert.equal(sends(h.w).length, 0);
    const sim = calls(h.w).filter((r) => r.includes("--from"));
    assert.deepEqual(sim.map((r) => fnOf(r).functionName), ["createPledge", "createPledge"]);
    assert.deepEqual(sim.map((r) => fnOf(r).args[5]), [TEXTS[2], TEXTS[3]]);
  });

  it("without --send still says the creations are not simulated when an approval would have to be mined first", async () => {
    const h = await interruptedAfter(1);
    h.w.allowances.set(allowanceKey(CIRBTC), 0n);
    await h.go("create");
    assert.match(h.lines.join("\n"), /createPledge[^\n]*not simulated[^\n]*approval/i);
    assert.deepEqual(calls(h.w).filter((r) => r.includes("--from")).map((r) => fnOf(r).functionName), ["approve"]);
  });

  const defects = [
    ["staker", (p) => (p.staker = OTHER)],
    ["token", (p) => (p.token = p.token === USDC ? CIRBTC : USDC)],
    ["amount", (p) => (p.amount += 1n)],
    ["referee", (p) => (p.referee = OTHER)],
    ["beneficiary", (p) => (p.beneficiary = OTHER)],
    ["promise", (p) => (p.promiseText = "Changed.")],
  ];
  for (const [name, mutate] of defects) {
    it(`refuses to resume over an existing pledge whose ${name} differs from the seed`, async () => {
      const h = await interruptedAfter(2);
      mutate(h.w.pledges[1]);
      await assert.rejects(h.go("create", { send: true }), new RegExp(`pledge 2 is not the seed's: ${name}`));
      assert.equal(sends(h.w).length, 0);
    });
  }

  it("refuses when all four pledges exist, even though they match the seed", async () => {
    const h = await seeded();
    await assert.rejects(h.go("create", { send: true }), /pledgeCount is 4/);
    assert.equal(sends(h.w).length, 0);
  });

  it("refuses when a pledge of the prefix cannot be read", async () => {
    const h = await interruptedAfter(2);
    const run = h.deps.run;
    h.deps.run = async (args) =>
      args[0] === "call" && !args.includes("--from") && fnOf(args).functionName === "getPledge"
        ? { status: 1, stdout: "", stderr: "rpc down" }
        : run(args);
    await assert.rejects(h.go("create", { send: true }), /pledge 1 could not be read/);
    assert.equal(sends(h.w).length, 0);
  });
});

describe("LLR-DP-009 the deadline of the fourth pledge is compared exactly", () => {
  for (const phase of ["verdicts", "settle"]) {
    for (const delta of [1n, -1n]) {
      it(`${phase} names pledge 4 when its deadline is off by ${delta}`, async () => {
        const h = await seeded();
        h.w.signer = phase === "verdicts" ? REFEREE : OTHER;
        h.w.pledges[3].deadline += delta;
        h.w.now = Number(h.w.pledges[1].deadline);
        await assert.rejects(h.go(phase, { send: true }), /pledge 4\b.*deadline/s);
        assert.equal(sends(h.w).length, 0);
      });
    }
  }

  it("does not pin the deadline of a pledge whose deadline is relative to the block it was created in", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.pledges[0].deadline += 5n;
    await h.go("verdicts", { send: true });
    assert.deepEqual(sendsOf(h.w), ["markKept", "markBroken"]);
  });
});

describe("LLR-DP-009 the contract is checked before any approval", () => {
  for (const phase of ["create", "verdicts", "settle"]) {
    it(`${phase} refuses a record address that holds no code, before any simulation or send`, async () => {
      const h = harness({ hasCode: (address) => address !== SATSTAKE });
      await assert.rejects(h.go(phase, { send: true }), /no contract code/);
      assert.equal(sends(h.w).length, 0);
      assert.equal(calls(h.w).filter((r) => r.includes("--from")).length, 0);
    });
  }

  const wrong = [
    ["a token that is not the config's", [USDC, OTHER]],
    ["only one token", [USDC]],
    ["a third token", [USDC, CIRBTC, OTHER]],
    ["the same token twice", [USDC, USDC]],
    ["the other token twice", [CIRBTC, CIRBTC]],
    ["no tokens", []],
  ];
  for (const [name, allowedTokens] of wrong) {
    it(`refuses a contract whose allowedTokens() holds ${name}`, async () => {
      const h = harness({ allowedTokens });
      await assert.rejects(h.go("create", { send: true }), /allowedTokens/);
      assert.equal(sends(h.w).length, 0);
      assert.equal(calls(h.w).filter((r) => r.includes("--from")).length, 0);
    });
  }

  it("accepts the config's two tokens in either order", async () => {
    for (const allowedTokens of [
      [USDC, CIRBTC],
      [CIRBTC, USDC],
    ]) {
      const h = harness({ allowedTokens });
      await h.go("create");
      assert.match(h.lines.join("\n"), /simulated ok/);
    }
  });
});

describe("LLR-DP-003 nothing of a home path reaches the output", () => {
  it("redacts home directories from a failing cast call", async () => {
    const h = harness();
    const run = h.deps.run;
    h.deps.run = async (args) =>
      args[0] === "block"
        ? { status: 1, stdout: "", stderr: "error: /Users/jane/.foundry/ks/k and /home/bob/.cache/x" }
        : run(args);
    await assert.rejects(h.go("create", { send: true }), (error) => {
      assert.ok(!/jane|bob/.test(error.message), error.message);
      assert.match(error.message, /<home>/);
      return true;
    });
  });

  it("redacts home directories from a failed simulation", async () => {
    const h = harness();
    const run = h.deps.run;
    h.deps.run = async (args) =>
      args[0] === "call" && args.includes("--from") ? { status: 1, stdout: "", stderr: "failed at /Users/jane/x" } : run(args);
    await assert.rejects(h.go("create", { send: true }), (error) => {
      assert.ok(!error.message.includes("jane"), error.message);
      assert.match(error.message, /simulation[^\n]*<home>/);
      return true;
    });
  });
});

const T = {
  staker: "0x00000000000000000000000000000000000000a1",
  referee: "0x00000000000000000000000000000000000000a2",
  beneficiary: "0x00000000000000000000000000000000000000a3",
  cirBTC: "0xf0c4a4ce82a5746abaad9425360ab04fbba432bf",
};
const SIGNER_FILE = "/ks/rehearsal-staker";
const T_AMOUNTS = [100n, 100000n, 100000n, 100n];
const T_FILES = {
  "cache/seed-rehearsal/record.json": { chainId: 5042002, address: SATSTAKE },
  "cache/seed-rehearsal/roles.json": { staker: T.staker, referee: T.referee, beneficiary: T.beneficiary },
  "deployments/config/5042002.json": {
    chainId: 5042002,
    tokens: [
      { symbol: "USDC", address: USDC, decimals: 6, ...PROVENANCE },
      { symbol: "cirBTC", address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", decimals: 8, ...PROVENANCE },
    ],
  },
};

function harnessT(over = {}, files = {}) {
  const base = harness(
    { chainId: 5042002, rpc: "arc_testnet", auth: ["--keystore", SIGNER_FILE], signer: T.staker, tokens: [USDC, T.cirBTC], ...over },
    { ...T_FILES, ...files },
  );
  const go = (phase, { send = false, testnet = true } = {}) =>
    runSeed({ phase, keystore: SIGNER_FILE, passwordFile: PASSWORD_FILE, send, testnet }, base.deps);
  return { ...base, go };
}

describe("LLR-DP-009 the rehearsal plan on Arc testnet", () => {
  it("takes --testnet and --keystore in place of --account", () => {
    assert.deepEqual(parseArgs(["create", "--testnet", "--keystore", "/k", "--password-file", "/p", "--send"]), {
      phase: "create",
      account: undefined,
      keystore: "/k",
      passwordFile: "/p",
      send: true,
      testnet: true,
    });
    assert.equal(parseArgs(["create", "--testnet", "--account", "a", "--password-file", "/p"]).account, "a");
  });

  it("allows --keystore only with --testnet, and exactly one way to name the signer", () => {
    assert.throws(() => parseArgs(["create", "--keystore", "/k", "--password-file", "/p"]), /--testnet/);
    assert.throws(
      () => parseArgs(["create", "--testnet", "--account", "a", "--keystore", "/k", "--password-file", "/p"]),
      /either|both|one/,
    );
    assert.throws(() => parseArgs(["create", "--testnet", "--password-file", "/p"]), /--account|--keystore/);
    assert.throws(() => parseArgs(["create", "--testnet", "--keystore"]), /--keystore needs a value/);
  });

  for (const phase of ["create", "verdicts", "settle"]) {
    it(`${phase} stops at the chain id when --testnet meets Arc mainnet`, async () => {
      const h = harnessT({ chainId: 5042 });
      await assert.rejects(h.go(phase, { send: true }), /5042002/);
      assert.deepEqual(h.w.runs, [["chain-id", "--rpc-url", "arc_testnet"]]);
      assert.deepEqual(h.reads, []);
    });
  }

  it("never reaches the mainnet plan: no mainnet file is read and no mainnet endpoint is used", async () => {
    const h = harnessT();
    await h.go("create", { send: true });
    assert.deepEqual([...new Set(h.reads)].sort(), [
      "cache/seed-rehearsal/record.json",
      "cache/seed-rehearsal/roles.json",
      "deployments/config/5042002.json",
    ]);
    for (const r of h.w.runs) assert.ok(r[0] === "wallet" || r.includes("arc_testnet"), r.join(" "));
    assert.ok(!JSON.stringify(h.w.runs).includes("arc_mainnet"));
  });

  it("does not fall back to the mainnet record when the rehearsal record is missing", async () => {
    const h = harnessT();
    h.deps.readJson = (path) => {
      h.reads.push(path);
      throw new Error(`no such file ${path}`);
    };
    await assert.rejects(h.go("create"), /no such file cache\/seed-rehearsal\/record\.json/);
    assert.ok(!h.reads.some((p) => p.includes("5042.json")));
  });

  it("refuses a rehearsal record or config that names Arc mainnet", async () => {
    await assert.rejects(harnessT({}, { "cache/seed-rehearsal/record.json": { chainId: 5042, address: SATSTAKE } }).go("create"), /record/);
    await assert.rejects(
      harnessT({}, { "deployments/config/5042002.json": { ...T_FILES["deployments/config/5042002.json"], chainId: 5042 } }).go("create"),
      /config is for chain/,
    );
  });

  it("refuses a roles file with a missing or malformed address", async () => {
    const roles = T_FILES["cache/seed-rehearsal/roles.json"];
    for (const bad of [{ ...roles, referee: undefined }, { ...roles, staker: "nope" }]) {
      await assert.rejects(harnessT({}, { "cache/seed-rehearsal/roles.json": bad }).go("create"), /roles/);
    }
  });

  it("runs create, verdicts and settle with the rehearsal's roles and its smaller amounts, signing from a file", async () => {
    const h = harnessT();
    await h.go("create", { send: true });
    assert.deepEqual(h.w.pledges.map((p) => p.amount), T_AMOUNTS);
    assert.deepEqual(h.w.pledges.map((p) => p.token), [T.cirBTC, USDC, USDC, T.cirBTC]);
    for (const p of h.w.pledges) {
      assert.equal(p.staker, T.staker);
      assert.equal(p.referee, T.referee);
      assert.equal(p.beneficiary, T.beneficiary);
    }
    assert.deepEqual(approveArgs(h.w), [
      [T.cirBTC, 200n],
      [USDC, 200000n],
    ]);
    h.w.signer = T.referee;
    await h.go("verdicts", { send: true });
    h.w.signer = OTHER;
    h.w.now = Number(h.w.pledges[1].deadline);
    await h.go("settle", { send: true });
    assert.deepEqual(h.w.pledges.map((p) => p.status), [4, 5, 5, 1]);
    for (const r of sends(h.w)) {
      assert.ok(r.includes(h.w.auth[0]) && !r.includes("--account"));
      assert.equal(flag(r, "--rpc-url"), "arc_testnet");
    }
    assert.match(h.lines.join("\n"), /https:\/\/explorer\.testnet\.arc\.io\/tx\/0x/);
    assert.ok(!h.lines.join("\n").includes("https://explorer.arc.io"));
  });

  it("refuses the mainnet staker's role: the rehearsal signer must be the rehearsal's staker", async () => {
    const h = harnessT({ signer: STAKER });
    await assert.rejects(h.go("create", { send: true }), /staker/);
    assert.equal(sends(h.w).length, 0);
  });

  it("resumes an interrupted rehearsal create the same way", async () => {
    const h = harnessT({ failSend: (fn, args) => fn === "createPledge" && args[5] === TEXTS[2] });
    await assert.rejects(h.go("create", { send: true }), /status/i);
    h.w.failSend = () => false;
    h.w.runs.length = 0;
    await h.go("create", { send: true });
    assert.deepEqual(sendsOf(h.w), ["createPledge", "createPledge"]);
    assert.equal(h.w.pledges.length, 4);
  });

  it("refuses a keystore path on the mainnet plan, after the chain check and before anything is read or signed", async () => {
    const h = harness();
    await assert.rejects(
      runSeed({ phase: "create", keystore: SIGNER_FILE, passwordFile: PASSWORD_FILE, send: true, testnet: false }, h.deps),
      /--account/,
    );
    assert.deepEqual(h.w.runs, [["chain-id", "--rpc-url", RPC]]);
    assert.deepEqual(h.reads, []);
  });

  it("a rehearsal world on mainnet's chain id never reads the mainnet record, whatever the rehearsal files say", async () => {
    const h = harnessT({ chainId: 5042 }, { "cache/seed-rehearsal/record.json": { chainId: 5042, address: SATSTAKE } });
    await assert.rejects(h.go("create", { send: true }), /5042002/);
    assert.deepEqual(h.reads, []);
  });
});

describe("LLR-DP-009 a send that fails after broadcast", () => {
  const HASH = `0x${"ab".repeat(32)}`;
  const create = (h) => h.go("create", { send: true });

  it("reports the hash cast gave, and says the transaction may still be pending", async () => {
    const h = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "error" : undefined), sendFaultHash: HASH });
    await assert.rejects(create(h), (error) => {
      assert.ok(error.message.includes(`https://explorer.arc.io/tx/${HASH}`), error.message);
      assert.match(error.message, /createPledge 2/);
      assert.match(error.message, /may still be pending/i);
      assert.match(error.message, /wait/i);
      return true;
    });
  });

  it("still says it may be pending when cast gave no hash", async () => {
    const h = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "error" : undefined) });
    await assert.rejects(create(h), /no hash.*may still be pending/is);
  });

  it("re-reads pledgeCount before stopping and reports it, landed or not", async () => {
    const landed = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "landed" : undefined) });
    await assert.rejects(create(landed), /pledgeCount is 2/);
    const lost = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "error" : undefined) });
    await assert.rejects(lost.go("create", { send: true }), /pledgeCount is 1/);
    const last = lost.w.runs[lost.w.runs.length - 1];
    assert.equal(last[0], "call");
    assert.equal(fnOf(last).functionName, "pledgeCount");
  });

  it("re-reads the state of the pledge after a failed verdict or settlement", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.sendFault = (fn) => (fn === "markKept" ? "landed" : undefined);
    await assert.rejects(h.go("verdicts", { send: true }), /pledge 1 is Kept/);
    const s = await seeded();
    s.w.signer = REFEREE;
    await s.go("verdicts", { send: true });
    s.w.signer = OTHER;
    s.w.now = Number(s.w.pledges[1].deadline);
    s.w.sendFault = (fn, args) => (fn === "settle" && args[0] === 1n ? "landed" : undefined);
    await assert.rejects(s.go("settle", { send: true }), /pledge 1 is SettledToStaker/);
  });

  it("re-reads the pledge that failed, not the first one", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.sendFault = (fn) => (fn === "markBroken" ? "landed" : undefined);
    await assert.rejects(h.go("verdicts", { send: true }), /pledge 3 is Broken/);
    const s = await seeded();
    s.w.signer = REFEREE;
    await s.go("verdicts", { send: true });
    s.w.signer = OTHER;
    s.w.now = Number(s.w.pledges[1].deadline);
    s.w.sendFault = (fn, args) => (fn === "settle" && args[0] === 3n ? "error" : undefined);
    await assert.rejects(s.go("settle", { send: true }), /pledge 3 is Broken/);
  });

  it("says to rerun the same command once the transaction is mined or dropped", async () => {
    const h = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "error" : undefined) });
    await assert.rejects(create(h), /mined or dropped, then rerun the same command/);
  });

  it("takes no hash out of longer revert data, which no broadcast produced", async () => {
    const h = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "error" : undefined) });
    const run = h.deps.run;
    const revertData = `0x3f2b9a4e${"0".repeat(56)}69a1b2c3`;
    h.deps.run = async (args) => {
      const result = await run(args);
      return args[0] === "send" && result.status !== 0 ? { ...result, stderr: `custom error 0x3f2b9a4e: data: "${revertData}"` } : result;
    };
    await assert.rejects(create(h), (error) => {
      assert.match(error.message, /No hash was reported/);
      assert.ok(!error.message.includes("explorer"), error.message);
      return true;
    });
  });

  it("reports a failed simulation in a dry run and does not call it ok", async () => {
    const h = await seeded();
    h.w.signer = REFEREE;
    h.w.failCall = (fn) => fn === "markKept";
    const before = sends(h.w).length;
    await assert.rejects(h.go("verdicts"), /simulation of .*failed, nothing sent/);
    assert.ok(!h.lines.some((line) => line.startsWith("markKept") && line.includes("simulated ok")), h.lines.join("\n"));
    assert.equal(sends(h.w).length, before);
  });

  it("redacts a home directory from what cast reported", async () => {
    const h = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "error" : undefined) });
    const run = h.deps.run;
    h.deps.run = async (args) => {
      const result = await run(args);
      return args[0] === "send" && result.status !== 0 ? { ...result, stderr: "cannot read /Users/jane/work/file" } : result;
    };
    await assert.rejects(create(h), (error) => {
      assert.ok(!error.message.includes("/Users/jane"), error.message);
      assert.match(error.message, /<home>/);
      return true;
    });
  });

  it("does not report a failed re-read as the state", async () => {
    const h = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[0] ? "error" : undefined) });
    const run = h.deps.run;
    let failed = false;
    h.deps.run = async (args) => {
      if (args[0] === "send" && fnOf(args).functionName === "createPledge") failed = true;
      if (failed && args[0] === "call" && fnOf(args).functionName === "pledgeCount") return { status: 1, stdout: "", stderr: "rpc down" };
      return run(args);
    };
    await assert.rejects(create(h), /could not be re-read.*rpc down|rpc down.*could not be re-read/is);
  });

  it("a rerun after the earlier transaction landed late creates no duplicate", async () => {
    const h = harness({ sendFault: (fn, args) => (fn === "createPledge" && args[5] === TEXTS[1] ? "late" : undefined) });
    await assert.rejects(create(h), /may still be pending/i);
    assert.equal(h.w.pledges.length, 1);
    h.w.land();
    assert.equal(h.w.pledges.length, 2);
    h.w.sendFault = undefined;
    h.w.runs.length = 0;
    await create(h);
    assert.equal(h.w.pledges.length, 4);
    assert.deepEqual(h.w.pledges.map((p) => p.promiseText), TEXTS);
  });

  it("an approval that fails after broadcast reports the allowance it re-read", async () => {
    const h = harness({ sendFault: (fn) => (fn === "approve" ? "landed" : undefined) });
    await assert.rejects(create(h), /allowance is 2000/);
  });
});

describe("LLR-DP-009 a pledge that is not the seed's", () => {
  it("is refused by create in words that say a non-seed pledge exists", async () => {
    const h = harness();
    await h.go("create", { send: true });
    h.w.pledges.length = 1;
    h.w.pledges[0].staker = OTHER;
    h.w.runs.length = 0;
    await assert.rejects(h.go("create", { send: true }), /pledge 1 is not the seed's.*pledge that is not part of the seed exists/s);
    assert.equal(sends(h.w).length, 0);
  });
});
