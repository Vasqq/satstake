// Tests for the Sourcify v2 verification tool (LLR-DP-006). `forge verify-contract --verifier
// sourcify` posts to the legacy endpoint and fails against the live server (see the header of
// tools/verify-sourcify.mjs), so this tool drives the v2 API directly and these tests drive it
// with a stub `fetch`, never a real network call.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertChainSupported,
  assertPerfectMatch,
  assertAgreement,
  deploymentFor,
  existingMatchFor,
  pollUntilComplete,
  readBack,
  submitVerification,
  verifyOnSourcify,
} from "../../tools/verify-sourcify.mjs";

const CHAIN_ID = 5042002;
const ADDRESS = "0x3ae26b15b9085ddb223ffeb503b4f713e682cac4";
const CREATION_TX = "0xcee5ec10fd42ceb39a35ec2dd51b7b69ce80c8d1f8e98b32c7749214c442c736";
const VERIFICATION_ID = "b6b1a5e0-1c2d-4e3f-8a9b-0c1d2e3f4a5b";

const perfectContract = () => ({ match: "exact_match", creationMatch: "exact_match", runtimeMatch: "exact_match" });

/** A stub `fetch` that answers `routes[url substring]` in call order, and records every call made. */
function stubFetch(routes) {
  const calls = [];
  const fetched = async (url, init) => {
    calls.push({ url, init });
    // The longest matching key wins, so a specific route (e.g. the poll URL for one verificationId)
    // is chosen over a shorter one that would also match (e.g. the general submit path).
    const key = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((k) => url.includes(k));
    if (!key) throw new Error(`stubFetch: no route registered for ${url}`);
    const next = routes[key];
    const entry = Array.isArray(next) ? next.shift() : next;
    if (!entry) throw new Error(`stubFetch: route for ${key} has no more responses queued`);
    return entry;
  };
  fetched.calls = calls;
  return fetched;
}

const jsonResponse = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

const noWait = async () => {};

describe("LLR-DP-006 deployment lookup", () => {
  it("reads the address and deployTransaction from the deployment record", () => {
    const record = deploymentFor(CHAIN_ID, () => ({ address: ADDRESS, deployTransaction: CREATION_TX }));
    assert.equal(record.address, ADDRESS);
    assert.equal(record.creationTransactionHash, CREATION_TX);
  });

  it("fails with its own message when the deployment file cannot be read", () => {
    const missing = () => {
      throw new Error(`ENOENT: no such file or directory, open 'deployments/${CHAIN_ID}.json'`);
    };
    assert.throws(() => deploymentFor(CHAIN_ID, missing), (error) => {
      assert.match(error.message, /could not be read/);
      assert.match(error.message, new RegExp(String(CHAIN_ID)));
      return true;
    });
  });

  it("fails with its own message when the record carries no address", () => {
    assert.throws(() => deploymentFor(CHAIN_ID, () => ({ deployTransaction: CREATION_TX })), (error) => {
      assert.match(error.message, /address/);
      return true;
    });
  });

  it("fails with its own message when the record carries no deployTransaction", () => {
    assert.throws(() => deploymentFor(CHAIN_ID, () => ({ address: ADDRESS })), (error) => {
      assert.match(error.message, /deployTransaction/);
      return true;
    });
  });
});

