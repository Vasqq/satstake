import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLES, Hero } from "./Hero";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Host({ onChange }: { onChange?: (v: string | null) => void }) {
  const [custom, setCustom] = useState<string | null>(null);
  return (
    <Hero
      custom={custom}
      onCustomChange={(v) => {
        setCustom(v);
        onChange?.(v);
      }}
      sub="Or my stake goes to someone I chose."
    >
      <div data-testid="slot">pad goes here</div>
    </Hero>
  );
}

describe("LLR-FE-070 the hero finishes the sentence with examples that rotate", () => {
  it("is one heading that begins I promise to, and mounts what it is given below the sentence", () => {
    render(<Host />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.startsWith("I promise to")).toBe(true);
    expect(h1.textContent).toContain(EXAMPLES[0]);
    expect(screen.getByTestId("slot").textContent).toBe("pad goes here");
    expect(document.title).toBe("SatStake");
  });

  it("hides the changing example from assistive technology, so the heading is not re-read as it types", () => {
    render(<Host />);
    expect(document.querySelector(".typed")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("types out each example in turn", async () => {
    vi.useFakeTimers();
    render(<Host />);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      seen.add(document.querySelector(".typed")?.textContent ?? "");
    }
    for (const example of EXAMPLES) expect(seen.has(example), example).toBe(true);
  });

  it("stays on the first example when the visitor asked for less motion", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }));
    vi.useFakeTimers();
    render(<Host />);
    for (let i = 0; i < 200; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(document.querySelector(".typed")?.textContent).toBe(EXAMPLES[0]);
    }
  });
});

describe("LLR-FE-070 the visitor can write their own ending", () => {
  it("turns the example into an input holding it, reports each change, and ends on Enter", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Write your own/ }));
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLInputElement;
    expect(onChange).toHaveBeenLastCalledWith(EXAMPLES[0]!.replace(/\.$/, ""));
    expect(input.value).toBe(EXAMPLES[0]!.replace(/\.$/, ""));
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "call my sister every Sunday" } });
    expect(onChange).toHaveBeenLastCalledWith("call my sister every Sunday");
    const blur = vi.spyOn(input, "blur");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(blur).toHaveBeenCalled();
  });

  it("holds the length the owner sets", () => {
    render(
      <Hero custom="x" onCustomChange={() => {}} maxLength={42} sub="s">
        {null}
      </Hero>,
    );
    expect(screen.getByRole("textbox", { name: "Your promise" }).getAttribute("maxlength")).toBe("42");
  });

  it("sets the page title it is given, and takes focus into the field on mount only when asked", () => {
    const { unmount } = render(
      <Hero custom="" onCustomChange={() => {}} sub="s" title="New promise | SatStake">
        {null}
      </Hero>,
    );
    expect(document.title).toBe("New promise | SatStake");
    expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: "Your promise" }));
    unmount();
    render(
      <Hero custom="" onCustomChange={() => {}} sub="s" autoFocus>
        {null}
      </Hero>,
    );
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Your promise" }));
  });

  it("passes the owner's attributes to the field, but never its value, class or length", () => {
    const onBlur = vi.fn();
    render(
      <Hero
        custom="abc"
        onCustomChange={() => {}}
        maxLength={42}
        sub="s"
        inputProps={{ id: "mine", "aria-describedby": "a b", "aria-invalid": true, readOnly: true, onBlur, form: "f" }}
      >
        {null}
      </Hero>,
    );
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLInputElement;
    expect(input.id).toBe("mine");
    expect(input.getAttribute("aria-describedby")).toBe("a b");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute("form")).toBe("f");
    expect(input.value).toBe("abc");
    expect(input.className).toBe("typed typed-in");
    expect(input.getAttribute("maxlength")).toBe("42");
    fireEvent.blur(input);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("offers no write-your-own button once the visitor is writing", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: /Write your own/ }));
    expect(screen.queryByRole("button", { name: /Write your own/ })).toBeNull();
  });
});
