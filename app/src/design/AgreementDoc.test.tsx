import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgreementDoc, CLAUSE_ROLES, type ReadAs } from "./AgreementDoc";

afterEach(cleanup);

const props = {
  title: "Promise #4",
  amountLabel: "$5.00 in USDC",
  staker: "0xaaaa…1111",
  referee: "0xbbbb…2222",
  beneficiary: "0xcccc…3333",
  deadlineText: "Nov 1, 2026, 9:00 PM UTC",
};

const clauses = () => [...document.querySelectorAll(".doc li")] as HTMLElement[];

describe("LLR-FE-040 the agreement reads the same seven lines for every pledge", () => {
  it("has seven numbered lines and the title it is given", () => {
    render(<AgreementDoc {...props} />);
    expect(clauses().length).toBe(7);
    expect(screen.getByRole("heading", { name: "Promise #4" })).toBeTruthy();
  });

  it("puts the amount, the three parties and the deadline it is given into the document", () => {
    render(<AgreementDoc {...props} />);
    const text = document.querySelector(".doc")!.textContent!;
    expect(text).toContain("$5.00 in USDC");
    expect(text).toContain("Nov 1, 2026, 9:00 PM UTC");
    for (const a of [props.staker, props.referee, props.beneficiary]) expect(text).toContain(a);
  });

  it("shows a placeholder, and not an invented address, when a party is not known", () => {
    render(<AgreementDoc {...props} staker={undefined} referee={undefined} beneficiary={undefined} />);
    expect(document.querySelector(".margin")!.textContent).not.toMatch(/0x[0-9a-f]/i);
    expect(within(document.querySelector(".margin") as HTMLElement).getAllByText("not set yet").length).toBe(3);
  });

  it("keeps the design's words for the seven lines", () => {
    render(<AgreementDoc {...props} />);
    expect(clauses()[3]!.textContent).toContain("the stake goes to the beneficiary");
    expect(clauses()[5]!.textContent).toContain("Nobody can cancel, edit or extend this promise.");
    expect(clauses()[6]!.textContent).toContain("must be three different addresses");
  });
});