describe("LLR-DP-006 chain support", () => {
  it("passes for a chain Sourcify lists as supported", async () => {
    const fetched = stubFetch({ "/chains": jsonResponse(200, [{ chainId: CHAIN_ID, supported: true }]) });
    await assert.doesNotReject(() => assertChainSupported(CHAIN_ID, fetched));
  });

  it("refuses a chain Sourcify lists but does not support, naming the chain", async () => {
    const fetched = stubFetch({ "/chains": jsonResponse(200, [{ chainId: CHAIN_ID, supported: false }]) });
    await assert.rejects(() => assertChainSupported(CHAIN_ID, fetched), (error) => {
      assert.match(error.message, new RegExp(String(CHAIN_ID)));
      assert.match(error.message, /support/);
      return true;
    });
  });

  it("refuses a chain Sourcify does not list at all", async () => {
    const fetched = stubFetch({ "/chains": jsonResponse(200, [{ chainId: 1, supported: true }]) });
    await assert.rejects(() => assertChainSupported(CHAIN_ID, fetched), new RegExp(String(CHAIN_ID)));
  });

  it("stops before any submission is attempted for an unsupported chain", async () => {
    const fetched = stubFetch({
      "/chains": jsonResponse(200, [{ chainId: CHAIN_ID, supported: false }]),
      "/v2/verify/": () => {
        throw new Error("must not be called");
      },
    });
    await assert.rejects(() =>
      verifyOnSourcify(
        { chainId: CHAIN_ID, address: ADDRESS, creationTransactionHash: CREATION_TX, stdJsonInput: {}, compilerVersion: "0.8.28" },
        fetched,
      ),
    );
    assert.ok(fetched.calls.every((c) => !c.url.includes("/v2/verify/")), "submitted despite an unsupported chain");
  });
});

describe("LLR-DP-006 submission", () => {
  it("posts the standard JSON input, compiler version, contract identifier and creation tx hash", async () => {
    const fetched = stubFetch({ "/v2/verify/": jsonResponse(202, { verificationId: VERIFICATION_ID }) });
    const id = await submitVerification(
      { chainId: CHAIN_ID, address: ADDRESS, stdJsonInput: { language: "Solidity" }, compilerVersion: "0.8.28+commit.7893614a", creationTransactionHash: CREATION_TX },
      fetched,
    );
    assert.equal(id, VERIFICATION_ID);
    assert.equal(fetched.calls.length, 1);
    const call = fetched.calls[0];
    assert.match(call.url, new RegExp(`/v2/verify/${CHAIN_ID}/${ADDRESS}$`));
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers["Content-Type"], "application/json");
    const body = JSON.parse(call.init.body);
    assert.deepEqual(body.stdJsonInput, { language: "Solidity" });
    assert.equal(body.compilerVersion, "0.8.28+commit.7893614a");
    assert.equal(body.contractIdentifier, "src/SatStake.sol:SatStake");
    assert.equal(body.creationTransactionHash, CREATION_TX);
  });
});

describe("LLR-DP-006 polling", () => {
  it("polls until the job reports it is completed", async () => {
    const fetched = stubFetch({
      [`/v2/verify/${VERIFICATION_ID}`]: [
        jsonResponse(200, { isJobCompleted: false }),
        jsonResponse(200, { isJobCompleted: false }),
        jsonResponse(200, { isJobCompleted: true, contract: perfectContract() }),
      ],
    });
    const job = await pollUntilComplete(VERIFICATION_ID, fetched, { attempts: 5, wait: noWait });
    assert.equal(job.isJobCompleted, true);
    assert.equal(fetched.calls.length, 3);
  });

  it("fails after a bounded number of attempts rather than hanging", async () => {
    const fetched = stubFetch({
      [`/v2/verify/${VERIFICATION_ID}`]: Array.from({ length: 10 }, () => jsonResponse(200, { isJobCompleted: false })),
    });
    await assert.rejects(() => pollUntilComplete(VERIFICATION_ID, fetched, { attempts: 3, wait: noWait }), (error) => {
      assert.match(error.message, /3 attempt/);
      return true;
    });
    assert.equal(fetched.calls.length, 3, "polled more than the bounded number of attempts");
  });
});

