import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import type { PledgeState } from "../chain/reads";
import { NOT_SYNCED, formatRemaining } from "../views/pledge/countdown";
import { ExampleBadge } from "./ExampleBadge";
import { type Scenario, DEADLINE, MAX, VERDICT_DAY, demoState, liveStage, liveTime } from "./clockState";
import { clamp, ease, prefersReducedMotion } from "./motion";

export type ClockProps =
  | { mode: "demo" }
  | {
      mode: "live";
      /** Block timestamps in seconds. */
      createdAt: bigint;
      deadline: bigint;
      /** Chain time, or null until it is known. */
      now: bigint | null;
      state: PledgeState;
      /** Chain time has passed the deadline but the state read still says Active, so the outcome is not yet known. */
      checking?: boolean;
      /** The stake as a reader would say it. */
      amountLabel: string;
      /** The parties as they should be shown, shortened or not. Left out, the diagram names no address. */
      staker?: string;
      referee?: string;
      beneficiary?: string;
    };

const SPOTS = { stk: [90, 170], vault: [330, 170], ben: [570, 170] } as const;
const pct = (x: number) => `${+((x / MAX) * 100).toFixed(3)}%`;

const SCENARIOS: readonly (readonly [Scenario, string])[] = [
  ["kept", "Says Kept on day 4"],
  ["broken", "Says Broken on day 4"],
  ["silent", "Says nothing"],
];

const DEMO_PARTIES = { staker: "0xd172…809f", referee: "0x8a3e…11c0", beneficiary: "0x4f2b…a9d1" };

interface View {
  t: number;
  heading: string;
  tone: "" | "g" | "r";
  text: string;
  chainKeys: string[];
  current: string;
  dayLabel: string;
  stake: readonly [number, number];
  /** The payout drawn, 0 to 1, along the edge to where the stake went. */
  flow: number;
  flowTo: "staker" | "beneficiary" | null;
  bubble: { text: string; colour: string } | null;
  refereeSilenced: boolean;
  stakeMark: string;
  parties: { staker?: string; referee?: string; beneficiary?: string };
  marks: { at: number; label: string; colour: string }[];
}

function demoView(scenario: Scenario, t: number): View {
  const st = demoState(scenario, t);
  const toStaker = scenario === "kept";
  let stake: readonly [number, number];
  if (t < 0.6) {
    const k = ease(t / 0.6);
    stake = [SPOTS.stk[0] + (SPOTS.vault[0] - SPOTS.stk[0]) * k, 170 - Math.sin(k * Math.PI) * 30];
  } else if (t < st.pay) stake = SPOTS.vault;
  else {
    const k = ease(clamp((t - st.pay) / 0.6));
    const dst = toStaker ? SPOTS.stk : SPOTS.ben;
    stake = [SPOTS.vault[0] + (dst[0] - SPOTS.vault[0]) * k, 170 - Math.sin(k * Math.PI) * 30];
  }
  const verdictShown = (scenario !== "silent" && t >= VERDICT_DAY) || (scenario === "silent" && t >= DEADLINE);
  const bubble = scenario === "kept" ? ["Kept", "var(--kept)"] : scenario === "broken" ? ["Broken", "var(--broken)"] : ["No answer", "var(--sub)"];
  const names = { open: "Open", kept: "Kept", broken: "Broken", noanswer: "No answer", paidback: "Paid back", paidout: "Paid out" };
  const ending = scenario === "kept" ? "kept" : scenario === "broken" ? "broken" : "noanswer";
  const chainKeys = ["open", ending, scenario === "kept" ? "paidback" : "paidout"] as const;
  return {
    t,
    heading: st.h,
    tone: st.c,
    text: st.d,
    chainKeys: chainKeys.map((k) => names[k]),
    current: st.k === "locking" ? "" : names[st.k],
    dayLabel: t < DEADLINE ? `Day ${t.toFixed(1)} · deadline in ${(DEADLINE - t).toFixed(1)} days` : `Day ${t.toFixed(1)} · deadline passed`,
    stake,
    flow: t >= st.pay ? ease(clamp((t - st.pay) / 0.6)) : 0,
    flowTo: t >= st.pay ? (toStaker ? "staker" : "beneficiary") : null,
    bubble: verdictShown ? { text: bubble[0] as string, colour: bubble[1] as string } : null,
    refereeSilenced: scenario === "silent" && t >= DEADLINE,
    stakeMark: "1,000",
    parties: DEMO_PARTIES,
    marks: [
      { at: DEADLINE, label: "deadline", colour: "var(--broken)" },
      ...(scenario !== "silent" ? [{ at: VERDICT_DAY, label: "verdict", colour: "var(--ink)" }] : []),
      { at: st.pay, label: "payout", colour: "var(--sat-text)" },
    ],
  };
}