describe("LLR-FE-040 Read as lights the lines that apply to a role", () => {
  it("offers the four roles and starts with none chosen", () => {
    render(<AgreementDoc {...props} />);
    const group = screen.getByRole("group", { name: "Read as" });
    const names = within(group).getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Staker", "Referee", "Beneficiary", "Anyone"]);
    expect(within(group).queryAllByRole("button", { pressed: true }).length).toBe(0);
    expect(document.querySelector(".doc.focus")).toBeNull();
  });

  it.each(["staker", "referee", "beneficiary", "anyone"] as ReadAs[])("marks exactly the lines of %s as the ones that apply", (role) => {
    render(<AgreementDoc {...props} />);
    const label = role[0]!.toUpperCase() + role.slice(1);
    fireEvent.click(within(screen.getByRole("group", { name: "Read as" })).getByRole("button", { name: label }));
    const lit = clauses().map((li) => li.classList.contains("hit"));
    // Written out here, so a change to the table in the component is not read back as agreement with itself.
    const table: ReadAs[][] = [["staker"], ["referee"], ["staker", "referee"], ["referee", "beneficiary"], ["anyone"], ["staker"], ["staker", "referee", "beneficiary"]];
    expect(lit).toEqual(table.map((roles) => roles.includes(role)));
    expect(CLAUSE_ROLES.map((r) => [...r])).toEqual(table);
    expect(document.querySelector(".doc.focus")).toBeTruthy();
    expect(lit.some(Boolean)).toBe(true);
  });

  it("puts the highlight on the role words inside the lines", () => {
    render(<AgreementDoc {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Referee" }));
    const on = [...document.querySelectorAll(".r.on")].map((n) => n.textContent);
    expect(on.length).toBeGreaterThan(0);
    expect(new Set(on)).toEqual(new Set(["referee"]));
  });

  it("clears the choice when the same role is chosen again", () => {
    render(<AgreementDoc {...props} />);
    const staker = screen.getByRole("button", { name: "Staker" });
    fireEvent.click(staker);
    expect(staker.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(staker);
    expect(staker.getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".doc.focus")).toBeNull();
  });

  it("lets a signature line choose its own role, as the buttons do", () => {
    render(<AgreementDoc {...props} />);
    fireEvent.click(screen.getByText("Beneficiary", { selector: ".sig b" }));
    expect(screen.getByRole("button", { name: "Beneficiary" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".sig.on")?.textContent).toContain("Beneficiary");
  });

  it("can be driven from outside, and reports a choice without making it", () => {
    const onRoleChange = vi.fn();
    render(<AgreementDoc {...props} role="referee" onRoleChange={onRoleChange} />);
    expect(screen.getByRole("button", { name: "Referee" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Staker" }));
    expect(onRoleChange).toHaveBeenCalledWith("staker");
    expect(screen.getByRole("button", { name: "Referee" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Referee" }));
    expect(onRoleChange).toHaveBeenLastCalledWith(null);
  });

  it("works when the caller owns the state", () => {
    function Host() {
      const [role, setRole] = useState<ReadAs | null>("anyone");
      return <AgreementDoc {...props} role={role} onRoleChange={setRole} />;
    }
    render(<Host />);
    expect(screen.getByRole("button", { name: "Anyone" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Staker" }));
    expect(screen.getByRole("button", { name: "Staker" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Anyone" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("LLR-FE-044 the agreement leaves room for the actions a role has", () => {
  it("renders an action under the line it belongs to and one under the whole document", () => {
    render(
      <AgreementDoc
        {...props}
        clauseActions={{ 1: <button type="button">Mark Kept</button>, 4: <button type="button">Send the payout</button> }}
        footer={<p>Under the document</p>}
      />,
    );
    expect(clauses()[1]!.contains(screen.getByRole("button", { name: "Mark Kept" }))).toBe(true);
    expect(clauses()[4]!.contains(screen.getByRole("button", { name: "Send the payout" }))).toBe(true);
    expect(document.querySelector(".doc")!.nextElementSibling?.textContent).toBe("Under the document");
  });

  it("shows the staker's signature when it is given one, and 'signed' placeholder text otherwise", () => {
    const view = render(<AgreementDoc {...props} signatures={{ staker: <span>my ink</span> }} />);
    expect(view.container.querySelector(".sig .line")?.textContent).toBe("my ink");
    view.unmount();
    const bare = render(<AgreementDoc {...props} />);
    expect(bare.container.querySelector(".sig .line")?.textContent).toBe("");
  });

  it("writes each role's note after a plain value, joined to it so a wrap never starts a line with the dot", () => {
    render(<AgreementDoc {...props} />);
    const notes = [...document.querySelectorAll(".sig code")].map((c) => c.textContent);
    expect(notes).toEqual([props.staker, `${props.referee}\u00a0· rules once`, `${props.beneficiary}\u00a0· receives if broken or silent`]);
  });

  it("hands the note to a value that wants to place it, and writes it only once", () => {
    render(<AgreementDoc {...props} referee={(note) => <i data-testid="mine">{`mine says ${note}`}</i>} />);
    expect(screen.getByTestId("mine").textContent).toBe("mine says rules once");
    expect(document.querySelectorAll(".sig")[1]!.textContent).not.toMatch(/rules once.*rules once/);
  });

  it("marks the connected party with (you) beside the role's name", () => {
    render(<AgreementDoc {...props} you="beneficiary" />);
    const names = [...document.querySelectorAll(".sig b")].map((b) => b.textContent);
    expect(names).toEqual(["Staker", "Referee", "Beneficiary (you)"]);
  });

  it("gives each Read as button a class of its own, so the plain-button style of the other views never reaches it", () => {
    render(<AgreementDoc {...props} />);
    for (const button of screen.getAllByRole("button")) expect(button.className, button.textContent ?? "").not.toBe("");
  });

  it("labels itself an example only when told it is one", () => {
    const view = render(<AgreementDoc {...props} example />);
    expect(view.container.querySelector(".example")?.textContent).toMatch(/example/i);
    view.unmount();
    const real = render(<AgreementDoc {...props} />);
    expect(real.container.querySelector(".example")).toBeNull();
  });
});
