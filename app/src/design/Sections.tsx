import { type ReactNode, useEffect, useRef, useState } from "react";

/** The head every section of the page opens with: a small label, a large title, and one sentence. */
export function SectionHead({ label, title, children }: { label: string; title: ReactNode; children: ReactNode }) {
  return (
    <div className="sh">
      <div>
        <span className="label">{label}</span>
        <h2>{title}</h2>
      </div>
      <p>{children}</p>
    </div>
  );
}

function wobble(seed: number): string {
  let s = seed * 9301 + 49297;
  const r = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const y0 = 5 + r() * 2 - 1;
  return `M0 ${y0.toFixed(2)} C 30 ${(3 + r() * 4).toFixed(2)}, 60 ${(4 + r() * 4).toFixed(2)}, 100 ${(4 + r() * 3).toFixed(2)}`;
}

export const STRIKES: readonly (readonly [string, string])[] = [
  ["Cancel it", "There’s no withdraw button. Only a Kept verdict returns the stake."],
  ["Edit the words", "The promise is written to Arc as you wrote it, permanently."],
  ["Move the deadline", "It can be a minute or a year away, but once it’s set, it’s set."],
  ["Swap the referee", "The people are fixed when the promise is made."],
  ["Take a fee", "SatStake earns nothing. The only cost is Arc’s network fee, in cents."],
  ["Pause or upgrade it", "No owner, no admin key, no pause switch, no upgrade path."],
];

/** What cannot be done once a promise is sealed, each struck through as it scrolls into view. */
export function Strikes() {
  const ref = useRef<HTMLUListElement>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver !== "function");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <ul className={"strikes" + (seen ? " in" : "")} ref={ref}>
      {STRIKES.map(([word, note], i) => (
        <li key={word}>
          <span className="w">
            {word}
            <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
              <path d={wobble(i + 3)} pathLength="1" style={{ transitionDelay: `${i * 0.14}s` }} />
            </svg>
          </span>
          <span className="n">{note}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a visitor is trusting, said plainly. The one sentence that names the claim SatStake does not make is
 * listed word for word in the user-strings test (LLR-FE-071).
 *
 * @trace LLR-FE-071
 */
export function Trust() {
  return (
    <>
      <SectionHead label="In plain words" title={<>What you’re <em>trusting.</em></>}>
        SatStake doesn’t claim to be trustless. The code holds the money, and two parties still matter.
      </SectionHead>
      <div className="trust">
        <div>
          <h3>Your referee</h3>
          <p>
            A dishonest referee can mark a kept promise broken, or never answer. Either way the stake goes to the beneficiary. Choose someone
            honest.
          </p>
        </div>
        <div>
          <h3>Circle</h3>
          <p>
            Circle issues USDC and cirBTC and can pause a token or block an address. While paused, promises in that token can’t be created or paid
            out. A blocked recipient’s stake waits until the block lifts.
          </p>
        </div>
        <div>
          <h3>Your own care</h3>
          <ul>
            <li>Every word you write is public, forever.</li>
            <li>A beneficiary address nobody owns loses the stake for good.</li>
            <li>Tokens sent straight to the contract can’t be recovered.</li>
            <li>Tested requirement by requirement, not audited.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
