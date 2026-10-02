import { selectNetwork } from "./networks";

/** @trace LLR-FE-002 */
export const network = selectNetwork(import.meta.env.VITE_NETWORK);
