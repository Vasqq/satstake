import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { type NetworkConfig, networks, selectNetwork } from "./networks";

const repo = resolve(import.meta.dirname, "../../..");
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(repo, path), "utf8")) as Record<string, unknown>;

const FIELDS = [
  "chainId",
  "name",
  "rpcUrls",
  "explorerUrl",
  "contract",
  "examplePledgeId",
  "tokens",
] as const;

describe("LLR-FE-001 network configuration", () => {
  it("holds every field the requirement lists for both build targets", () => {
    for (const target of [networks.testnet, networks.mainnet]) {
      for (const field of FIELDS) expect(target, field).toHaveProperty(field);
      expect(target.rpcUrls.length).toBeGreaterThan(0);
      expect(target.name.length).toBeGreaterThan(0);
      expect(target.explorerUrl.startsWith("https://")).toBe(true);
      expect(target.tokens).toHaveLength(2);
      for (const token of target.tokens) {
        expect(Object.keys(token).sort()).toEqual(["address", "decimals", "symbol"]);
      }
    }
  });

  it("takes the testnet chain, contract, and tokens from the committed deployment files", () => {
    const deployment = readJson("deployments/5042002.json");
    const config = readJson("deployments/config/5042002.json") as {
      tokens: { symbol: string; address: string; decimals: number }[];
    };
    const t = networks.testnet;
    expect(t.chainId).toBe(5042002);
    expect(t.chainId).toBe(deployment.chainId);
    expect(t.contract).toBe(getAddress(deployment.address as string));
    expect(t.tokens).toEqual(
      config.tokens.map((x) => ({ symbol: x.symbol, address: getAddress(x.address), decimals: x.decimals })),
    );
  });

  it("uses the mainnet chain id and the token addresses recorded in deployments/accounts.md", () => {
    const m = networks.mainnet;
    expect(m.chainId).toBe(5042);
    expect(m.tokens).toEqual([
      { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 },
      { symbol: "cirBTC", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8 },
    ]);
  });

  it("reads the mainnet tokens from deployments/config/5042.json, with no address typed into the source", () => {
    const config = readJson("deployments/config/5042.json") as {
      tokens: { symbol: string; address: string; decimals: number }[];
    };
    expect(networks.mainnet.tokens).toEqual(
      config.tokens.map((x) => ({ symbol: x.symbol, address: getAddress(x.address), decimals: x.decimals })),
    );
    const source = readFileSync(resolve(import.meta.dirname, "networks.ts"), "utf8");
    expect(source).not.toMatch(/0x[0-9a-fA-F]{40}/);
  });

  it("refuses to load when the mainnet token config names another chain", async () => {
    vi.resetModules();
    vi.doMock("../../../deployments/config/5042.json", () => ({ default: { chainId: 5042002, tokens: [] } }));
    try {
      await expect(import("./networks")).rejects.toThrow(/config\/5042\.json/);
    } finally {
      vi.doUnmock("../../../deployments/config/5042.json");
      vi.resetModules();
    }
  });

  it("carries the SatStake address of the mainnet deployment record and the seeded cirBTC pledge as the example", () => {
    const record = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../deployments/5042.json"), "utf8")) as {
      chainId: number;
      address: string;
    };
    expect(record.chainId).toBe(5042);
    expect(networks.mainnet.contract).toBe(getAddress(record.address));
    expect(networks.mainnet.contract).toBe("0xEbcda489EB528c573E9a190eB8EfE63b44d9204e");
    expect(networks.mainnet.examplePledgeId).toBe(4n);
  });

  it("lists the primary RPC first and gives each network an explorer", () => {
    expect(networks.testnet.rpcUrls[0]).toBe("https://rpc.testnet.arc.io");
    expect(networks.mainnet.rpcUrls[0]).toBe("https://rpc.mainnet.arc.io");
    expect(networks.testnet.explorerUrl).toBe("https://explorer.testnet.arc.io");
    expect(networks.mainnet.explorerUrl).toBe("https://explorer.arc.io");
  });

  it("lists only endpoints that docs.arc.io/arc/references/rpc-endpoints names (01 V-02)", () => {
    expect(networks.testnet.rpcUrls).toEqual(["https://rpc.testnet.arc.io", "https://rpc.blockdaemon.testnet.arc.io"]);
    expect(networks.mainnet.rpcUrls).toEqual(["https://rpc.mainnet.arc.io"]);
  });

  it("never configures USDC with the 18 decimals of the native balance", () => {
    for (const target of [networks.testnet, networks.mainnet]) {
      expect(target.tokens.find((x) => x.symbol === "USDC")?.decimals).toBe(6);
    }
  });

  it("keeps every address in checksum form and the example pledge a non-negative integer", () => {
    for (const target of [networks.testnet, networks.mainnet]) {
      for (const token of target.tokens) expect(getAddress(token.address)).toBe(token.address);
      expect(target.examplePledgeId >= 0n).toBe(true);
    }
    expect(networks.testnet.contract).not.toBeNull();
    expect(getAddress(networks.testnet.contract as string)).toBe(networks.testnet.contract);
  });
});

describe("LLR-FE-002 build target selection", () => {
  const withContract: NetworkConfig = networks.mainnet;

  it("selects the testnet or mainnet configuration by name", () => {
    expect(selectNetwork("testnet").chainId).toBe(5042002);
    expect(selectNetwork("mainnet", { testnet: networks.testnet, mainnet: withContract }).chainId).toBe(5042);
  });

  it("fails when the selected configuration has no contract address", () => {
    const none = { testnet: networks.testnet, mainnet: { ...networks.mainnet, contract: null } };
    expect(() => selectNetwork("mainnet", none)).toThrow(/mainnet has no SatStake contract address/);
    expect(() => selectNetwork("testnet", { testnet: { ...networks.testnet, contract: null }, mainnet: withContract })).toThrow(
      /testnet has no SatStake contract address/,
    );
  });

  it("ignores a missing address in the target that was not selected", () => {
    expect(selectNetwork("testnet", { testnet: networks.testnet, mainnet: { ...networks.mainnet, contract: null } }).contract).toBe(
      networks.testnet.contract,
    );
  });

  it("fails on an unset or unknown target instead of choosing one", () => {
    expect(() => selectNetwork(undefined)).toThrow(/VITE_NETWORK/);
    expect(() => selectNetwork("")).toThrow(/VITE_NETWORK/);
    expect(() => selectNetwork("Testnet")).toThrow(/VITE_NETWORK/);
    expect(() => selectNetwork("local")).toThrow(/VITE_NETWORK/);
  });

  it("returns a configuration whose contract address is typed as present", () => {
    const selected = selectNetwork("testnet");
    const address: string = selected.contract;
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
