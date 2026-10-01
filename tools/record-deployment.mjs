#!/usr/bin/env node
/**
 * Writes `deployments/<chainId>.json` for a deployment that has already been broadcast: contract
 * address, deploy transaction hash, block number, git commit, compiler version and settings, and
 * verification status (LLR-DP-005).
 *
 * Every field comes from the broadcast artifact, the compiled artifact, git, or Sourcify, so no
 * part of the record is typed by hand. Four guards keep the record true of the deployment it
 * describes:
 *
 * - The sources that produce the bytecode must be committed, and the broadcast must name the same
 *   commit, since otherwise the recorded commit names source that was never deployed.
 * - The broadcast must be of a deployment to the chain the record is for.
 * - The creation data the broadcast recorded must begin with the bytecode of the compiled artifact,
 *   so the recorded compiler settings belong to the code that was sent. Nothing here reads the
 *   chain; the post-deploy check is what confirms the deployment itself.
 * - The creation must have succeeded, since a failed one still leaves a receipt with a block number.
 *
 * Usage: node tools/record-deployment.mjs <chainId>
 *
 * @trace LLR-DP-005
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT = "SatStake";
const SOURCIFY = "https://sourcify.dev/server";
// Paths whose content decides the deployed bytecode. Everything else may move without making the
// recorded commit a wrong answer to "which source is deployed".
const BYTECODE_PATHS = ["src", "lib", "foundry.toml"];
// Sourcify's v2 API answers this for a perfect match on a field and "match" for a partial one.
const PERFECT_MATCH = "exact_match";
const MATCH_FIELDS = ["match", "creationMatch", "runtimeMatch"];
const SUCCESS = 1;
const HEX = /^0x[0-9a-fA-F]+$/;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A number a broadcast artifact carries: a JSON number, or a hexadecimal string with its prefix.
 * Anything else throws rather than being guessed at, since a decimal string read as hexadecimal
 * gives a wrong block number that still looks like one.
 */
export function asNumber(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && HEX.test(value)) return Number.parseInt(value, 16);
  throw new Error(`${JSON.stringify(value)} is neither a whole number nor a 0x-prefixed hexadecimal string`);
}

/** The paths in `git status --porcelain` output, with a rename reported as its destination. */
export function dirtyPathsFrom(porcelain) {
  return porcelain
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3);
      const renamedTo = path.split(" -> ");
      return renamedTo[renamedTo.length - 1];
    });
}

/** The creation of `contractName` in a `forge script` broadcast, with its receipt. */
export function deploymentOf(broadcast, contractName) {
  const created = (broadcast.transactions ?? []).find(
    (tx) => tx.transactionType === "CREATE" && tx.contractName === contractName,
  );
  if (!created) throw new Error(`the broadcast holds no CREATE transaction for ${contractName}`);
  const receipt = (broadcast.receipts ?? []).find((r) => r.transactionHash === created.hash);
  if (!receipt) throw new Error(`the broadcast holds no receipt for transaction ${created.hash}`);
  if (receipt.status === undefined) {
    throw new Error(`the receipt for transaction ${created.hash} carries no status, so it shows no success`);
  }
  if (asNumber(receipt.status) !== SUCCESS) {
    throw new Error(`the creation of ${contractName} has receipt status ${receipt.status}, so it did not succeed`);
  }
  return {
    address: created.contractAddress,
    transactionHash: created.hash,
    blockNumber: asNumber(receipt.blockNumber),
    // Creation code followed by the constructor arguments.
    creationData: created.transaction?.input ?? created.transaction?.data ?? "",
  };
}

/** The compiler version and the settings the artifact records for itself. */
export function compilerOf(artifact) {
  const metadata = artifact.metadata;
  if (!metadata?.compiler?.version || !metadata.settings) {
    throw new Error("the compiled artifact carries no compiler metadata");
  }
  return { version: metadata.compiler.version, settings: metadata.settings };
}

