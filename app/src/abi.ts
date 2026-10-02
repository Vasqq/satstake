import type { Abi } from "viem";
// A named import lets the bundler drop the artifact's bytecode and compiler output, keeping only the ABI.
import { abi } from "../../out/SatStake.sol/SatStake.json";

/** @trace LLR-FE-081 */
export const satStakeAbi = abi as Abi;
