#!/usr/bin/env node
/**
 * Live end-to-end run on Arc testnet against the deployed SatStake (LLR-VV-005). Executes UJ-10,
 * UJ-11, UJ-30, UJ-31, UJ-32 and UJ-40 to UJ-45 with real testnet USDC and cirBTC, asserts the
 * state and the exact balance movement after every step, and records each transaction hash in
 * docs/evidence/e2e-testnet.md and .json. Refusals are mined transactions with status 0, not
 * simulations, and the throwaway accounts return what they hold to the operator at the end.
 *
 * Usage: node e2e/run.mjs [--dry-run]
 *
 * The staker is the testnet operator, whose key is read from the gitignored .env and never
 * printed. Referee, beneficiary, and a third-party settler are throwaway accounts generated in
 * memory for this run; only their addresses are recorded. The sequence, including the chain id
 * check that precedes every signature, lives in lib.mjs.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, defineChain, getAddress, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN_ID, Evidence, parseArgs, parseEnvKey, recordFailure, renderEvidence, runE2E } from "./lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = "https://rpc.testnet.arc.io";
const readJson = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

async function main(holder) {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const deployment = readJson(`deployments/${CHAIN_ID}.json`);
  const config = readJson(`deployments/config/${CHAIN_ID}.json`);
  const abi = readJson("out/SatStake.sol/SatStake.json").abi;
  const token = (symbol) => getAddress(config.tokens.find((t) => t.symbol === symbol).address);

  const chain = defineChain({
    id: CHAIN_ID,
    name: "Arc testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  });
  const accounts = {
    staker: privateKeyToAccount(parseEnvKey(readFileSync(join(root, ".env"), "utf8"))),
    referee: privateKeyToAccount(generatePrivateKey()),
    beneficiary: privateKeyToAccount(generatePrivateKey()),
    settler: privateKeyToAccount(generatePrivateKey()),
  };
  const contract = getAddress(deployment.address);
  const evidence = new Evidence({ chainId: CHAIN_ID, contract });
  holder.evidence = evidence;

  await runE2E({
    pub: createPublicClient({ chain, transport: http(RPC) }),
    wallet: (account) => createWalletClient({ account, chain, transport: http(RPC) }),
    accounts,
    abi,
    contract,
    usdc: token("USDC"),
    cirbtc: token("cirBTC"),
    evidence,
    dryRun,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => console.log(m),
  });
  if (dryRun) holder.evidence = undefined;
}

// A failed run leaves its partial record under cache/ (gitignored), so the hashes already sent
// survive the terminal; it is not evidence and is never written to docs/evidence/.
const holder = {};
let finished = false;
try {
  await main(holder);
  finished = true;
} catch (err) {
  console.error(`FAILED: ${err.shortMessage ?? err.message}`);
  if (holder.evidence) {
    mkdirSync(join(root, "cache"), { recursive: true });
    const file = join(root, "cache/e2e-failed.json");
    recordFailure(holder.evidence, err, (text) => writeFileSync(file, text));
    console.error("partial record written to cache/e2e-failed.json");
  }
  process.exitCode = 1;
}
if (finished && holder.evidence) {
  const data = holder.evidence.toJSON();
  writeFileSync(join(root, "docs/evidence/e2e-testnet.json"), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(join(root, "docs/evidence/e2e-testnet.md"), renderEvidence(data));
  console.log(`result ${data.result}; ${data.steps.length} steps recorded in docs/evidence/e2e-testnet.md`);
}
