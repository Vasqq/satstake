// Tests for the deployment record (LLR-DP-005) and for the Sourcify status it carries
// (LLR-DP-006). The record is assembled from the broadcast artifact, the compiled artifact, and
// git, so these tests drive that assembly with fixtures of each and never touch the network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asNumber, buildRecord, dirtyPathsFrom, sourcifyStatus } from "../../tools/record-deployment.mjs";

const ADDRESS = "0x9aD0d2A1F0e94D2E8Ff7AD6B0f0aE3cFd4a2B1c6";
const TX = "0x4d1c1b9e4a1c4f6b8c2d0e5a7f3b9d1c6e8a0f2b4d6c8e0a2f4b6d8c0e2a4f6b";
const COMMIT = "fc077c9e2b4a6c8e0f2a4b6d8c0e2a4f6b8d0c2e";
const CREATION_CODE = "0x60806040523480156100";

const artifact = () => ({
  bytecode: { object: CREATION_CODE },
  metadata: {
    compiler: { version: "0.8.28+commit.7893614a" },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      metadata: { bytecodeHash: "ipfs" },
      compilationTarget: { "src/SatStake.sol": "SatStake" },
    },
  },
});

const broadcast = (overrides = {}) => ({
  chain: 5042002,
  commit: COMMIT.slice(0, 7),
  transactions: [
    {
      hash: TX,
      transactionType: "CREATE",
      contractName: "SatStake",
      contractAddress: ADDRESS,
      // Creation code followed by the constructor arguments.
      transaction: { input: `${CREATION_CODE}${"a".repeat(128)}` },
    },
  ],
  receipts: [{ transactionHash: TX, status: "0x1", blockNumber: "0x2a" }],
  ...overrides,
});

const receipt = (overrides = {}) => [{ transactionHash: TX, status: "0x1", blockNumber: "0x2a", ...overrides }];

const inputs = (overrides = {}) => ({
  chainId: 5042002,
  contractName: "SatStake",
  broadcast: broadcast(),
  artifact: artifact(),
  gitCommit: COMMIT,
  dirtyPaths: [],
  sourcify: null,
  ...overrides,
});

describe("LLR-DP-005 deployment record", () => {
  it("records the address, the deploy transaction, the block, the commit, the compiler, and the status", () => {
    const record = buildRecord(inputs());
    assert.equal(record.chainId, 5042002);
    assert.equal(record.contract, "SatStake");
    assert.equal(record.address, ADDRESS);
    assert.equal(record.deployTransaction, TX);
    assert.equal(record.blockNumber, 42);
    assert.equal(record.gitCommit, COMMIT);
    assert.equal(record.compiler.version, "0.8.28+commit.7893614a");
    assert.deepEqual(record.compiler.settings.optimizer, { enabled: true, runs: 200 });
    assert.equal(record.compiler.settings.evmVersion, "cancun");
    assert.deepEqual(record.verification.sourcify, { match: "pending", creationMatch: null, runtimeMatch: null, perfectMatch: false });
  });

  it("reads a block number given as a JSON number as well as one given as hex", () => {
    const decimal = broadcast({ receipts: receipt({ blockNumber: 42 }) });
    assert.equal(buildRecord(inputs({ broadcast: decimal })).blockNumber, 42);
    assert.equal(buildRecord(inputs()).blockNumber, 42);
  });

  it("refuses a number that is neither a JSON number nor 0x-prefixed hex", () => {
    // "42" read as hex is 66. A block number off by that much would send a reader of the record to
    // the wrong block.
    assert.throws(() => asNumber("42"), /42/);
    assert.equal(asNumber("0x2a"), 42);
    assert.equal(asNumber(42), 42);
  });

  const exact = { match: "exact_match", creationMatch: "exact_match", runtimeMatch: "exact_match" };

  it("records a perfect Sourcify match as verified, with all three match fields", () => {
    assert.deepEqual(buildRecord(inputs({ sourcify: exact })).verification.sourcify, { ...exact, perfectMatch: true });
  });

  it("does not record a partial Sourcify match as verified", () => {
    // Sourcify's v2 API answers "match" for a partially verified contract and "exact_match" only
    // for a perfect one, and LLR-DP-006 asks for a perfect match.
    const partial = { match: "match", creationMatch: "match", runtimeMatch: "match" };
    assert.deepEqual(buildRecord(inputs({ sourcify: partial })).verification.sourcify, { ...partial, perfectMatch: false });
  });

  it("does not record a perfect summary as verified when only the runtime side matches partially", () => {
    // Sourcify's own v2 API specification gives this response as an example: the summary `match`
    // reads exact_match while one side is only a partial match.
    const sourcify = { ...exact, runtimeMatch: "match" };
    assert.deepEqual(buildRecord(inputs({ sourcify })).verification.sourcify, { ...sourcify, perfectMatch: false });
  });

  it("does not record a perfect summary as verified when only the creation side matches partially", () => {
    const sourcify = { ...exact, creationMatch: "match" };
    assert.deepEqual(buildRecord(inputs({ sourcify })).verification.sourcify, { ...sourcify, perfectMatch: false });
  });

  it("does not record a match as verified when only the summary is partial", () => {
    const sourcify = { ...exact, match: "match" };
    assert.deepEqual(buildRecord(inputs({ sourcify })).verification.sourcify, { ...sourcify, perfectMatch: false });
  });

  it("says pending, not verified, while Sourcify has no match", () => {
    // The status is only ever what Sourcify answered, so a record cannot claim a verification
    // that did not happen.
    assert.deepEqual(buildRecord(inputs({ sourcify: null })).verification.sourcify, {
      match: "pending",
      creationMatch: null,
      runtimeMatch: null,
      perfectMatch: false,
    });
  });

  it("refuses when the tree that produced the contract has uncommitted changes", () => {
    // The recorded commit identifies the deployed source only if the sources are committed.
    assert.throws(() => buildRecord(inputs({ dirtyPaths: ["src/SatStake.sol"] })), (error) => {
      assert.match(error.message, /uncommitted/);
      assert.match(error.message, /src\/SatStake\.sol/);
      assert.match(error.message, /bytecode/);
      return true;
    });
  });

  it("refuses when the deployment was broadcast at another commit", () => {
    const elsewhere = broadcast({ commit: "0000000" });
    assert.throws(() => buildRecord(inputs({ broadcast: elsewhere })), /commit/i);
  });

  it("refuses when the broadcast names no commit at all", () => {
    // The commit guard is the only check that catches an out/ artifact built at another commit than
    // HEAD, so a broadcast with no commit must fail rather than skip it.
    const anonymous = broadcast();
    delete anonymous.commit;
    assert.throws(() => buildRecord(inputs({ broadcast: anonymous })), /commit/i);
  });

  it("refuses when the broadcast is for another chain than the record", () => {
    assert.throws(() => buildRecord(inputs({ broadcast: broadcast({ chain: 5042 }) })), /5042\b/);
  });

  it("refuses when the broadcast creation data does not begin with the compiled bytecode", () => {
    const other = artifact();
    other.bytecode.object = "0x6080604052ffffffff";
    assert.throws(() => buildRecord(inputs({ artifact: other })), /bytecode/i);
  });

  it("refuses when the compiled artifact carries no bytecode", () => {
    // "0x" is a prefix of every creation input, so an artifact with empty bytecode would make the
    // comparison vacuous rather than failing it.
    const empty = artifact();
    empty.bytecode.object = "0x";
    assert.throws(() => buildRecord(inputs({ artifact: empty })), /bytecode/i);
  });

  it("refuses when the creation transaction did not succeed", () => {
    // A reverted creation still has a receipt with a block number, and the address comes from the
    // transaction, so without this the record would name an address holding no code.
    const reverted = broadcast({ receipts: receipt({ status: "0x0" }) });
    assert.throws(() => buildRecord(inputs({ broadcast: reverted })), /status/i);
  });

  it("refuses when the receipt carries no status", () => {
    const statusless = receipt();
    delete statusless[0].status;
    assert.throws(() => buildRecord(inputs({ broadcast: broadcast({ receipts: statusless }) })), /status/i);
  });

  it("refuses when the broadcast holds no creation of the contract", () => {
    const empty = broadcast({ transactions: [], receipts: [] });
    assert.throws(() => buildRecord(inputs({ broadcast: empty })), /SatStake/);
  });

  it("refuses when the creation has no receipt", () => {
    assert.throws(() => buildRecord(inputs({ broadcast: broadcast({ receipts: [] }) })), /receipt/i);
  });

  it("refuses when the compiled artifact carries no compiler metadata", () => {
    const bare = artifact();
    delete bare.metadata;
    assert.throws(() => buildRecord(inputs({ artifact: bare })), /metadata/i);
  });
});