function liveView(p: Extract<ClockProps, { mode: "live" }>): View {
  const stage = liveStage(p.state, p.checking);
  const t = liveTime(p.createdAt, p.deadline, p.now) ?? 0;
  // A countdown is shown only while a deadline still decides something. After a verdict or a payout it would
  // count towards nothing, and "2 days left" beside Kept reads as something still pending. An Expired state
  // already says the deadline passed, whatever the clock has read so far.
  let dayLabel = "";
  if (p.state === "Expired") dayLabel = formatRemaining(0n);
  else if (p.state === "Active") {
    dayLabel = NOT_SYNCED;
    if (p.now !== null) dayLabel = p.deadline > p.now ? `Deadline in ${formatRemaining(p.deadline - p.now)}` : formatRemaining(0n);
  }
  const settled = stage.stake !== "vault";
  const colour = stage.bubble === "Kept" ? "var(--kept)" : stage.bubble === "Broken" ? "var(--broken)" : "var(--sub)";
  return {
    t,
    heading: stage.heading,
    tone: stage.tone,
    text: stage.text,
    chainKeys: stage.chain,
    current: stage.chain[stage.chain.length - 1] as string,
    dayLabel,
    stake: stage.stake === "vault" ? SPOTS.vault : stage.stake === "staker" ? SPOTS.stk : SPOTS.ben,
    flow: settled ? 1 : 0,
    flowTo: settled ? (stage.stake as "staker" | "beneficiary") : null,
    bubble: stage.bubble === null ? null : { text: stage.bubble, colour },
    refereeSilenced: p.state !== "Active",
    stakeMark: "",
    parties: { staker: p.staker, referee: p.referee, beneficiary: p.beneficiary },
    // Only the deadline is known; when a verdict or payout happened is not on the contract, so none is marked.
    marks: [{ at: DEADLINE, label: "deadline", colour: "var(--broken)" }],
  };
}

/**
 * The money's path through a promise: a diagram, the state in words, and a timeline. In `demo` mode it is the
 * design's example week, with referee scenarios and a draggable time, and says so. In `live` mode it shows one
 * real pledge by its derived state and chain time, offers no scenarios and no scrubbing, and marks only the
 * deadline, since the contract records no verdict or payout time.
 *
 * @trace LLR-FE-040 LLR-FE-012
 */