describe("LLR-DP-006 match evaluation", () => {
  it("accepts a job whose match, creationMatch and runtimeMatch are all exact_match", () => {
    const job = { isJobCompleted: true, contract: perfectContract() };
    assert.deepEqual(assertPerfectMatch(job, "test"), perfectContract());
  });

  it("refuses a partial match and names the value that came back", () => {
    const job = { isJobCompleted: true, contract: { ...perfectContract(), match: "match" } };
    assert.throws(() => assertPerfectMatch(job, "test"), (error) => {
      assert.match(error.message, /"match"/);
      assert.match(error.message, /exact_match/);
      return true;
    });
  });

  it("refuses when the summary is exact_match but creationMatch is not", () => {
    const job = { isJobCompleted: true, contract: { ...perfectContract(), creationMatch: "match" } };
    assert.throws(() => assertPerfectMatch(job, "test"), (error) => {
      assert.match(error.message, /creationMatch/);
      assert.match(error.message, /"match"/);
      return true;
    });
  });

  it("refuses when the summary is exact_match but runtimeMatch is not", () => {
    const job = { isJobCompleted: true, contract: { ...perfectContract(), runtimeMatch: "match" } };
    assert.throws(() => assertPerfectMatch(job, "test"), (error) => {
      assert.match(error.message, /runtimeMatch/);
      assert.match(error.message, /"match"/);
      return true;
    });
  });

  it("refuses a job that reports an error, naming it", () => {
    const job = { isJobCompleted: true, error: "compilation failed: stack too deep" };
    assert.throws(() => assertPerfectMatch(job, "test"), /compilation failed: stack too deep/);
  });

  it("does not fail an otherwise perfect verification for a failure inside externalVerifications", () => {
    const job = {
      isJobCompleted: true,
      contract: perfectContract(),
      externalVerifications: { blockscout: { status: "failed", error: "blockscout is down" } },
    };
    assert.doesNotThrow(() => assertPerfectMatch(job, "test"));
  });
});

describe("LLR-DP-006 existing match check", () => {
  it("returns null when Sourcify holds no record of the address", async () => {
    const fetched = stubFetch({ "/v2/contract/": jsonResponse(404, { match: null }) });
    assert.equal(await existingMatchFor(CHAIN_ID, ADDRESS, fetched), null);
  });

  it("returns the contract Sourcify holds for the address", async () => {
    const fetched = stubFetch({ "/v2/contract/": jsonResponse(200, perfectContract()) });
    assert.deepEqual(await existingMatchFor(CHAIN_ID, ADDRESS, fetched), perfectContract());
  });
});

describe("LLR-DP-006 read-back agreement", () => {
  it("reads the contract back from the v2 contract endpoint", async () => {
    const fetched = stubFetch({ "/v2/contract/": jsonResponse(200, perfectContract()) });
    const contract = await readBack(CHAIN_ID, ADDRESS, fetched);
    assert.deepEqual(contract, perfectContract());
    assert.match(fetched.calls[0].url, new RegExp(`/v2/contract/${CHAIN_ID}/${ADDRESS}$`));
  });

  it("passes when the job's answer and the read-back agree", () => {
    assert.doesNotThrow(() => assertAgreement(perfectContract(), perfectContract()));
  });

  it("fails when the job's answer and the read-back disagree", () => {
    const readBackContract = { ...perfectContract(), match: "match" };
    assert.throws(() => assertAgreement(perfectContract(), readBackContract), (error) => {
      assert.match(error.message, /match/);
      assert.match(error.message, /"exact_match"/);
      return true;
    });
  });
});

