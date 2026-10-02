import { useConnection } from "wagmi";
import { type NetworkCheck, writeActionsEnabled } from "../chain/health";
import type { SelectedNetwork } from "../config/networks";

export interface WalletView {
  status: "connected" | "connecting" | "reconnecting" | "disconnected";
  chainId: number | undefined;
}

export interface WriteGate {
  enabled: boolean;
  /** One plain-words sentence for each condition that is not met. Empty when `enabled`. */
  reasons: string[];
}

const NETWORK_REASONS: Record<Exclude<NetworkCheck["status"], "ok">, string> = {
  checking: "Checking the network.",
  mismatch: "This site is connected to the wrong network, so sending transactions is turned off.",
  unreachable: "This site could not confirm the network, so sending transactions is turned off.",
};

/**
 * Whether a write control may act, and why not when it may not. A control needs a connected wallet on the
 * configured chain and a most recent network check that matched; each unmet condition gets its own reason.
 *
 * @trace LLR-FE-023
 */
export function writeGate(wallet: WalletView, check: NetworkCheck, network: SelectedNetwork): WriteGate {
  const connected = wallet.status === "connected"; // LLR-FE-023
  const onConfiguredChain = wallet.chainId === network.chainId; // LLR-FE-023
  const networkConfirmed = writeActionsEnabled(check); // LLR-FE-023

  const reasons: string[] = [];
  if (!connected) {
    reasons.push(wallet.status === "disconnected" ? "Connect a wallet to act." : "Waiting for your wallet to connect.");
  } else if (!onConfiguredChain) {
    // The wallet's chain is only meaningful once it is connected, so a disconnected wallet gets no chain reason.
    reasons.push(`Your wallet is on another network. Switch to ${network.name}.`);
  }
  if (check.status !== "ok") reasons.push(NETWORK_REASONS[check.status]);
  return { enabled: connected && onConfiguredChain && networkConfirmed, reasons };
}

/**
 * The gate every write control uses. The chain comes from the live connection and not from wagmi's stored
 * chain, which stays on the configured chain whatever the wallet is on.
 *
 * @trace LLR-FE-023
 */
export function useWriteGate(check: NetworkCheck, network: SelectedNetwork): WriteGate {
  const { status, chainId } = useConnection();
  return writeGate({ status, chainId }, check, network);
}
