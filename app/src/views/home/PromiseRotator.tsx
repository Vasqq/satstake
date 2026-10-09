import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChainClock } from "../../chain/clock";
import type { Pledge, PledgeState, Reads } from "../../chain/reads";
import { useTick } from "../../chain/useTick";
import type { SelectedNetwork } from "../../config/networks";
import { formatAmount, formatLocalTime, shorten } from "../../format";
import { NOT_SYNCED, formatClock, formatRemaining } from "../pledge/countdown";
import { ROLE_LABELS } from "../roles";
import { STATE_NAMES } from "../stateLabels";
import { COUNT_RETRY_MS, usePledgeCount } from "./live";

/** How many of the newest promises the card shows. */
export const MAX_SLIDES = 8;
/** How long a slide stays before the next one. */
export const ROTATE_MS = 8_000;
/** How often the card reads the contract again while the page is visible. */
export const REFRESH_MS = COUNT_RETRY_MS;

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

/**
 * The newest promises with their state, newest first, read from the contract. A promise whose read fails is
 * left out rather than guessed at. The clock is the caller's and lives across reads: a block that cannot be
 * read leaves it as it was (unsynchronized the first time, which the slide says instead of counting from the
 * device's clock), and the next read tries again. When promises exist but none could be read, the read fails,
 * so a refresh keeps the cards already on screen instead of clearing them.
 */
async function readRecent(reads: Reads, count: bigint, clock: ChainClock): Promise<Slide[]> {
  const oldest = count > BigInt(MAX_SLIDES) ? count - BigInt(MAX_SLIDES) + 1n : 1n;
  const ids: bigint[] = [];
  for (let id = count; id >= oldest; id--) ids.push(id);
  const [, ...read] = await Promise.all([
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
  const slides = read.filter((slide): slide is Slide => slide !== null);
  if (ids.length > 0 && slides.length === 0) throw new Error("no promise could be read");
  return slides;
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
  const [clock] = useState(() => new ChainClock());
  const recent = useQuery({
    queryKey: ["home", "recent", network.chainId, network.contract, total.toString()],
    queryFn: () => readRecent(reads, total, clock),
    enabled: total > 0n,
    staleTime: Infinity,
    retry: false,
    // A new newest promise changes the key; the cards already shown stay until its read finishes.
    placeholderData: keepPreviousData,
  });

  // The timer reads the latest queries without being restarted by them.
  const latest = useRef({ total, refetchCount: count.refetch, refetchRecent: recent.refetch });
  useEffect(() => {
    latest.current = { total, refetchCount: count.refetch, refetchRecent: recent.refetch };
  });
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      void (async () => {
        const { total: before, refetchCount, refetchRecent } = latest.current;
        const next = await refetchCount();
        // A changed count changes the key, and the new key is read by itself; the same count only needs the
        // states, and the block time if the last attempt to read it failed.
        if (before > 0n && (next.data === undefined || next.data === before)) await refetchRecent();
      })();
    }, REFRESH_MS); // LLR-FE-070
    return () => clearInterval(timer);
  }, []);

  const slides = recent.data;
  if (total === 0n || slides === undefined || slides.length === 0) return null;
  return <Carousel slides={slides} clock={clock} network={network} />;
}

/** The parts of the slide on screen; the other slides are in the page only to give the card its height. */
const shownParts = (card: HTMLElement | null): HTMLElement[] =>
  card === null ? [] : [...card.querySelectorAll<HTMLElement>("[data-current] [data-part]")];

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Carousel({ slides, clock, network }: { slides: Slide[]; clock: ChainClock; network: SelectedNetwork }) {
  // The slide is remembered by id, so a newer promise joining the front does not change what is on screen.
  const [shownId, setShownId] = useState<bigint>(() => (slides[0] as Slide).id);
  const found = slides.findIndex((s) => s.id === shownId);
  const index = found < 0 ? 0 : found;
  // Under reduced motion the card does not move on its own; the visitor can still start it.
  const [userPaused, setUserPaused] = useState(reducedMotion);
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
      const nextId = (slides[next] as Slide).id;
      const parts = shownParts(card.current);
      if (reducedMotion() || parts.length === 0 || typeof parts[0]?.animate !== "function") {
        comingIn.current = true;
        setShownId(nextId);
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
        setShownId(nextId);
      });
    }, CHECK_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [index, many, slides]);

  // Runs after the new slide is in the DOM and before it is painted, so it never shows a frame at rest first.
  useLayoutEffect(() => {
    if (!comingIn.current) return;
    comingIn.current = false;
    const parts = shownParts(card.current);
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

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <section
      ref={card}
      className="card home-rot"
      aria-roledescription="carousel"
      aria-label={`Recent promises on ${network.name}`}
    >
      {/* Every slide is in one grid cell, so the card is as tall as the tallest and never changes height between
          slides. The others are hidden from view, from assistive technology, and from the tab order. */}
      <div className="home-rot-stack">
        {slides.map((slide, k) => {
          const current = k === index;
          return (
            <div
              key={slide.id.toString()}
              className="home-rot-slide"
              data-current={current ? "true" : undefined}
              aria-hidden={current ? undefined : true}
              inert={!current}
            >
              <span className="home-rot-id" data-part>
                <span className="label">Promise #{slide.id.toString()}</span>
                <SlideState slide={slide} clock={clock} />
              </span>
              <SlideBody slide={slide} clock={clock} network={network} />
            </div>
          );
        })}
      </div>
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

// The small state word is the page's own name for the state, so the card and the promise page agree.
const ENDED_WORDS: Readonly<Record<Exclude<PledgeState, "Active">, { state: string; big: string }>> = {
  Expired: { state: STATE_NAMES.Expired, big: "No answer" },
  Kept: { state: STATE_NAMES.Kept, big: "Kept" },
  Broken: { state: STATE_NAMES.Broken, big: "Broken" },
  SettledToStaker: { state: STATE_NAMES.SettledToStaker, big: "Paid back" },
  SettledToBeneficiary: { state: STATE_NAMES.SettledToBeneficiary, big: "Paid out" },
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
      {/* The whole quote is the link, so the target is as large as the sentence and not a small caption. */}
      <a className="home-rot-link" href={`#/p/${slide.id.toString()}`}>
        <span className="visually-hidden">Open promise #{slide.id.toString()}: </span>
        <blockquote className="home-rot-quote" data-part>
          {`“${pledge.promiseText}”`}
        </blockquote>
      </a>
      <div className="home-rot-slot" data-part>
        {slide.state === "Active" ? <OpenClock slide={slide} clock={clock} /> : <EndedClock slide={slide} />}
      </div>
      <dl className="home-rot-facts" data-part>
        <div>
          <dt className="label">Stake</dt>
          <dd>{formatAmount(network, pledge.token, pledge.amount)}</dd>
        </div>
        <Party label={ROLE_LABELS.staker} address={pledge.staker} />
        <Party label={ROLE_LABELS.referee} address={pledge.referee} />
        <Party label={ROLE_LABELS.beneficiary} address={pledge.beneficiary} />
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