describe("LLR-DP-006 end to end orchestration", () => {
  const supportedChains = jsonResponse(200, [{ chainId: CHAIN_ID, supported: true }]);
  const alreadyVerified409 = jsonResponse(409, { customCode: "already_verified", message: "Contract is already verified." });
  const run = (fetched, options = { attempts: 3, wait: noWait }) =>
    verifyOnSourcify(
      { chainId: CHAIN_ID, address: ADDRESS, creationTransactionHash: CREATION_TX, stdJsonInput: {}, compilerVersion: "0.8.28" },
      fetched,
      options,
    );
  const postedTo = (fetched, path) => fetched.calls.some((c) => c.init?.method === "POST" && c.url.includes(path));

  it("succeeds and reports the perfect match when nothing is verified yet", async () => {
    // Read before write: the first read-back finds nothing (404), so this exercises the full
    // submit, poll and confirming read-back path.
    const fetched = stubFetch({
      "/chains": supportedChains,
      "/v2/contract/": [jsonResponse(404, { match: null }), jsonResponse(200, perfectContract())],
      "/v2/verify/": [jsonResponse(202, { verificationId: VERIFICATION_ID })],
      [`/v2/verify/${VERIFICATION_ID}`]: jsonResponse(200, { isJobCompleted: true, contract: perfectContract() }),
    });
    const result = await run(fetched);
    assert.equal(result.match, "exact_match");
    assert.equal(result.address, ADDRESS);
    assert.equal(result.chainId, CHAIN_ID);
    assert.ok(postedTo(fetched, "/v2/verify/"), "did not submit when nothing was verified yet");
  });

  it("reports the existing perfect match without submitting anything, run against an already-verified contract", async () => {
    // This is the case that fooled the mocked suite before: Sourcify answers 409 to a submission
    // against an already-verified contract, not the 202 a fresh one gets, so the tool must never
    // reach the submit step at all when the read-back already shows a perfect match.
    const fetched = stubFetch({
      "/chains": supportedChains,
      "/v2/contract/": jsonResponse(200, perfectContract()),
      "/v2/verify/": () => {
        throw new Error("must not be called");
      },
    });
    const result = await run(fetched);
    assert.equal(result.match, "exact_match");
    assert.ok(!postedTo(fetched, "/v2/verify/"), "submitted despite an already-perfect read-back");
  });

  it("submits again when the existing match is only partial", async () => {
    // A partial match is not what LLR-DP-006 asks for, so re-verification is the right move, not
    // a short circuit.
    const fetched = stubFetch({
      "/chains": supportedChains,
      "/v2/contract/": [jsonResponse(200, { ...perfectContract(), match: "match" }), jsonResponse(200, perfectContract())],
      "/v2/verify/": [jsonResponse(202, { verificationId: VERIFICATION_ID })],
      [`/v2/verify/${VERIFICATION_ID}`]: jsonResponse(200, { isJobCompleted: true, contract: perfectContract() }),
    });
    const result = await run(fetched);
    assert.equal(result.match, "exact_match");
    assert.ok(postedTo(fetched, "/v2/verify/"), "did not resubmit despite only a partial existing match");
  });

  it("recovers from a 409 already_verified reported mid-run, followed by a perfect read-back", async () => {
    // The read-before-write check found nothing, but Sourcify says it is already verified by the
    // time the submission lands, a race the read-back alone cannot rule out.
    const fetched = stubFetch({
      "/chains": supportedChains,
      "/v2/contract/": [jsonResponse(404, { match: null }), jsonResponse(200, perfectContract())],
      "/v2/verify/": alreadyVerified409,
    });
    const result = await run(fetched);
    assert.equal(result.match, "exact_match");
  });

  it("fails on a 409 whose customCode is not already_verified, naming it", async () => {
    const fetched = stubFetch({
      "/chains": supportedChains,
      "/v2/contract/": jsonResponse(404, { match: null }),
      "/v2/verify/": jsonResponse(409, { customCode: "unsupported_language", message: "unrelated prose" }),
    });
    await assert.rejects(() => run(fetched), (error) => {
      assert.match(error.message, /unsupported_language/);
      return true;
    });
  });

  it("fails when the read-back disagrees with the job that just completed", async () => {
    const fetched = stubFetch({
      "/chains": supportedChains,
      "/v2/contract/": [jsonResponse(404, { match: null }), jsonResponse(200, { ...perfectContract(), match: "match" })],
      "/v2/verify/": [jsonResponse(202, { verificationId: VERIFICATION_ID })],
      [`/v2/verify/${VERIFICATION_ID}`]: jsonResponse(200, { isJobCompleted: true, contract: perfectContract() }),
    });
    await assert.rejects(() => run(fetched));
  });
});
