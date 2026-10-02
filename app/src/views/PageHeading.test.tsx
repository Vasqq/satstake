import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeading } from "./PageHeading";

afterEach(cleanup);

describe("LLR-FE-072 a page heading sets the title and takes focus", () => {
  it("sets the document title and focuses the heading when it mounts", () => {
    document.title = "stale";
    render(<PageHeading title="One | SatStake">One</PageHeading>);
    const heading = screen.getByRole("heading", { level: 1, name: "One" });
    expect(document.title).toBe("One | SatStake");
    expect(document.activeElement).toBe(heading);
  });

  it("follows a new title on the same heading, as when a route changes without remounting it", () => {
    const { rerender } = render(<PageHeading title="One | SatStake">One</PageHeading>);
    rerender(<PageHeading title="Two | SatStake">Two</PageHeading>);
    expect(document.title).toBe("Two | SatStake");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Two" }));
  });

  it("can take focus by script but is not in the tab order", () => {
    render(<PageHeading title="One | SatStake">One</PageHeading>);
    expect(screen.getByRole("heading", { name: "One" }).getAttribute("tabindex")).toBe("-1");
  });
});
