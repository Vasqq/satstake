import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { HttpRequestError, createPublicClient } from "viem";
import { selectNetwork } from "../config/networks";
import { FakeChain, samplePledge } from "../test/fakeChain";
import { PLEDGE_STATES, createReads, isPledgeNotFound, parsePledge } from "./reads";

const network = selectNetwork("testnet");
let chain: FakeChain;
const reads = () => createReads(createPublicClient({ transport: chain.transport }), network.contract);

beforeEach(() => {
  chain = new FakeChain(network.contract);
});

describe("LLR-FE-010 reads go through the six view functions only", () => {
  it("decodes getPledge into the pledge record", async () => {
    chain.addPledge(7n);
    await expect(reads().pledge(7n)).resolves.toEqual({
      staker: samplePledge.staker,
      token: samplePledge.token,
      amount: 2_500_000n,
      referee: samplePledge.referee,
      beneficiary: samplePledge.beneficiary,
      deadline: 1_790_000_000n,
      createdAt: 1_789_000_000n,
      status: 1,
      promiseText: "Run 5 km before Friday",
    });
  });

  it("names the derived state for each value of stateOf", async () => {
    expect([...PLEDGE_STATES]).toEqual(["Active", "Expired", "Kept", "Broken", "SettledToStaker", "SettledToBeneficiary"]);
    for (const [index, name] of PLEDGE_STATES.entries()) {
      chain.addPledge(BigInt(index + 1), samplePledge, index);
      await expect(reads().state(BigInt(index + 1))).resolves.toBe(name);
    }
  });

  it("refuses a state value outside the enum instead of guessing", async () => {
    chain.addPledge(1n, samplePledge, 6);
    await expect(reads().state(1n)).rejects.toThrow(/unknown pledge state/i);
  });

  it("reads the pledge count, the per-account count, a page of ids, and the locked total", async () => {
    chain.addPledge(1n);
    const r = reads();
    await expect(r.pledgeCount()).resolves.toBe(1n);
    await expect(r.pledgeCountOf(samplePledge.staker)).resolves.toBe(0n);
    await expect(r.pledgeIdsOf(samplePledge.staker, 0n, 20n)).resolves.toEqual([]);
    await expect(r.totalLocked(samplePledge.token)).resolves.toBe(0n);
    expect(chain.requests.map((x) => x.functionName)).toEqual([
      "pledgeCount",
      "pledgeCountOf",
      "pledgeIdsOf",
      "totalLocked",
    ]);
  });

  it("addresses every call to the SatStake contract", async () => {
    chain.addPledge(1n);
    await reads().pledge(1n);
    await reads().state(1n);
    expect(new Set(chain.requests.map((x) => x.to))).toEqual(new Set([network.contract.toLowerCase()]));
  });

  it("recognises PledgeNotFound and nothing else as an unknown pledge", async () => {
    const missing = await reads().pledge(99n).catch((e: unknown) => e);
    expect(isPledgeNotFound(missing)).toBe(true);
    chain.failures.push(new HttpRequestError({ url: "https://rpc.example" }));
    const failed = await reads().pledge(99n).catch((e: unknown) => e);
    expect(isPledgeNotFound(failed)).toBe(false);
    expect(isPledgeNotFound(new Error("PledgeNotFound"))).toBe(false);
    expect(isPledgeNotFound(undefined)).toBe(false);
  });

  it("does not take another contract error for a missing pledge", async () => {
    chain.addPledge(1n);
    chain.callRevert = { errorName: "ZeroAmount" };
    const error = await reads().pledge(1n).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(isPledgeNotFound(error)).toBe(false);
  });

  it("refuses a decoded value that does not match the Pledge struct, field by field", () => {
    const good = { ...samplePledge };
    expect(parsePledge(good)).toEqual(good);
    const wrong: Record<string, unknown> = {
      staker: "0x123",
      token: 5,
      amount: 5,
      referee: undefined,
      beneficiary: "0x" + "g".repeat(40),
      deadline: "1",
      createdAt: 1,
      status: "1",
      promiseText: 7,
    };
    for (const [field, value] of Object.entries(wrong)) {
      expect(() => parsePledge({ ...good, [field]: value }), field).toThrow(/does not match the Pledge struct/);
    }
    expect(() => parsePledge(null)).toThrow(/Pledge struct/);
    expect(() => parsePledge("pledge")).toThrow(/Pledge struct/);
  });

  it("never asks the node for logs, filters, or subscriptions", async () => {
    chain.addPledge(1n);
    await reads().pledge(1n);
    await reads().state(1n);
    await reads().pledgeCount();
    const methods = chain.requests.map((x) => x.method);
    expect(methods.filter((m) => /log|filter|subscribe/i.test(m))).toEqual([]);
  });

  describe("in the source", () => {
    const srcDir = resolve(import.meta.dirname, "..");
    const sources: { path: string; text: string }[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = resolve(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "test") walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
          sources.push({ path, text: readFileSync(path, "utf8") });
        }
      }
    };
    walk(srcDir);

    it("finds the application source", () => {
      expect(sources.length).toBeGreaterThan(5);
      expect(sources.some((s) => s.path.endsWith("reads.ts"))).toBe(true);
    });

    // Each check scans the text of every source file, so a call written another way is still seen.
    const comments = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;
    const code = sources.map((s) => ({ path: s.path, text: s.text.replace(comments, "") }));

    it("names no log, filter, or event-subscription API", () => {
      const forbidden =
        /getLogs|getContractEvents|getFilterLogs|getFilterChanges|createEventFilter|createContractEventFilter|createBlockFilter|createPendingTransactionFilter|watchEvent|watchContractEvent|watchBlocks|watchPendingTransactions|eth_getLogs|eth_newFilter|eth_newBlockFilter|eth_getFilter|eth_uninstallFilter|eth_subscribe/;
      for (const s of code) expect(s.text, s.path).not.toMatch(forbidden);
    });

    // LLR-FE-037 decodes PledgeCreated from the receipt of the creation the staker has just sent. That is one
    // receipt the application was handed, not a search of the chain's logs, so only the file that reads it may
    // name these.
    it("names the receipt and event-decoding functions in the file that reads the creation receipt, and nowhere else", () => {
      const receiptApis = /parseEventLogs|decodeEventLog|getTransactionReceipt|waitForTransactionReceipt/;
      const naming = code.filter((s) => receiptApis.test(s.text)).map((s) => s.path.slice(srcDir.length + 1));
      expect(naming).toEqual([join("create", "flow.ts")]);
    });

    it("names the function of every contract call as a literal, and only an allowed one", () => {
      const allowed = new Set([
        "getPledge",
        "stateOf",
        "pledgeCount",
        "pledgeCountOf",
        "pledgeIdsOf",
        "totalLocked",
        "decimals",
        "symbol",
        // The create flow reads the staker's balance and allowance of the stake token and sends two
        // transactions (LLR-FE-030, 033). None of them is pledge data.
        "balanceOf",
        "allowance",
        "approve",
        "createPledge",
      ]);
      const mentions = code.flatMap((s) => [...s.text.matchAll(/\bfunctionName\b/g)].map(() => s.path));
      const literals = code.flatMap((s) => [...s.text.matchAll(/\bfunctionName:\s*"(\w+)"/g)].map((m) => m[1] as string));
      expect(literals.length, "a functionName that is not a string literal").toBe(mentions.length);
      expect(literals.filter((n) => !allowed.has(n))).toEqual([]);
      expect(literals).toContain("getPledge");
      expect(literals).toContain("stateOf");
    });

    it("sends no raw JSON-RPC method other than eth_chainId, and never calls a contract with raw data", () => {
      for (const s of code) {
        const methods = [...s.text.matchAll(/\bmethod:\s*"([^"]+)"/g)].map((m) => m[1]);
        expect(methods.filter((m) => m !== "eth_chainId"), s.path).toEqual([]);
        expect(s.text, s.path).not.toMatch(/\bmethod:\s*[^"\s]/);
        expect(s.text, s.path).not.toMatch(/encodeFunctionData|\.call\(|\bgetStorageAt\b|\bmulticall\b/);
      }
    });
  });
});
