import type { PublicClient } from "viem";
import { usePublicClient } from "wagmi";
import type { Reads } from "../chain/reads";
import { useHealth } from "../chain/useHealth";
import type { SelectedNetwork } from "../config/networks";
import { CreateView } from "./CreateView";

function WithClient({ client, reads, network }: { client: PublicClient; reads: Reads; network: SelectedNetwork }) {
  // The same queries as the shell's, so the checks are shared and not asked twice.
  const health = useHealth(client, network);
  return <CreateView client={client} reads={reads} network={network} health={health} variant="landing" />;
}

/**
 * The hero of the landing page with the pad live, for a view that is given only what it reads.
 *
 * @trace LLR-FE-037 LLR-FE-070
 */
export function LandingCreate({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  const client = usePublicClient({ chainId: network.chainId });
  if (!client) return null;
  return <WithClient client={client as PublicClient} reads={reads} network={network} />;
}
