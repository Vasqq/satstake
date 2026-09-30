#!/usr/bin/env node
/**
 * Verifies a deployed SatStake on Sourcify and confirms the match is perfect (LLR-DP-006).
 *
 * `forge verify-contract --verifier sourcify` does not work against the current Sourcify server:
 * it posts to the legacy `POST /verify` endpoint, which now answers 404 with an HTML body, so
 * Foundry fails after five retries with "error decoding response body; expected value at line 1
 * column 1". Confirmed against the live server. This tool instead drives Sourcify's v2 API, which
 * works: `GET /chains` to check the network is supported, `GET /v2/contract/{chainId}/{address}` to
 * read whether the contract is already verified, `POST /v2/verify/{chainId}/{address}` to submit
 * when it is not, `GET /v2/verify/{verificationId}` to poll the job, then the same read-back to
 * confirm the job's answer independently.
 *
 * Read before write: submitting against a contract Sourcify already holds a perfect match for
 * answers 409 with `{"customCode":"already_verified", ...}`, not the 202 a fresh submission gets.
 * Confirmed live against the already-verified testnet deployment. So this tool checks the read-back
 * first and only submits when it shows no match or a partial one; a re-run is then a single GET
 * that never re-uploads source. A 409 can still arrive between that check and the submit, on a
 * race or a contract verified in between, so it is handled too: `already_verified` falls through to
 * the same read-back rule, and any other `customCode` stays an error. The human-readable `message`
 * Sourcify sends on a 409 is never parsed for the match result, since it is prose, not a contract,
 * and can change; the match always comes from the structured `v2/contract` response.
 *
 * Usage: node tools/verify-sourcify.mjs <chainId>
 *
 * This tool only verifies. `tools/record-deployment.mjs` is what writes `deployments/<chainId>.json`,
 * including the Sourcify status; this tool never touches that file.
 *
 * @trace LLR-DP-006
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT = "SatStake";
const CONTRACT_IDENTIFIER = `src/${CONTRACT}.sol:${CONTRACT}`;
const SOURCIFY = "https://sourcify.dev/server";
// Sourcify's v2 API answers this for a perfect match on a field and "match" for a partial one.
const EXACT = "exact_match";
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3000;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Waits between polls on a real run; tests supply their own to poll instantly. */
const defaultWait = () => new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

/**
 * The address and creation transaction hash a deployment record carries, or a throw naming what
 * is missing. `readJson` stands in for reading and parsing `deployments/<chainId>.json`, so a
 * missing file, invalid JSON, or an absent field each get their own message without a real file.
 */
export function deploymentFor(chainId, readJson) {
  let record;
  try {
    record = readJson();
  } catch (error) {
    throw new Error(`deployments/${chainId}.json could not be read: ${error.message}`);
  }
  if (!record?.address) {
    throw new Error(`deployments/${chainId}.json carries no address`);
  }
  if (!record.deployTransaction) {
    throw new Error(`deployments/${chainId}.json carries no deployTransaction`);
  }
  return { address: record.address, creationTransactionHash: record.deployTransaction };
}

/** Throws unless Sourcify lists `chainId` as a network it supports. */
export async function assertChainSupported(chainId, fetched = fetch) {
  const response = await fetched(`${SOURCIFY}/chains`);
  if (!response.ok) {
    throw new Error(`Sourcify answered ${response.status} for the list of supported chains`);
  }
  const chains = await response.json();
  const entry = Array.isArray(chains) ? chains.find((c) => c.chainId === chainId) : undefined;
  if (!entry?.supported) {
    throw new Error(`chain ${chainId} is not listed as supported by Sourcify`); // LLR-DP-006
  }
}

/**
 * Submits a verification and returns the verificationId Sourcify assigns to the job. A 409 whose
 * body names `customCode` is Sourcify refusing the submission, most often because the contract is
 * already verified; the error carries that code as `.customCode` so a caller can tell that case
 * apart from every other way a submission can fail.
 */
