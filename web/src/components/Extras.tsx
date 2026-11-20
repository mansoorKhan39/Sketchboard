import { useEffect, useRef, useState } from "react";
import { useBoard } from "../store";
import { useAuth } from "../auth";
import { viewCenter } from "../image";
import {
  REACTIONS, REACTION_LIFE, TIMER_PRESETS, formatTime, isStale, myVotes, newReaction, newTimer, pauseTimer,
  resetTimer, setTimerLength, startTimer, isPrivate, togglePrivate, timerLeft, timerRunning, voterId, MAX_VOTES,
} from "../extras";
import type { Placeable, ReactionObj, TimerObj, VoteObj } from "../types";

// A clock that ticks only while `active`, so an idle board does no work.
function useNow(active: boolean, every = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [active, every]);
  return now;
}

// ---- vote counts: a small pill on the top-right corner of every object that has votes ----
export function VoteLayer() {
  const objects = useBoard((s) => s.objects);
  const vp = useBoard((s) => s.viewport);
  const userId = useAuth((s) => s.user?.id);
  const me = voterId(userId);
  const counts = new Map<string, { n: number; mine: number }>();
  for (const o of objects) {
    if (o.type !== "vote") continue;
    const c = counts.get(o.targetId) ?? { n: 0, mine: 0 };
    c.n++;
    if (o.voter === me) c.mine++;
    counts.set(o.targetId, c);
  }
  if (!counts.size) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {objects.map((t) => {
        const c = counts.get(t.id);
        if (!c) return null;
        const p = t as Placeable;
        return (
          <span
            key={t.id}
            data-testid="vote-badge"
            data-votes={c.n}
            className={`absolute flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1.5 text-xs font-semibold shadow-float ${
              c.mine ? "bg-brand text-white" : "bg-surface text-ink ring-1 ring-line"
            }`}
            style={{ left: (p.x + p.width) * vp.scale + vp.x, top: p.y * vp.scale + vp.y, transform: "translate(-60%, -50%)" }}
          >
            ▲ {c.n}
          </span>
        );
      })}
    </div>
  );
}

