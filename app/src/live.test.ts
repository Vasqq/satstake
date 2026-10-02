import { getPublicClient } from "wagmi/actions";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicClient, http } from "viem";
import { checkNetwork, checkTokens } from "./chain/health";
import { ChainClock } from "./chain/clock";
import { createReads, isPledgeNotFound } from "./chain/reads";
import { createAppConfig } from "./chain/wagmi";
import { selectNetwork } from "./config/networks";

// These tests read the deployed testnet contract. They are skipped unless SATSTAKE_LIVE is set, so the
// unit suite and CI do not depend on a public endpoint being up.
const live = describe.skipIf(!process.env.SATSTAKE_LIVE);

const network = selectNetwork("testnet");

afterEach(() => vi.restoreAllMocks());

live("LLR-FE-003 LLR-FE-005 LLR-FE-006 LLR-FE-010 LLR-FE-012 the application's own reads against Arc testnet", () => {
  const methods: string[] = [];
  const client = () => {
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string } | { method: string }[];
      for (const call of Array.isArray(body) ? body : [body]) methods.push(call.method);
      return real(input, init);
    });
    const published = getPublicClient(createAppConfig(network));
    if (!published) throw new Error("the application's config has no client");
    return published;
  };

  it("passes the chain id check through the configured transport", async () => {
    await expect(checkNetwork(client(), network.chainId)).resolves.toEqual({ status: "ok" });
  });

  it("finds the token decimals and symbols on chain equal to the configuration", async () => {
    const results = await checkTokens(client(), network.tokens);
    for (const r of results) {
      expect(r.status, r.token.symbol).toBe("ok");
      expect(r.actual).toEqual({ decimals: r.token.decimals, symbol: r.token.symbol });
    }
  });

  it("reads the configured example pledge through getPledge and stateOf", async () => {
    const reads = createReads(client(), network.contract);
    expect(await reads.pledgeCount()).toBeGreaterThanOrEqual(network.examplePledgeId);
    const pledge = await reads.pledge(network.examplePledgeId);
    expect(pledge.promiseText.length).toBeGreaterThan(0);
    expect(pledge.amount).toBeGreaterThan(0n);
    expect(network.tokens.map((t) => t.address)).toContain(pledge.token);
    expect(await reads.state(network.examplePledgeId)).toMatch(/^(Active|Expired|Kept|Broken|Settled)/);
    expect(await reads.totalLocked(pledge.token)).toBeGreaterThanOrEqual(0n);
    expect(await reads.pledgeCountOf(pledge.staker)).toBeGreaterThanOrEqual(1n);
    expect((await reads.pledgeIdsOf(pledge.staker, 0n, 20n)).length).toBeGreaterThanOrEqual(1);
  });

  it("recognises a pledge id the contract does not have", async () => {
    const reads = createReads(client(), network.contract);
    const error = await reads.pledge(999_999n).catch((e: unknown) => e);
    expect(isPledgeNotFound(error)).toBe(true);
    const stateError = await reads.state(999_999n).catch((e: unknown) => e);
    expect(isPledgeNotFound(stateError)).toBe(true);
  });

  it("takes chain time from the latest block, within two minutes of this machine's clock", async () => {
    const reads = createReads(client(), network.contract);
    const clock = new ChainClock();
    clock.sync(await reads.latestBlockTimestamp());
    const now = clock.now();
    expect(now).not.toBeNull();
    expect(Math.abs(Number(now) - Date.now() / 1000)).toBeLessThan(120);
  });

  it("asks the node only for chain id, calls, and the latest block", () => {
    expect(new Set(methods)).toEqual(new Set(["eth_chainId", "eth_call", "eth_getBlockByNumber"]));
  });

  it("answers the same chain id and contract count from every configured URL", async () => {
    const counts = new Set<bigint>();
    for (const url of network.rpcUrls) {
      const direct = createPublicClient({ transport: http(url) });
      await expect(checkNetwork(direct, network.chainId), url).resolves.toEqual({ status: "ok" });
      counts.add(await createReads(direct, network.contract).pledgeCount());
    }
    expect(counts.size).toBe(1);
  });
});
