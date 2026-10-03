import { useRef } from "react";
import { type Connector, useConnect, useConnection, useSwitchChain } from "wagmi";
import { addChainParameter } from "../chain/wagmi";
import type { SelectedNetwork } from "../config/networks";
import { shortAddress } from "./address";
import { RequestNotice, useConnectionFailure } from "./failure";

// The id wagmi gives the connector for window.ethereum, as set up in createAppConfig.
const FALLBACK_ID = "injected";

const hasWindowEthereum = () => Reflect.get(window, "ethereum") !== undefined;

/**
 * The wallet area under the header: which wallets can be connected, who is connected, and a switch to the
 * configured network. The only things it ever asks a wallet for are account access and a network switch or
 * add; wagmi sends nothing else on its behalf here, and the page has no signing call anywhere.
 *
 * @trace LLR-FE-020 LLR-FE-022 LLR-FE-072 LLR-FE-074
 */
export function WalletBar({ network }: { network: SelectedNetwork }) {
  const connection = useConnection();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const statusRef = useRef<HTMLParagraphElement>(null);

  const failure = useConnectionFailure();

  // Wallets that announce themselves are listed by name; window.ethereum is offered only when none does.
  const announced = connectors.filter((c) => c.id !== FALLBACK_ID); // LLR-FE-020
  const fallback = connectors.find((c) => c.id === FALLBACK_ID);
  const options: { connector: Connector; label: string }[] =
    announced.length > 0
      ? announced.map((connector) => ({ connector, label: connector.name }))
      : fallback && hasWindowEthereum()
        ? [{ connector: fallback, label: "browser wallet" }]
        : [];

  const connected = connection.status === "connected";
  const wrongChain = connected && connection.chainId !== network.chainId;
  // aria-disabled and an early return, not the disabled attribute, so the focus stays on the control pressed.
  const busy = connecting || connection.status === "connecting" || connection.status === "reconnecting"; // LLR-FE-020

  // One sentence for every state, in one element that stays in the page, so each change is announced.
  const sentence = connected
    ? wrongChain
      ? `Connected: ${shortAddress(connection.address)}. Your wallet is on another network. SatStake runs on ${network.name}.`
      : `Connected: ${shortAddress(connection.address)} on ${network.name}.`
    : connecting
      ? "Waiting for your wallet. Answer the request in your wallet."
      : busy
        ? "Checking your wallet."
        : "";

  // Focus follows only a request the user made and that succeeded, because the control pressed is gone then.
  const moveFocus = () => statusRef.current?.focus(); // LLR-FE-072

  function pick(connector: Connector) {
    if (busy) return;
    failure.clear();
    // The wallet is asked for accounts here and nowhere else, so nothing is requested before this click.
    connect({ connector }, { onError: failure.fail, onSuccess: moveFocus }); // LLR-FE-020
  }

  function switchNetwork() {
    if (switching) return; // LLR-FE-022
    failure.clear();
    switchChain(
      { chainId: network.chainId, addEthereumChainParameter: addChainParameter(network) }, // LLR-FE-022
      { onError: failure.fail, onSuccess: moveFocus },
    );
  }

  return (
    <section className="wallet-bar" aria-label="Wallet">
      <p
        ref={statusRef}
        role="status"
        aria-label="Wallet status"
        tabIndex={-1}
        className={wrongChain ? "wallet-status wallet-status-action" : "wallet-status"}
      >
        {sentence}
      </p>
      {connected ? (
        wrongChain && (
          <button type="button" aria-disabled={switching} onClick={switchNetwork}>
            {`Switch to ${network.name}`}
          </button>
        )
      ) : options.length > 0 ? (
        <>
          <p>Connect a wallet to create or settle a pledge. You can read every page without one.</p>
          <ul>
            {options.map(({ connector, label }) => (
              <li key={connector.uid}>
                <button type="button" aria-disabled={busy} onClick={() => pick(connector)}>
                  {`Connect ${label}`}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          Creating or settling a pledge needs a browser wallet. On a phone, open this page in your wallet app&apos;s
          browser. You can read every page without one.
        </p>
      )}
      <RequestNotice error={failure.error} label="Wallet notices" />
    </section>
  );
}
