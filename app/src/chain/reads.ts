import { type Address, BaseError, ContractFunctionRevertedError, type PublicClient } from "viem";
import { satStakeAbi } from "../abi";

/** @trace LLR-FE-010 */
export const PLEDGE_STATES = [
  "Active",
  "Expired",
  "Kept",
  "Broken",
  "SettledToStaker",
  "SettledToBeneficiary",
] as const;

export type PledgeState = (typeof PLEDGE_STATES)[number];

export interface Pledge {
  staker: Address;
  token: Address;
  amount: bigint;
  referee: Address;
  beneficiary: Address;
  deadline: bigint;
  createdAt: bigint;
  status: number;
  promiseText: string;
}

const isAddress = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);

/**
 * The ABI is read from the artifact at build time and carries no literal types, so the decoded value
 * is checked here instead of being trusted. A changed struct fails loudly rather than rendering wrongly.
 *
 * @trace LLR-FE-010
 */
export function parsePledge(raw: unknown): Pledge {
  const p = raw as Record<string, unknown> | null;
  if (
    p !== null &&
    typeof p === "object" &&
    isAddress(p.staker) &&
    isAddress(p.token) &&
    typeof p.amount === "bigint" &&
    isAddress(p.referee) &&
    isAddress(p.beneficiary) &&
    typeof p.deadline === "bigint" &&
    typeof p.createdAt === "bigint" &&
    typeof p.status === "number" &&
    typeof p.promiseText === "string"
  ) {
    return {
      staker: p.staker,
      token: p.token,
      amount: p.amount,
      referee: p.referee,
      beneficiary: p.beneficiary,
      deadline: p.deadline,
      createdAt: p.createdAt,
      status: p.status,
      promiseText: p.promiseText,
    };
  }
  throw new Error("getPledge returned a value that does not match the Pledge struct");
}

/**
 * The only functions through which the application obtains pledge data. Logs are never read: the public
 * endpoint caps their span and lags between backends (01 V-11).
 *
 * @trace LLR-FE-010
 */
export function createReads(client: PublicClient, address: Address) {
  return {
    async pledge(id: bigint): Promise<Pledge> {
      return parsePledge(await client.readContract({ address, abi: satStakeAbi, functionName: "getPledge", args: [id] }));
    },

    async state(id: bigint): Promise<PledgeState> {
      const value = await client.readContract({ address, abi: satStakeAbi, functionName: "stateOf", args: [id] });
      const name = typeof value === "number" ? PLEDGE_STATES[value] : undefined;
      if (name === undefined) throw new Error(`stateOf returned an unknown pledge state: ${String(value)}`);
      return name;
    },

    async pledgeCount(): Promise<bigint> {
      return (await client.readContract({ address, abi: satStakeAbi, functionName: "pledgeCount" })) as bigint;
    },

    async pledgeCountOf(account: Address): Promise<bigint> {
      return (await client.readContract({
        address,
        abi: satStakeAbi,
        functionName: "pledgeCountOf",
        args: [account],
      })) as bigint;
    },

    async pledgeIdsOf(account: Address, offset: bigint, limit: bigint): Promise<readonly bigint[]> {
      return (await client.readContract({
        address,
        abi: satStakeAbi,
        functionName: "pledgeIdsOf",
        args: [account, offset, limit],
      })) as readonly bigint[];
    },

    async totalLocked(token: Address): Promise<bigint> {
      return (await client.readContract({
        address,
        abi: satStakeAbi,
        functionName: "totalLocked",
        args: [token],
      })) as bigint;
    },

    // Not pledge data, so outside the six views: the block header gives the chain time that LLR-FE-012 needs.
    async latestBlockTimestamp(): Promise<bigint> {
      return (await client.getBlock()).timestamp;
    },
  };
}

export type Reads = ReturnType<typeof createReads>;

/** @trace LLR-FE-013 */
export function isPledgeNotFound(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName === "PledgeNotFound";
}
