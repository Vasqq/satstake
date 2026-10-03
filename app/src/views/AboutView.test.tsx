import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { mountApp, teardownWallets } from "../test/walletHarness";

afterEach(() => {
  cleanup();
  teardownWallets();
});

const about = () => mountApp({ hash: "#/about" });

describe("LLR-FE-071 the trust model and limits of NS section 7", () => {
  it("has the title, the heading and the introduction", () => {
    about();
    expect(document.title).toBe("About SatStake");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("About SatStake");
    expect(
      screen.getByText(
        "SatStake is a smart contract on Arc and this website, which reads and uses it. You lock a stake against a promise, and a referee you choose decides whether you kept it.",
      ),
    ).toBeTruthy();
  });

  it("has the three sections in order", () => {
    about();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "What you are trusting",
      "Limits to know",
      "What SatStake cannot do",
    ]);
  });

  it("states that the referee alone decides and that silence pays the beneficiary", () => {
    about();
    const text = screen.getByText("Your referee.").parentElement!.textContent!;
    expect(text).toBe(
      "Your referee. The referee alone decides. A dishonest referee can mark a kept promise broken. If your referee does not mark the promise kept before the deadline, the stake goes to the beneficiary, even if you kept it. SatStake only stops you from being your own referee or beneficiary, and stops the referee from also being the beneficiary.",
    );
  });

  it("states the token issuer's powers", () => {
    about();
    expect(screen.getByText("The token issuer.").parentElement!.textContent).toBe(
      "The token issuer. Circle can pause cirBTC or USDC, or block an address. While a token is paused, pledges in it cannot be created or settled. If the person receiving a stake is blocked, that stake stays locked until the block is lifted. Other pledges are not affected.",
    );
  });

  it("makes each lead phrase bold", () => {
    about();
    for (const lead of ["Your referee.", "The token issuer."]) expect(screen.getByText(lead).tagName).toBe("STRONG");
  });

  it("lists the limits to know", () => {
    about();
    expect(screen.getByText("Tokens sent straight to the contract, outside a pledge, cannot be recovered. There is no function to sweep them.")).toBeTruthy();
    expect(
      screen.getByText(
        "If the beneficiary address belongs to no one, the stake of a broken or expired pledge is lost for good. Check the address before you create a pledge.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("SatStake is tested, not formally verified, and has not been audited.")).toBeTruthy();
  });

  it("states what SatStake cannot do, without claiming more than the contract does", () => {
    about();
    expect(
      screen.getByText(
        "SatStake itself has no owner, admin, fee, pause, or upgrade function. After a pledge is created, no one can cancel it, change its amount, move its deadline, or change who receives the stake. The token issuer's powers above still apply.",
      ),
    ).toBeTruthy();
  });
});
