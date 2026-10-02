import { type Address, getAddress } from "viem";
import deployment from "../../../deployments/5042002.json" with { type: "json" };
import tokenConfig from "../../../deployments/config/5042002.json" with { type: "json" };

export interface TokenConfig {
  symbol: string;
  address: Address;
  decimals: number;
}

export interface NetworkConfig {
  chainId: number;
  name: string;
  /** Tried in order; the first is the primary. */
  rpcUrls: readonly string[];
  explorerUrl: string;
  /** Null until the contract is deployed on this network. */
  contract: Address | null;
  examplePledgeId: bigint;
  tokens: readonly TokenConfig[];
}

export type NetworkName = "testnet" | "mainnet";
export type SelectedNetwork = NetworkConfig & { contract: Address };

if (tokenConfig.chainId !== deployment.chainId) {
  throw new Error("deployments/config and the deployment record name different chains");
}

/**
 * Testnet values come from the deployment record and the deploy script's token config, so the app cannot
 * drift from what was deployed. Mainnet values are the addresses in deployments/accounts.md, each checked
 * against Circle's and Arc's published lists on 2026-09-24.
 *
 * @trace LLR-FE-001
 */
export const networks: Record<NetworkName, NetworkConfig> = {
  testnet: {
    chainId: deployment.chainId,
    name: "Arc Testnet",
    // Both are listed on https://docs.arc.io/arc/references/rpc-endpoints (01 V-02) and answered anonymous
    // requests with CORS on 2026-10-01. The second is the fallback.
    rpcUrls: ["https://rpc.testnet.arc.io", "https://rpc.blockdaemon.testnet.arc.io"],
    explorerUrl: "https://explorer.testnet.arc.io",
    contract: getAddress(deployment.address),
    examplePledgeId: 1n,
    tokens: tokenConfig.tokens.map((t) => ({
      symbol: t.symbol,
      address: getAddress(t.address),
      decimals: t.decimals,
    })),
  },
  mainnet: {
    chainId: 5042,
    name: "Arc",
    // Listed on the same page; the other mainnet providers it names are permissioned (01 V-02).
    rpcUrls: ["https://rpc.mainnet.arc.io"],
    explorerUrl: "https://explorer.arc.io",
    contract: null,
    // Set to a seeded pledge when the mainnet group deploys; the build refuses until the contract exists.
    examplePledgeId: 1n,
    tokens: [
      // The ERC-20 interface of native USDC reports 6 decimals; the native balance uses 18 (01 V-05).
      { symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 },
      { symbol: "cirBTC", address: "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0", decimals: 8 },
    ],
  },
};

/**
 * Picks the configuration for a build target and refuses one with no contract address. An unset or
 * unknown name is an error rather than a default, so a mainnet build cannot silently become a testnet one.
 *
 * @trace LLR-FE-002
 */
export function selectNetwork(
  name: string | undefined,
  table: Record<NetworkName, NetworkConfig> = networks,
): SelectedNetwork {
  if (name !== "testnet" && name !== "mainnet") {
    throw new Error(`VITE_NETWORK must be "testnet" or "mainnet", got ${JSON.stringify(name)}`);
  }
  const selected = table[name];
  const { contract } = selected;
  if (contract === null) {
    throw new Error(`${name} has no SatStake contract address in its network configuration`);
  }
  return { ...selected, contract };
}
