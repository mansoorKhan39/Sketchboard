import { nanoid } from "nanoid";
import type { BoardObject, ReactionObj, TimerObj, VoteObj } from "./types";

export const MAX_VOTES = 5; // votes one person can give on a board
export const REACTIONS = ["👍", "❤️", "🎉", "😂", "👀"];
export const REACTION_LIFE = 3500; // ms a reaction floats on screen
export const TIMER_PRESETS = [60, 180, 300, 600]; // seconds

// ---- timer ----
export const timerLeft = (t: Pick<TimerObj, "endsAt" | "left">, now: number): number =>
  t.endsAt === null ? t.left : Math.max(0, Math.ceil((t.endsAt - now) / 1000));
export const timerRunning = (t: Pick<TimerObj, "endsAt" | "left">, now: number) => t.endsAt !== null && now < t.endsAt;
export const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export const newTimer = (seconds = 300): TimerObj => ({
  id: nanoid(10), type: "timer", x: 0, y: 0, width: 0, height: 0, rotation: 0, seconds, endsAt: null, left: seconds,
});
export const startTimer = (t: TimerObj, now: number): Partial<TimerObj> => {
  const left = t.endsAt === null ? t.left : timerLeft(t, now);
  return { endsAt: now + (left > 0 ? left : t.seconds) * 1000, left: left > 0 ? left : t.seconds };
};
export const pauseTimer = (t: TimerObj, now: number): Partial<TimerObj> => ({ endsAt: null, left: timerLeft(t, now) });
export const resetTimer = (t: TimerObj): Partial<TimerObj> => ({ endsAt: null, left: t.seconds });
export const setTimerLength = (seconds: number): Partial<TimerObj> => ({ seconds, endsAt: null, left: seconds });

// ---- votes ----
export const votesOn = (objects: BoardObject[], targetId: string) =>
  objects.filter((o): o is VoteObj => o.type === "vote" && o.targetId === targetId);
export const myVotes = (objects: BoardObject[], voter: string) =>
  objects.filter((o): o is VoteObj => o.type === "vote" && o.voter === voter);
export const newVote = (targetId: string, voter: string): VoteObj => ({
  id: nanoid(10), type: "vote", x: 0, y: 0, width: 0, height: 0, rotation: 0, targetId, voter,
});

// ---- reactions ----
export const newReaction = (emoji: string, x: number, y: number, at = Date.now()): ReactionObj => ({
  id: nanoid(10), type: "reaction", x, y, width: 0, height: 0, rotation: 0, emoji, at,
});
// Reactions are short-lived: anything older than this is not shown and is swept away by the next person who reacts.
export const isStale = (r: ReactionObj, now: number) => now - r.at > REACTION_LIFE * 3;

// Who is voting? A signed-in person by account; a guest by an id kept in this browser.
export function voterId(userId?: string | null): string {
  if (userId) return userId;
  try {
    let g = localStorage.getItem("sketchboard.guestId");
    if (!g) {
      g = "g_" + nanoid(8);
      localStorage.setItem("sketchboard.guestId", g);
    }
    return g;
  } catch {
    return "g_session";
  }
}

// ---- private mode ----
export const isPrivate = (objects: BoardObject[]) => objects.some((o) => o.type === "settings" && o.private);
export const togglePrivate = (objects: BoardObject[]): BoardObject[] =>
  objects.some((o) => o.type === "settings")
    ? objects.map((o) => (o.type === "settings" ? { ...o, private: !o.private } : o))
    : [...objects, { id: nanoid(10), type: "settings", x: 0, y: 0, width: 0, height: 0, rotation: 0, private: true } as BoardObject];
// A note made by somebody else is hidden while private mode is on. Notes with no author (templates, old boards) stay visible.
export const isHiddenFrom = (note: { by?: string }, me: string, privateOn: boolean) => privateOn && !!note.by && note.by !== me;
