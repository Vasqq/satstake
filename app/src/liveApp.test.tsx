import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { createAppConfig } from "./chain/wagmi";
import { selectNetwork } from "./config/networks";

// Renders the whole application against the deployed testnet contract. Skipped unless SATSTAKE_LIVE is set.
const live = describe.skipIf(!process.env.SATSTAKE_LIVE);

const network = selectNetwork("testnet");

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

live("LLR-FE-013 LLR-FE-005 the application rendered over Arc testnet", () => {
  const open = (hash: string) => {
    window.location.hash = hash;
    render(<App network={network} config={createAppConfig(network)} />);
  };

  it("shows the example pledge with the state the contract reports, and no network error", async () => {
    open(`#/p/${network.examplePledgeId}`);
    expect((await screen.findByRole("heading", { level: 1 }, { timeout: 15_000 })).textContent).toBe(
      `Pledge #${network.examplePledgeId}`,
    );
    const state = await screen.findByText(/^(Active|Expired|Kept|Broken|Settled)\. /, undefined, {
      timeout: 15_000,
    });
    expect(state).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the not-found view for a pledge the contract does not have", async () => {
    open("#/p/999999");
    expect((await screen.findByRole("heading", { name: "Promise not found" }, { timeout: 15_000 })).tagName).toBe("H1");
  });
});
