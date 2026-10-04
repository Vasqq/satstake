import { type Address, getAddress } from "viem";
import deployment from "../../../deployments/5042002.json" with { type: "json" };
import tokenConfig from "../../../deployments/config/5042002.json" with { type: "json" };
import mainnetDeployment from "../../../deployments/5042.json" with { type: "json" };
import mainnetTokenConfig from "../../../deployments/config/5042.json" with { type: "json" };

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

if (mainnetDeployment.chainId !== 5042) {
  throw new Error("deployments/5042.json does not name Arc mainnet");
}

if (mainnetTokenConfig.chainId !== mainnetDeployment.chainId) {
  throw new Error("deployments/config/5042.json does not name Arc mainnet");
}

if (tokenConfig.chainId !== deployment.chainId) {
  throw new Error("deployments/config and the deployment record name different chains");
}

/**
 * Both contract addresses come from their deployment records, so the app cannot drift from what was
 * deployed. Both networks' tokens come from the deploy script's token config, the file the contract was
 * constructed from, whose entries carry the official page each address was confirmed against.
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
    contract: getAddress(mainnetDeployment.address),
    // The seeded cirBTC pledge, left Active until 2026-11-01. Identifiers are assigned in order from 1, and
    // the seed's create phase refuses unless the contract is fresh or already holds a matching prefix of the
    // seed, so the four seed pledges are ids 1 to 4; every later phase refuses a pledge that is not the seed's.
    examplePledgeId: 4n,
    // The ERC-20 interface of native USDC reports 6 decimals; the native balance uses 18 (01 V-05).
    tokens: mainnetTokenConfig.tokens.map((t) => ({
      symbol: t.symbol,
      address: getAddress(t.address),
      decimals: t.decimals,
    })),
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