// ---- floating emojis ----
export function ReactionLayer() {
  const objects = useBoard((s) => s.objects);
  const vp = useBoard((s) => s.viewport);
  const all = objects.filter((o): o is ReactionObj => o.type === "reaction");
  const now = useNow(all.length > 0, 400);
  const fresh = all.filter((r) => now - r.at < REACTION_LIFE && r.at - now < 60_000);
  if (!fresh.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {fresh.map((r) => (
        <span
          key={r.id}
          data-testid="reaction"
          className="reaction-float absolute text-4xl"
          style={{ left: r.x * vp.scale + vp.x, top: r.y * vp.scale + vp.y }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

// ---- bottom-centre bar: reactions + timer button ----
export function ExtrasBar() {
  const canEdit = useBoard((s) => s.role !== "viewer");
  const hasTimer = useBoard((s) => s.objects.some((o) => o.type === "timer"));
  const privateOn = useBoard((s) => isPrivate(s.objects));
  const last = useRef(0);
  if (!canEdit) return null;

  const react = (emoji: string) => {
    const t = Date.now();
    if (t - last.current < 400) return; // keeps the live connection calm
    last.current = t;
    const c = viewCenter();
    const jitter = () => (Math.random() - 0.5) * 240;
    useBoard.getState().liveEdit((objs) => [
      ...objs.filter((o) => !(o.type === "reaction" && isStale(o, t))), // sweep old ones
      newReaction(emoji, c.x + jitter(), c.y + 80 + Math.abs(jitter()) / 2, t),
    ]);
    // the sender's own copy is removed after it has floated away
    setTimeout(() => useBoard.getState().liveEdit((objs) => objs.filter((o) => !(o.type === "reaction" && o.at === t))), REACTION_LIFE + 500);
  };
  const toggleTimer = () =>
    useBoard.getState().liveEdit((objs) => (objs.some((o) => o.type === "timer") ? objs.filter((o) => o.type !== "timer") : [...objs, newTimer()]));

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-float">
      {REACTIONS.map((e) => (
        <button key={e} data-testid="react" aria-label={`React ${e}`} onClick={() => react(e)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:scale-125 hover:bg-sunken">
          {e}
        </button>
      ))}
      <div className="mx-1 h-6 w-px bg-line" />
      <button
        data-testid="timer-toggle"
        aria-pressed={hasTimer}
        onClick={toggleTimer}
        className={`h-8 rounded-lg px-2.5 text-xs font-medium transition ${hasTimer ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"}`}
      >
        Timer
      </button>
      <button
        data-testid="private-toggle"
        aria-pressed={privateOn}
        title="Hide other people's sticky notes on your screen until you switch this off. Not a security feature: it only changes what is shown."
        onClick={() => useBoard.getState().liveEdit(togglePrivate)}
        className={`h-8 rounded-lg px-2.5 text-xs font-medium transition ${privateOn ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"}`}
      >
        Private
      </button>
    </div>
  );
}

// ---- the timer ----
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0.15;
    osc.frequency.value = 880;
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    /* no sound is fine */
  }
}

export function TimerBar() {
  const timer = useBoard((s) => s.objects.find((o): o is TimerObj => o.type === "timer"));
  const canEdit = useBoard((s) => s.role !== "viewer");
  const running = !!timer && timer.endsAt !== null;
  const now = useNow(running, 250);
  const rang = useRef<number | null>(null);
  const left = timer ? timerLeft(timer, now) : 0;
  const live = timer ? timerRunning(timer, now) : false;
  const finished = !!timer && timer.endsAt !== null && !live;

  useEffect(() => {
    if (finished && timer && rang.current !== timer.endsAt) {
      rang.current = timer.endsAt;
      beep();
    }
  }, [finished, timer]);

  if (!timer) return null;
  const edit = (patch: Partial<TimerObj>) => useBoard.getState().liveEdit((objs) => objs.map((o) => (o.id === timer.id ? ({ ...o, ...patch } as TimerObj) : o)));
  const btn = "h-8 rounded-lg px-2.5 text-xs font-medium hover:bg-sunken disabled:opacity-40";

  return (
    <div
      data-testid="timer"
      className={`absolute bottom-[4.5rem] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-surface px-3 py-1.5 shadow-float ${finished ? "border-red-500" : "border-line"}`}
    >
      <span data-testid="timer-time" className={`min-w-14 text-center font-mono text-xl font-semibold tabular-nums ${finished ? "text-red-500" : ""}`}>
        {finished ? "Time's up" : formatTime(left)}
      </span>
      {canEdit && (
        <>
          {live ? (
            <button className={btn} data-testid="timer-pause" onClick={() => edit(pauseTimer(timer, Date.now()))}>Pause</button>
          ) : (
            <button className={`${btn} bg-brand text-white hover:bg-brand-strong`} data-testid="timer-start" onClick={() => edit(startTimer(timer, Date.now()))}>Start</button>
          )}
          <button className={btn} data-testid="timer-reset" onClick={() => edit(resetTimer(timer))}>Reset</button>
          <select
            aria-label="Timer length"
            data-testid="timer-length"
            value={timer.seconds}
            onChange={(e) => edit(setTimerLength(Number(e.target.value)))}
            className="h-8 rounded-lg border border-line bg-canvas px-1 text-xs"
          >
            {[...new Set([...TIMER_PRESETS, timer.seconds])].sort((a, b) => a - b).map((s) => (
              <option key={s} value={s}>{s / 60} min</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

// ---- panel part: "Vote" / "Remove vote" for the selection ----
export function VoteButtons({ ids }: { ids: string[] }) {
  const objects = useBoard((s) => s.objects);
  const userId = useAuth((s) => s.user?.id);
  const me = voterId(userId);
  const used = myVotes(objects, me).length;
  const mineOnSelection = objects.some((o): o is VoteObj => o.type === "vote" && o.voter === me && ids.includes(o.targetId));
  return (
    <div className="flex items-center gap-1.5">
      <button
        data-testid="vote"
        disabled={used >= MAX_VOTES}
        onClick={() => useBoard.getState().castVotes(ids, me)}
        className="rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-40"
      >
        Vote
      </button>
      {mineOnSelection && (
        <button data-testid="unvote" onClick={() => useBoard.getState().withdrawVotes(ids, me)} className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-sunken hover:text-ink">
          Remove
        </button>
      )}
      <span data-testid="votes-left" className="text-xs text-muted">{MAX_VOTES - used} left</span>
    </div>
  );
}
