import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLES, Hero } from "./Hero";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement;
    expect(onChange).toHaveBeenLastCalledWith(EXAMPLES[0]!.replace(/\.$/, ""));
    expect(input.value).toBe(EXAMPLES[0]!.replace(/\.$/, ""));
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "call my sister every Sunday" } });
    expect(onChange).toHaveBeenLastCalledWith("call my sister every Sunday");
    const blur = vi.spyOn(input, "blur");
    expect(fireEvent.keyDown(input, { key: "Enter" })).toBe(false);
    expect(blur).toHaveBeenCalled();
  });

  it("is a text area of one row that grows with what is written, so the whole promise can be read", () => {
    const scroll = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get");
    scroll.mockReturnValue(60);
    const { rerender } = render(
      <Hero custom="short" onCustomChange={() => {}} sub="s">
        {null}
      </Hero>,
    );
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement;
    expect(input.tagName).toBe("TEXTAREA");
    expect(input.rows).toBe(1);
    expect(input.style.height).toBe("60px");
    scroll.mockReturnValue(180);
    rerender(
      <Hero custom="a much longer promise that wraps over three lines of the headline" onCustomChange={() => {}} sub="s">
        {null}
      </Hero>,
    );
    expect(input.style.height).toBe("180px");
    scroll.mockRestore();
  });

  it("adds the border the text area draws to the height it measures, since a border-box height includes the underline", () => {
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockReturnValue(100);
    vi.spyOn(HTMLTextAreaElement.prototype, "offsetHeight", "get").mockReturnValue(62);
    vi.spyOn(HTMLTextAreaElement.prototype, "clientHeight", "get").mockReturnValue(60);
    render(
      <Hero custom="x" onCustomChange={() => {}} sub="s">
        {null}
      </Hero>,
    );
    expect((screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement).style.height).toBe("102px");
    vi.restoreAllMocks();
  });

  it("measures the field again when the window changes size, since the type size changes with it", () => {
    const scroll = vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get");
    scroll.mockReturnValue(60);
    render(
      <Hero custom="x" onCustomChange={() => {}} sub="s">
        {null}
      </Hero>,
    );
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement;
    scroll.mockReturnValue(120);
    fireEvent(window, new Event("resize"));
    expect(input.style.height).toBe("120px");
    scroll.mockRestore();
  });

  it("never inserts a line break: Enter is refused and a pasted break becomes a space", () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Write your own/ }));
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "call my sister\nevery Sunday\r\nplease" } });
    expect(onChange).toHaveBeenLastCalledWith("call my sister every Sunday please");
  });

  it("leaves Enter alone while an input method is composing, since it confirms the composition and not the promise", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: /Write your own/ }));
    const input = screen.getByRole("textbox", { name: "Your promise" });
    const blur = vi.spyOn(input, "blur");
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true })).toBe(true);
    expect(blur).not.toHaveBeenCalled();
  });

  it("leaves alone the Enter that Safari sends to end a composition, which says so only by key code 229", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: /Write your own/ }));
    const input = screen.getByRole("textbox", { name: "Your promise" });
    const blur = vi.spyOn(input, "blur");
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(true);
    expect(blur).not.toHaveBeenCalled();
  });

  it("shrinks again when words are deleted, since a browser never reports less than the height already set", () => {
    // A browser's scrollHeight is at least the element's own height, so only a reset first lets it fall.
    const content = { lines: 3 };
    vi.spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLTextAreaElement) {
      const set = this.style.height === "auto" || this.style.height === "" ? 0 : parseFloat(this.style.height);
      return Math.max(content.lines * 60, set);
    });
    const { rerender } = render(
      <Hero custom="three lines of words" onCustomChange={() => {}} sub="s">
        {null}
      </Hero>,
    );
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement;
    expect(input.style.height).toBe("180px");
    content.lines = 1;
    rerender(
      <Hero custom="one" onCustomChange={() => {}} sub="s">
        {null}
      </Hero>,
    );
    expect(input.style.height).toBe("60px");
    vi.restoreAllMocks();
  });

  it("shows one of the examples, muted, in an empty field, so the sentence never ends in a bare line", () => {
    render(
      <Hero custom="" onCustomChange={() => {}} sub="s">
        {null}
      </Hero>,
    );
    const placeholder = (screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement).placeholder;
    expect(EXAMPLES.map((e) => e.replace(/\.$/, ""))).toContain(placeholder);
  });

  it("holds the length the owner sets", () => {
    render(
      <Hero custom="x" onCustomChange={() => {}} maxLength={42} sub="s">
        {null}
      </Hero>,
    );
    expect(screen.getByRole("textbox", { name: "Your promise" }).getAttribute("maxlength")).toBe("42");
  });

  it("sets the page title it is given, and leaves the focus where the page put it", () => {
    render(
      <Hero custom="" onCustomChange={() => {}} sub="s" title="New promise | SatStake">
        {null}
      </Hero>,
    );
    expect(document.title).toBe("New promise | SatStake");
    expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: "Your promise" }));
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
    const input = screen.getByRole("textbox", { name: "Your promise" }) as HTMLTextAreaElement;
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

describe("LLR-FE-070 the hero can send the visitor to the page where the promise is written", () => {
  it("offers Write your own as a link to that page, and keeps the examples rotating and the field away", () => {
    const onChange = vi.fn();
    render(
      <Hero custom={null} onCustomChange={onChange} writeHref="#/create" sub="A line.">
        <div data-testid="slot" />
      </Hero>,
    );
    const link = screen.getByRole("link", { name: /Write your own/ });
    expect(link.getAttribute("href")).toBe("#/create");
    expect(link.className).toBe("writebtn");
    expect(screen.queryByRole("button", { name: /Write your own/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector(".typed")?.getAttribute("aria-hidden")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();
  });
});