/** The record of one deployment, or a throw naming what does not add up. */
export function buildRecord({ chainId, contractName, broadcast, artifact, gitCommit, dirtyPaths, sourcify }) {
  if (dirtyPaths.length > 0) {
    // Which hunk of a dirty path reaches the bytecode is not something this tool can tell, so any
    // change in them blocks a record rather than being judged.
    throw new Error(
      `uncommitted changes in ${dirtyPaths.join(", ")}: these paths decide the deployed bytecode, so while any of ` +
        `them differs from commit ${gitCommit} the record cannot show which source is deployed`,
    );
  }
  if (typeof broadcast.commit !== "string" || broadcast.commit.length === 0) {
    throw new Error(`the broadcast names no commit, so it cannot be tied to ${gitCommit}`);
  }
  if (!gitCommit.startsWith(broadcast.commit)) {
    throw new Error(`the deployment was broadcast at commit ${broadcast.commit}, which is not ${gitCommit}`);
  }
  if (asNumber(broadcast.chain) !== chainId) {
    throw new Error(`the broadcast is of a deployment to chain ${broadcast.chain}, not to chain ${chainId}`);
  }

  const deployment = deploymentOf(broadcast, contractName);
  const creationCode = artifact.bytecode?.object ?? "";
  if (!HEX.test(creationCode)) {
    throw new Error(`the compiled ${contractName} artifact carries no creation bytecode`);
  }
  if (!HEX.test(deployment.creationData)) {
    throw new Error(`the broadcast carries no creation data for ${contractName}`);
  }
  if (!deployment.creationData.toLowerCase().startsWith(creationCode.toLowerCase())) {
    throw new Error(`the broadcast creation data does not begin with the bytecode of the compiled ${contractName}`);
  }

  return {
    chainId,
    contract: contractName,
    address: deployment.address,
    deployTransaction: deployment.transactionHash,
    blockNumber: deployment.blockNumber,
    gitCommit,
    compiler: compilerOf(artifact),
    verification: {
      // The fields are whatever Sourcify answered, and "pending" while it has no match at all, so
      // the record can never claim a verification that did not happen. The summary `match` alone is
      // not enough: Sourcify's own specification shows it reading exact_match while one side
      // matches only partially, so a perfect match needs all three.
      sourcify: {
        match: sourcify?.match ?? "pending",
        creationMatch: sourcify?.creationMatch ?? null,
        runtimeMatch: sourcify?.runtimeMatch ?? null,
        perfectMatch: MATCH_FIELDS.every((field) => sourcify?.[field] === PERFECT_MATCH), // @trace LLR-DP-006
      },
    },
  };
}

/** The three match fields Sourcify reports for an address, or null when it holds none. */
export async function sourcifyStatus(chainId, address, fetched = fetch) {
  const response = await fetched(`${SOURCIFY}/v2/contract/${chainId}/${address}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Sourcify answered ${response.status} for ${address} on chain ${chainId}`);
  const { match, creationMatch, runtimeMatch } = await response.json();
  return match ? { match, creationMatch, runtimeMatch } : null;
}

async function main(chainIdArg) {
  const chainId = Number(chainIdArg);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    console.error("usage: node tools/record-deployment.mjs <chainId>");
    process.exit(1);
  }
  const json = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  const broadcast = json(`broadcast/Deploy.s.sol/${chainId}/run-latest.json`);
  const artifact = json(`out/${CONTRACT}.sol/${CONTRACT}.json`);
  const gitCommit = git("rev-parse", "HEAD");
  const dirtyPaths = dirtyPathsFrom(git("status", "--porcelain", "--", ...BYTECODE_PATHS));
  const sourcify = await sourcifyStatus(chainId, deploymentOf(broadcast, CONTRACT).address);

  const record = buildRecord({
    chainId,
    contractName: CONTRACT,
    broadcast,
    artifact,
    gitCommit,
    dirtyPaths,
    sourcify,
  });
  writeFileSync(join(root, `deployments/${chainId}.json`), `${JSON.stringify(record, null, 2)}\n`);
  const { match, perfectMatch } = record.verification.sourcify;
  console.log(
    `record-deployment: deployments/${chainId}.json written. ${record.contract} at ${record.address}, ` +
      `block ${record.blockNumber}, Sourcify: ${match}${perfectMatch ? "" : ", not a perfect match"}.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv[2]);
}
