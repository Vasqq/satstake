import { type ReactNode, type TextareaHTMLAttributes, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageHeading } from "../views/PageHeading";
import { prefersReducedMotion } from "./motion";

export const EXAMPLES: readonly string[] = [
  "run three times this week.",
  "send the draft by Friday.",
  "stop ordering takeout.",
  "ship the release notes by the 31st.",
];

// Types an example out, holds it, erases it, and moves to the next. Reduced motion keeps the first one still.
function useTyper(active: boolean): string {
  const [text, setText] = useState(EXAMPLES[0] as string);
  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    let i = 0;
    let pos = (EXAMPLES[0] as string).length;
    let dir = -1;
    let hold = 55;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (hold > 0) hold--;
      else {
        pos += dir;
        if (pos <= 0) {
          dir = 1;
          i = (i + 1) % EXAMPLES.length;
          hold = 8;
        }
        if (pos >= (EXAMPLES[i] as string).length) {
          dir = -1;
          hold = 80;
        }
        setText((EXAMPLES[i] as string).slice(0, Math.max(0, pos)));
      }
      id = setTimeout(tick, dir < 0 ? 18 : 48);
    };
    id = setTimeout(tick, 1800);
    return () => clearTimeout(id);
  }, [active]);
  return text;
}



export interface HeroProps {
  /** The visitor's own ending of the sentence, or null while the examples rotate. The owner keeps it. */
  custom: string | null;
  onCustomChange: (next: string | null) => void;
  /** The longest ending the field takes. */
  maxLength?: number;
  /** The sentence under the heading. */
  sub: ReactNode;
  /** The document title while the hero is the page. */
  title?: string;
  /** Takes focus into the field when the hero mounts already in writing mode, for a page that exists to be written in. */
  autoFocus?: boolean;
  /** Attributes for the field, such as the description that links it to its count and failure. Never its value, class or length. */
  inputProps?: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className" | "maxLength" | "rows" | "placeholder">;
  /** Mounted under the sentence: the pad, and whatever the create flow shows around it. */
  children?: ReactNode;
}

/**
 * The first screen: "I promise to" finished by rotating examples, or by the visitor's own words, then one
 * sentence on how it works, then the slot the pad goes in.
 *
 * @trace LLR-FE-070
 */
export function Hero({ custom, onCustomChange, maxLength = 200, sub, title = "SatStake", autoFocus = false, inputProps, children }: HeroProps) {
  const typed = useTyper(custom === null);
  const input = useRef<HTMLTextAreaElement>(null);
  const writing = custom !== null;
  // The field is kept as tall as what is written in it, so a promise of any length is read whole while it is typed
  // and after it is sealed. It is measured again when the window changes size and when the fonts arrive, since
  // both change where the lines break.
  const fit = () => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    // The underline is a border, which scrollHeight leaves out and a border-box height must include.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  };
  useLayoutEffect(fit, [custom, writing]);
  useEffect(() => {
    if (!writing) return;
    window.addEventListener("resize", fit);
    void document.fonts?.ready.then(fit);
    return () => window.removeEventListener("resize", fit);
  }, [writing]);
  // Set when the visitor chose to write, so the field takes focus once it exists and not when a parent restores one.
  const focusNext = useRef(autoFocus);
  useEffect(() => {
    if (!writing || !focusNext.current) return;
    focusNext.current = false;
    input.current?.focus();
    input.current?.select();
  }, [writing]);
  const start = () => {
    onCustomChange(typed.replace(/\.$/, ""));
    focusNext.current = true;
  };
  return (
    <section className="hero" aria-label="Make a promise">
      <PageHeading title={title} className="hero-h1">
        I promise to
        {writing ? (
          <textarea
            {...inputProps}
            className="typed typed-in"
            ref={input}
            rows={1}
            value={custom}
            // An example in an empty field, so a page with nothing typed yet is not a bare line.
            placeholder={(EXAMPLES[0] as string).replace(/\.$/, "")}
            // A promise is one sentence, so a line break is never kept: a pasted one becomes a space.
            onChange={(e) => onCustomChange(e.target.value.replace(/\r?\n/g, " "))}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              e.currentTarget.blur();
            }}
            aria-label="Your promise"
            maxLength={maxLength}
            autoComplete="off"
          />
        ) : (
          <span className="typed" onClick={start} aria-hidden="true">
            {typed}
            <span className="caret" />
          </span>
        )}
      </PageHeading>
      <div className="hero-sub">
        <p>{sub}</p>
        {!writing && (
          <button type="button" className="writebtn" onClick={start}>
            Write your own ↗
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