describe("LLR-DP-005 dirty paths", () => {
  it("names each path git reports as changed", () => {
    assert.deepEqual(dirtyPathsFrom(" M src/SatStake.sol\n?? src/Other.sol\n"), ["src/SatStake.sol", "src/Other.sol"]);
  });

  it("names the destination of a rename rather than both halves", () => {
    assert.deepEqual(dirtyPathsFrom("R  src/Old.sol -> src/New.sol\n"), ["src/New.sol"]);
  });

  it("is empty for a clean tree", () => {
    assert.deepEqual(dirtyPathsFrom(""), []);
  });
});

describe("LLR-DP-006 Sourcify status", () => {
  const response = (status, body) => async () => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });

  it("returns all three match fields Sourcify reports", async () => {
    const fetched = response(200, {
      match: "exact_match",
      creationMatch: "exact_match",
      runtimeMatch: "match",
      address: ADDRESS,
      chainId: "5042002",
    });
    assert.deepEqual(await sourcifyStatus(5042002, ADDRESS, fetched), {
      match: "exact_match",
      creationMatch: "exact_match",
      runtimeMatch: "match",
    });
  });

  it("returns a partial match as the partial match it is", async () => {
    const fetched = response(200, { match: "match", creationMatch: "match", runtimeMatch: "match", address: ADDRESS });
    assert.deepEqual(await sourcifyStatus(5042002, ADDRESS, fetched), { match: "match", creationMatch: "match", runtimeMatch: "match" });
  });

  it("returns no match when Sourcify has no record of the address", async () => {
    const fetched = response(404, { match: null, address: ADDRESS, chainId: "5042002" });
    assert.equal(await sourcifyStatus(5042002, ADDRESS, fetched), null);
  });

  it("asks Sourcify about the chain and address it was given", async () => {
    let asked = "";
    const fetched = async (url) => {
      asked = url;
      return { status: 404, ok: false, json: async () => ({ match: null }) };
    };
    await sourcifyStatus(5042002, ADDRESS, fetched);
    assert.match(asked, /5042002/);
    assert.match(asked, new RegExp(ADDRESS, "i"));
  });

  it("fails rather than reporting pending when Sourcify cannot be reached", async () => {
    // A network failure is not evidence that the contract is unverified.
    const fetched = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    await assert.rejects(() => sourcifyStatus(5042002, ADDRESS, fetched), /ENOTFOUND/);
  });
});
