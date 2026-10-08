import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChainClock } from "../../chain/clock";
import type { Pledge, PledgeState, Reads } from "../../chain/reads";
import { useTick } from "../../chain/useTick";
import type { SelectedNetwork } from "../../config/networks";
import { formatAmount, formatLocalTime, shorten } from "../../format";
import { NOT_SYNCED, formatClock, formatRemaining } from "../pledge/countdown";
import { usePledgeCount } from "./live";

/** How many of the newest promises the card shows. */
export const MAX_SLIDES = 8;
/** How long a slide stays before the next one. */
export const ROTATE_MS = 8_000;

const CHECK_MS = 100;
const OUT_MS = 180;
const IN_MS = 420;
const STAGGER_MS = 50;
const REDUCED_FADE_MS = 200;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

interface Slide {
  id: bigint;
  pledge: Pledge;
  state: PledgeState;
}

interface Recent {
  slides: Slide[];
  clock: ChainClock;
}

/**
 * The newest promises with their state, newest first, read from the contract. A promise whose read fails is
 * left out rather than guessed at, and a block that cannot be read leaves the clock unsynchronized, which the
 * slide says instead of counting from the device's clock.
 */
async function readRecent(reads: Reads, count: bigint): Promise<Recent> {
  const oldest = count > BigInt(MAX_SLIDES) ? count - BigInt(MAX_SLIDES) + 1n : 1n;
  const ids: bigint[] = [];
  for (let id = count; id >= oldest; id--) ids.push(id);
  const clock = new ChainClock();
  const [, ...slides] = await Promise.all([
    reads.latestBlockTimestamp().then(
      (timestamp) => clock.sync(timestamp, clock.mark()),
      () => undefined,
    ),
    ...ids.map((id) =>
      Promise.all([reads.pledge(id), reads.state(id)]).then(
        ([pledge, state]): Slide => ({ id, pledge, state }),
        () => null,
      ),
    ),
  ]);
  return { slides: slides.filter((s): s is Slide => s !== null), clock };
}

/**
 * The card of recent promises on the landing page. It shows nothing until the contract has said it holds at
 * least one, and then only what was read from it.
 *
 * @trace LLR-FE-070 LLR-FE-010
 */
