import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { WagmiProvider, usePublicClient, type Config } from "wagmi";
import type { PublicClient } from "viem";
import { type NetworkCheck, type TokenCheck } from "./chain/health";
import { createReads } from "./chain/reads";
import { useHealth } from "./chain/useHealth";
import type { SelectedNetwork } from "./config/networks";
import type { Route } from "./routes";
import { CopyLink } from "./create/CopyLink";
import { CreateView } from "./create/CreateView";
import { useHashRoute, useNavigated } from "./useHashRoute";
import { NavigatedContext } from "./views/PageHeading";
import { PledgeView } from "./views/PledgeView";
import { AboutView, HomeView, MineView, NotFoundView } from "./views/Views";
import { WalletBar } from "./wallet/WalletBar";

const NAV: { route: Route["name"]; href: string; label: string }[] = [
  { route: "create", href: "#/create", label: "Create" },
  { route: "mine", href: "#/mine", label: "My pledges" },
  { route: "about", href: "#/about", label: "About" },
];

function networkError(check: NetworkCheck, network: SelectedNetwork): string | null {
  const consequence = "Sending transactions is turned off, and this page checks again every 30 seconds.";
  if (check.status === "mismatch") {
    return `Network error. The network answered as chain ${check.actual}, but this site uses ${network.name} (chain ${check.expected}). ${consequence}`;
  }
  if (check.status === "unreachable") {
    return `Network error. This site could not reach the network, so it cannot tell which one it is talking to. ${consequence}`;
  }
  return null;
}

function tokenNotice(check: TokenCheck): string | null {
  if (check.status === "ok") return null;
  const cause =
    check.status === "mismatch"
      ? "The token on the network does not match what this site expects."
      : "This site could not read the token from the network.";
  return `${check.token.symbol} cannot be used for new pledges right now. ${cause}`;
}

function Header({ route }: { route: Route }) {
  return (
    <header className="site-header">
      <a className="brand" href="#/" aria-current={route.name === "home" ? "page" : undefined}>
        SatStake
      </a>
      <nav aria-label="Main">
        {NAV.map((item) => (
          <a key={item.route} href={item.href} aria-current={route.name === item.route ? "page" : undefined}>
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

function Footer({ network }: { network: SelectedNetwork }) {
  return (
    <footer className="site-footer">
      <p>SatStake runs on {network.name}.</p>
      <p>
        <a href="https://github.com/Vasqq/satstake">Source code on GitHub</a>
      </p>
    </footer>
  );
}

function Shell({ client, network }: { client: PublicClient; network: SelectedNetwork }) {
  const route = useHashRoute();
  const health = useHealth(client, network);
  const reads = useMemo(() => createReads(client, network.contract), [client, network.contract]);
  const error = networkError(health.network, network);
  const notices = (health.tokens ?? []).map(tokenNotice).filter((n): n is string => n !== null);
  const navigated = useNavigated();
  // The pledge the visitor has just created, so its page offers the copy-link control and no other page does.
  const [created, setCreated] = useState<bigint | null>(null);

  return (
    <NavigatedContext.Provider value={navigated}>
      <Header route={route} />
      <WalletBar network={network} />
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      {/* Mounted from the first render and filled later, which is what a screen reader announces. */}
      <div role="status" aria-label="Token notices">
        {notices.map((notice) => (
          <p className="banner banner-notice" key={notice}>
            {notice}
          </p>
        ))}
      </div>
      <main>
        {route.name === "home" && <HomeView />}
        {route.name === "create" && (
          <CreateView client={client} reads={reads} network={network} health={health} onCreated={setCreated} />
        )}
        {route.name === "mine" && <MineView />}
        {route.name === "about" && <AboutView />}
        {route.name === "pledge" && (
          <PledgeView
            key={route.id.toString()}
            reads={reads}
            client={client}
            network={network}
            health={health}
            id={route.id}
            afterStatus={created === route.id ? <CopyLink id={route.id} /> : undefined}
          />
        )}
        {route.name === "notFound" && <NotFoundView />}
      </main>
      <Footer network={network} />
    </NavigatedContext.Provider>
  );
}

/**
 * Every read goes through the client of the configured chain, which never depends on a wallet, so each view
 * renders the same with no wallet connected.
 *
 * @trace LLR-FE-021
 */
function ChainShell({ network }: { network: SelectedNetwork }) {
  const client = usePublicClient({ chainId: network.chainId });
  if (!client) return null;
  return <Shell client={client as PublicClient} network={network} />;
}

/** @trace LLR-FE-013 LLR-FE-072 */
export function App({ network, config }: { network: SelectedNetwork; config: Config }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ChainShell network={network} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