export async function submitVerification({ chainId, address, stdJsonInput, compilerVersion, creationTransactionHash }, fetched = fetch) {
  const response = await fetched(`${SOURCIFY}/v2/verify/${chainId}/${address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stdJsonInput,
      compilerVersion,
      contractIdentifier: CONTRACT_IDENTIFIER,
      creationTransactionHash,
    }),
  });
  if (response.status === 409) {
    const body = await response.json();
    const error = new Error(
      `Sourcify answered 409 submitting the verification for ${address} on chain ${chainId}: ${body.customCode}`, // LLR-DP-006
    );
    error.customCode = body.customCode;
    throw error;
  }
  if (!response.ok) {
    throw new Error(`Sourcify answered ${response.status} submitting the verification for ${address} on chain ${chainId}`);
  }
  const body = await response.json();
  if (!body.verificationId) {
    throw new Error(`Sourcify accepted the submission for ${address} but returned no verificationId`);
  }
  return body.verificationId;
}

/** Polls a verification job until it reports completion, or throws once the attempts run out. */
export async function pollUntilComplete(verificationId, fetched = fetch, { attempts = MAX_POLL_ATTEMPTS, wait = defaultWait } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetched(`${SOURCIFY}/v2/verify/${verificationId}`);
    if (!response.ok) {
      throw new Error(`Sourcify answered ${response.status} polling verification ${verificationId}`);
    }
    const job = await response.json();
    if (job.isJobCompleted) return job;
    await wait(attempt);
  }
  throw new Error(`gave up after ${attempts} attempts waiting for verification ${verificationId} to complete`); // LLR-DP-006
}

/**
 * The contract's match fields when a completed job reports a perfect match on all three, or a
 * throw naming what fell short. `externalVerifications` (a push to a block explorer alongside
 * Sourcify's own record) is not read here: a failure in there is not a failure of this
 * verification, so it must never fail an otherwise perfect one.
 */
export function assertPerfectMatch(job, context) {
  if (job.error) {
    throw new Error(`Sourcify reported an error for ${context}: ${job.error}`); // LLR-DP-006
  }
  const contract = job.contract ?? {};
  const { match, creationMatch, runtimeMatch } = contract;
  if (match !== EXACT) {
    throw new Error(`Sourcify reported match "${match}" for ${context}, not a perfect match (${EXACT})`); // LLR-DP-006
  }
  if (creationMatch !== EXACT) {
    throw new Error(`Sourcify reported creationMatch "${creationMatch}" for ${context}, not a perfect match (${EXACT})`); // LLR-DP-006
  }
  if (runtimeMatch !== EXACT) {
    throw new Error(`Sourcify reported runtimeMatch "${runtimeMatch}" for ${context}, not a perfect match (${EXACT})`); // LLR-DP-006
  }
  return contract;
}

/** True only when a contract object carries `exact_match` on all three fields. */
function isPerfectMatch(contract) {
  return contract?.match === EXACT && contract?.creationMatch === EXACT && contract?.runtimeMatch === EXACT;
}

/**
 * What Sourcify's v2 contract endpoint reports for an address, or `null` when it holds no record
 * of it at all. A 404 here is not yet an error: it is what an unverified contract answers, and the
 * read-before-write check needs to tell that apart from a real failure to reach Sourcify.
 */
export async function existingMatchFor(chainId, address, fetched = fetch) {
  const response = await fetched(`${SOURCIFY}/v2/contract/${chainId}/${address}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Sourcify answered ${response.status} reading back ${address} on chain ${chainId}`);
  }
  return await response.json();
}

/** The match Sourcify's v2 contract endpoint reports for an address, read independently of the job. */
export async function readBack(chainId, address, fetched = fetch) {
  const contract = await existingMatchFor(chainId, address, fetched);
  if (!contract) {
    throw new Error(`Sourcify holds no verified contract at ${address} on chain ${chainId}`);
  }
  return contract;
}

/** Throws unless the job's match fields and the independent read-back agree on all three. */
export function assertAgreement(jobContract, readBackContract) {
  for (const field of ["match", "creationMatch", "runtimeMatch"]) {
    if (jobContract[field] !== readBackContract[field]) {
      throw new Error(
        `the verification job answered ${field} "${jobContract[field]}" but reading the contract back answered ` +
          `"${readBackContract[field]}"`, // LLR-DP-006
      );
    }
  }
}

/**
 * Verifies `address` on `chainId` and confirms the match is perfect, end to end: chain support,
 * a read-before-write check that makes a re-run against an already-verified contract a single GET,
 * submission and polling when one is needed, `already_verified` handled as a second line of
 * defence for a race between the check and the submit, and an independent read-back that must
 * agree with the job.
 */
export async function verifyOnSourcify({ chainId, address, creationTransactionHash, stdJsonInput, compilerVersion }, fetched = fetch, options = {}) {
  await assertChainSupported(chainId, fetched);

  const existing = await existingMatchFor(chainId, address, fetched);
  if (isPerfectMatch(existing)) {
    return { chainId, address, match: existing.match }; // LLR-DP-006
  }

  let verificationId;
  try {
    verificationId = await submitVerification(
      { chainId, address, stdJsonInput, compilerVersion, creationTransactionHash },
      fetched,
    );
  } catch (error) {
    if (error.customCode !== "already_verified") throw error;
    // Sourcify says the contract was verified after the read-before-write check above ran, so the
    // same rule applies: only a perfect match on all three fields counts as success.
    const contract = await readBack(chainId, address, fetched);
    assertPerfectMatch({ contract }, `reading ${address} back on chain ${chainId} after Sourcify reported it already verified`);
    return { chainId, address, match: contract.match }; // LLR-DP-006
  }

  const job = await pollUntilComplete(verificationId, fetched, options);
  const jobContract = assertPerfectMatch(job, `the verification job for ${address} on chain ${chainId}`);
  const readBackContract = await readBack(chainId, address, fetched);
  assertAgreement(jobContract, readBackContract);
  return { chainId, address, match: jobContract.match };
}

async function main(chainIdArg) {
  const chainId = Number(chainIdArg);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    console.error("usage: node tools/verify-sourcify.mjs <chainId>");
    process.exit(1);
  }

  const record = deploymentFor(chainId, () => JSON.parse(readFileSync(join(root, `deployments/${chainId}.json`), "utf8")));

  // Both come from the compiled and pre-verified artifacts, so neither is typed by hand and both
  // stay exactly what was deployed.
  const stdJsonInput = JSON.parse(
    execFileSync(
      "forge",
      ["verify-contract", record.address, CONTRACT_IDENTIFIER, "--chain-id", String(chainId), "--show-standard-json-input"],
      { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    ),
  );
  const artifact = JSON.parse(readFileSync(join(root, `out/${CONTRACT}.sol/${CONTRACT}.json`), "utf8"));
  const compilerVersion = artifact.metadata?.compiler?.version;
  if (!compilerVersion) {
    throw new Error(`out/${CONTRACT}.sol/${CONTRACT}.json carries no compiler version`);
  }

  const result = await verifyOnSourcify({
    chainId,
    address: record.address,
    creationTransactionHash: record.creationTransactionHash,
    stdJsonInput,
    compilerVersion,
  });

  console.log(
    `verify-sourcify: chain ${result.chainId}, ${result.address}, match ${result.match}. ` +
      `deployments/${chainId}.json is written by tools/record-deployment.mjs, which this tool does not touch.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv[2]);
}