export function PromiseRotator({ reads, network }: { reads: Reads; network: SelectedNetwork }) {
  const count = usePledgeCount(reads, network);
  const total = count.data ?? 0n;
  const recent = useQuery({
    queryKey: ["home", "recent", network.chainId, network.contract, total.toString()],
    queryFn: () => readRecent(reads, total),
    enabled: total > 0n,
    staleTime: Infinity,
    retry: false,
  });
  if (total === 0n || recent.data === undefined || recent.data.slides.length === 0) return null;
  return <Carousel slides={recent.data.slides} clock={recent.data.clock} network={network} />;
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Carousel({ slides, clock, network }: { slides: Slide[]; clock: ChainClock; network: SelectedNetwork }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [offscreen, setOffscreen] = useState(false);
  const card = useRef<HTMLElement>(null);
  const comingIn = useRef(false);
  const paused = userPaused || hovering || focusInside || hidden || offscreen;
  // The timer below reads the latest value without being restarted by it.
  const pausedNow = useRef(paused);
  useEffect(() => {
    pausedNow.current = paused;
  }, [paused]);
  const many = slides.length > 1;

  // Native listeners: React's enter and leave are synthesized from over and out, and focus containment is
  // simplest against the real focusin and focusout.
  useEffect(() => {
    const el = card.current;
    if (el === null) return;
    const enter = () => setHovering(true);
    const leave = () => setHovering(false);
    const focusIn = () => setFocusInside(true);
    const focusOut = (e: FocusEvent) => {
      if (!(e.relatedTarget instanceof Node) || !el.contains(e.relatedTarget)) setFocusInside(false);
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focusin", focusIn);
    el.addEventListener("focusout", focusOut);
    return () => {
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusin", focusIn);
      el.removeEventListener("focusout", focusOut);
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const el = card.current;
    if (el === null || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setOffscreen(!(entries.at(-1)?.isIntersecting ?? true)), { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The timer, not the bar's CSS animation, decides when to move on, so the rotation is testable and the bar
  // stays decoration. Only time spent unpaused counts, which is why it adds up instead of using one timeout.
  useEffect(() => {
    if (!many) return;
    let active = true;
    let waited = 0;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      // A throttled or suspended tab can deliver a late tick; one long gap must not skip a whole slide.
      if (!pausedNow.current) waited += Math.min(now - last, 2 * CHECK_MS);
      last = now;
      if (waited < ROTATE_MS) return;
      clearInterval(timer);
      const next = (index + 1) % slides.length;
      const parts = card.current === null ? [] : [...card.current.querySelectorAll<HTMLElement>("[data-part]")];
      if (reducedMotion() || parts.length === 0 || typeof parts[0]?.animate !== "function") {
        comingIn.current = true;
        setIndex(next);
        return;
      }
      const leaving = parts.map((el) =>
        el.animate(
          [
            { opacity: 1, transform: "none", filter: "blur(0)" },
            { opacity: 0, transform: "translateY(-6px)", filter: "blur(4px)" },
          ],
          { duration: OUT_MS, easing: EASE_OUT, fill: "forwards" },
        ),
      );
      void leaving[0]?.finished.then(() => {
        if (!active) return;
        comingIn.current = true;
        setIndex(next);
      });
    }, CHECK_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [index, many, slides.length]);

  // Runs after the new slide is in the DOM and before it is painted, so it never shows a frame at rest first.
  useLayoutEffect(() => {
    if (!comingIn.current) return;
    comingIn.current = false;
    const parts = card.current === null ? [] : [...card.current.querySelectorAll<HTMLElement>("[data-part]")];
    parts.forEach((el, k) => {
      if (typeof el.animate !== "function") return;
      if (typeof el.getAnimations === "function") el.getAnimations().forEach((a) => a.cancel());
      if (reducedMotion()) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: "ease" });
        return;
      }
      el.animate(
        [
          { opacity: 0, transform: "translateY(10px)", filter: "blur(4px)" },
          { opacity: 1, transform: "none", filter: "blur(0)" },
        ],
        { duration: IN_MS, delay: k * STAGGER_MS, easing: EASE_OUT, fill: "backwards" },
      );
    });
  }, [index]);

  const slide = slides[index] as Slide;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <section
      ref={card}
      className="card home-rot"
      aria-roledescription="carousel"
      aria-label={`Recent promises on ${network.name}`}
    >
      <div className="home-rot-top">
        <span className="home-rot-id" data-part>
          <a className="label" href={`#/p/${slide.id.toString()}`}>
            Promise #{slide.id.toString()}
            <span className="visually-hidden">, open it</span>
          </a>
          <SlideState slide={slide} clock={clock} />
        </span>
        {many && (
          <span className="home-rot-controls">
            <span className="home-rot-count mono" aria-hidden="true">
              {pad(index + 1)} / {pad(slides.length)}
            </span>
            <button
              type="button"
              className="home-rot-pause"
              aria-pressed={userPaused}
              aria-label={userPaused ? "Resume the rotation" : "Pause the rotation"}
              onClick={() => setUserPaused((p) => !p)}
            >
              <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                {userPaused ? (
                  <path d="M3 1.8v8.4c0 .5.5.8.9.5l6.6-4.2c.4-.2.4-.8 0-1L3.9 1.3C3.5 1 3 1.3 3 1.8z" />
                ) : (
                  <>
                    <rect x="2" y="1.5" width="2.6" height="9" rx="1" />
                    <rect x="7.4" y="1.5" width="2.6" height="9" rx="1" />
                  </>
                )}
              </svg>
            </button>
          </span>
        )}
      </div>
      <SlideBody slide={slide} clock={clock} network={network} />
      {many && (
        <span className="home-rot-bar" aria-hidden="true">
          <span key={index} className={paused ? "home-rot-fill is-paused" : "home-rot-fill"} />
        </span>
      )}
    </section>
  );
}

/** Active, and still before the deadline on the chain's own time. Null when the time is not known. */
function remainingFor(slide: Slide, clock: ChainClock): bigint | null {
  const now = clock.now();
  return now === null ? null : slide.pledge.deadline - now;
}

const ENDED_WORDS: Readonly<Record<Exclude<PledgeState, "Active">, { state: string; big: string }>> = {
  Expired: { state: "No answer by the deadline", big: "No answer" },
  Kept: { state: "Kept", big: "Kept" },
  Broken: { state: "Broken", big: "Broken" },
  SettledToStaker: { state: "Settled", big: "Paid back" },
  SettledToBeneficiary: { state: "Settled", big: "Paid out" },
};

function SlideState({ slide, clock }: { slide: Slide; clock: ChainClock }) {
  useTick();
  if (slide.state !== "Active") return <span className="home-rot-state is-ended">{ENDED_WORDS[slide.state].state}</span>;
  const remaining = remainingFor(slide, clock);
  const passed = remaining !== null && remaining <= 0n;
  return <span className={passed ? "home-rot-state is-ended" : "home-rot-state"}>{passed ? "Deadline passed" : "Open"}</span>;
}

function SlideBody({ slide, clock, network }: { slide: Slide; clock: ChainClock; network: SelectedNetwork }) {
  const { pledge } = slide;
  return (
    <>
      <blockquote className="home-rot-quote" data-part>
        {`“${pledge.promiseText}”`}
      </blockquote>
      <div className="home-rot-slot" data-part>
        {slide.state === "Active" ? <OpenClock slide={slide} clock={clock} /> : <EndedClock slide={slide} />}
      </div>
      <dl className="home-rot-facts" data-part>
        <div>
          <dt className="label">Stake</dt>
          <dd>{formatAmount(network, pledge.token, pledge.amount)}</dd>
        </div>
        <Party label="Made it" address={pledge.staker} />
        <Party label="Judges it" address={pledge.referee} />
        <Party label="Gets it if missed" address={pledge.beneficiary} />
      </dl>
    </>
  );
}

function Party({ label, address }: { label: string; address: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd title={address}>{shorten(address)}</dd>
    </div>
  );
}

function OpenClock({ slide, clock }: { slide: Slide; clock: ChainClock }) {
  useTick();
  const remaining = remainingFor(slide, clock);
  const deadline = <p className="home-rot-sub mono">Deadline {formatLocalTime(slide.pledge.deadline)}</p>;
  if (remaining === null) {
    return (
      <>
        <p className="clock home-rot-clock is-ended">{NOT_SYNCED}</p>
        {deadline}
      </>
    );
  }
  const face = formatClock(remaining);
  return (
    <>
      <p className="clock home-rot-clock" role="img" aria-label={remaining <= 0n ? formatRemaining(remaining) : `Time left: ${formatRemaining(remaining)}`}>
        <span>{face.d}d</span>
        <span>{face.h}h</span>
        <span>{face.m}m</span>
        <span>{face.s}s</span>
      </p>
      {deadline}
    </>
  );
}

function EndedClock({ slide }: { slide: Slide }) {
  const state = slide.state as Exclude<PledgeState, "Active">;
  const { pledge } = slide;
  const toStaker = state === "Kept" || state === "SettledToStaker";
  const settled = state === "SettledToStaker" || state === "SettledToBeneficiary";
  const where = toStaker ? pledge.staker : pledge.beneficiary;
  const phrase = settled ? (toStaker ? "The stake went back to " : "The stake went to ") : toStaker ? "The stake goes back to " : "The stake goes to ";
  return (
    <>
      <p className="clock home-rot-clock is-ended">{ENDED_WORDS[state].big}</p>
      <p className="home-rot-sub mono">
        {state === "Expired" && "Silence counts as broken. "}
        {phrase}
        <code title={where}>{shorten(where)}</code>
      </p>
    </>
  );
}