export function Clock(props: ClockProps) {
  const demo = props.mode === "demo";
  const [scenario, setScenario] = useState<Scenario>("kept");
  const [demoT, setDemoT] = useState(2.2);
  const [playing, setPlaying] = useState(false);
  const section = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const played = useRef(false);
  const raf = useRef(0);

  const play = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setPlaying(true);
    setDemoT(0);
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const k = clamp((now - start) / 7000);
      setDemoT(MAX * k);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  // The week plays once when the section scrolls into view, unless the visitor asked for less motion.
  useEffect(() => {
    const el = section.current;
    if (!demo || !el || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting && !played.current && !prefersReducedMotion()) {
          played.current = true;
          play();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [demo, play]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const view = props.mode === "demo" ? demoView(scenario, demoT) : liveView(props);
  const fromX = (x: number) => {
    const r = (track.current as HTMLDivElement).getBoundingClientRect();
    return clamp((x - r.left) / (r.width || 1)) * MAX;
  };
  const down = (e: PointerEvent) => {
    cancelAnimationFrame(raf.current);
    setPlaying(false);
    track.current?.setPointerCapture?.(e.pointerId);
    dragging.current = true;
    setDemoT(fromX(e.clientX));
  };
  const move = (e: PointerEvent) => {
    if (dragging.current) setDemoT(fromX(e.clientX));
  };
  const up = () => {
    dragging.current = false;
  };
  const key = (e: KeyboardEvent) => {
    const step = ({ ArrowRight: 0.25, ArrowLeft: -0.25, PageUp: 1, PageDown: -1 } as Record<string, number>)[e.key];
    if (step !== undefined) {
      e.preventDefault();
      setDemoT((x) => clamp(x + step, 0, MAX));
    }
    if (e.key === "Home") setDemoT(0);
    if (e.key === "End") setDemoT(MAX);
  };

  const { t, parties } = view;
  const flowPath = view.flowTo === "staker" ? "M300 170 Q210 120 110 170" : "M360 170 Q450 120 550 170";
  return (
    <div className="clock-card" ref={section}>
        <div className="clock-top">
          {demo ? (
            <>
              <span className="label">Referee</span>
              <ExampleBadge />
              <div className="scen" role="group" aria-label="What the referee does">
                {SCENARIOS.map(([k, label]) => (
                  <button key={k} type="button" className="scenbtn" aria-pressed={scenario === k} onClick={() => setScenario(k)}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span className="label">Where the money is</span>
          )}
        </div>
        <div className="clock-body">
          <div className="dia">
            <svg viewBox="0 0 660 244" role="img" aria-label={"Diagram: " + view.heading}>
              <path className="edge" d="M110 170 L300 170" />
              <path className="edge" d="M360 170 L550 170" />
              <path className="edge" d="M330 70 L330 142" />
              {view.flowTo && (
                <path
                  className="flow"
                  d={flowPath}
                  stroke={view.flowTo === "staker" ? "var(--kept)" : "var(--broken)"}
                  pathLength="1"
                  strokeDasharray="1"
                  strokeDashoffset={1 - view.flow}
                />
              )}
              <g className="node">
                <circle cx="90" cy="170" r="20" />
                <text x="90" y="216">Staker</text>
                {parties.staker && <text className="a" x="90" y="234">{parties.staker}</text>}
              </g>
              <g className="node">
                <circle cx="570" cy="170" r="20" />
                <text x="570" y="216">Beneficiary</text>
                {parties.beneficiary && <text className="a" x="570" y="234">{parties.beneficiary}</text>}
              </g>
              <g className="node">
                <circle cx="330" cy="44" r="18" style={{ opacity: view.refereeSilenced ? 0.4 : 1 }} />
                <text x="360" y="42" style={{ textAnchor: "start" }}>Referee</text>
                {(view.refereeSilenced || parties.referee) && (
                  <text className="a" x="360" y="60" style={{ textAnchor: "start" }}>
                    {view.refereeSilenced ? "can’t vote now" : parties.referee}
                  </text>
                )}
              </g>
              <g className="vault">
                <rect x="300" y="142" width="60" height="56" rx="12" />
                <text x="330" y="222" style={{ fill: "var(--sub)", fontFamily: "var(--mono)", fontSize: "10.5px", textAnchor: "middle" }}>contract</text>
              </g>
              {view.bubble && (
                <g className="bubble">
                  <rect x={330 - 48} y="72" width="96" height="28" rx="14" style={{ fill: view.bubble.colour }} />
                  <text x="330" y="91" style={{ fill: "var(--on-state)" }}>{view.bubble.text}</text>
                </g>
              )}
              <g className="stake" transform={`translate(${view.stake[0]},${view.stake[1]})`}>
                <circle r="17" />
                {view.stakeMark && <text y="3.5">{view.stakeMark}</text>}
              </g>
            </svg>
          </div>
          <div className="state">
            {/* The line changes every second in live mode and as the knob moves in the example, so it stays out of the announced region. */}
            {view.dayLabel !== "" && <div className="day">{view.dayLabel}</div>}
            {/* In live mode the page's own status line does the announcing. */}
            <div aria-live={demo ? "polite" : undefined}>
              <h3 className={view.tone}>{view.heading}</h3>
              <p>{view.text}</p>
              {!demo && <p className="stake-line">{props.amountLabel}</p>}
              <div className="chain">
                {view.chainKeys.map((k) => (
                  <span key={k} className={k === view.current ? "on" : ""}>{k}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={"track-wrap" + (demo ? "" : " static")}>
          {demo && (
            <button type="button" className="play" onClick={play} aria-label="Play the week">
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <rect x="2" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
                  <rect x="8.5" y="1" width="3.5" height="12" rx="1" fill="currentColor" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 1.5v11l9.5-5.5z" fill="currentColor" />
                </svg>
              )}
            </button>
          )}
          <div
            className="track"
            ref={track}
            {...(demo
              ? {
                  tabIndex: 0,
                  role: "slider",
                  "aria-label": "Time",
                  "aria-valuemin": 0,
                  "aria-valuemax": MAX,
                  "aria-valuenow": Number(t.toFixed(1)),
                  "aria-valuetext": view.dayLabel,
                  onPointerDown: down,
                  onPointerMove: move,
                  onPointerUp: up,
                  onPointerCancel: up,
                  onKeyDown: key,
                }
              : { role: "img", "aria-label": view.dayLabel === "" ? "Timeline" : "Timeline: " + view.dayLabel })}
          >
            <div className="rail" />
            <div className="fill" style={{ width: pct(t) }} />
            {demo ? (
              [0, 2, 4, 6, 8, 10].map((d) => (
                <span key={d} className="tick" style={{ left: pct(d), transform: d === 0 ? "none" : d === 10 ? "translateX(-100%)" : undefined }}>
                  day {d}
                </span>
              ))
            ) : (
              <span className="tick" style={{ left: "0%", transform: "none" }}>created</span>
            )}
            {view.marks.map((m) => (
              <span key={m.label} className="mk" style={{ left: pct(m.at), borderColor: m.colour }}>
                <span style={{ color: m.colour }}>{m.label}</span>
              </span>
            ))}
            <span className="knob" style={{ left: pct(t) }} />
          </div>
        </div>
    </div>
  );
}
