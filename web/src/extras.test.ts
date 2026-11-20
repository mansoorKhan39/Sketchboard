import { test } from "node:test";
import assert from "node:assert/strict";
import { newTimer, startTimer, pauseTimer, resetTimer, setTimerLength, timerLeft, timerRunning, formatTime, newVote, votesOn, myVotes, newReaction, isStale, REACTION_LIFE } from "./extras.js";
import { isOverlay, withLiveParts } from "./kinds.js";
import { isObj } from "../../realtime/src/validate.js";
import { contentBounds } from "./geometry.js";
import type { BoardObject, TimerObj } from "./types";

test("timer: start, pause and reset use clock times, not ticking counters", () => {
  const t0 = 1_000_000;
  let t: TimerObj = newTimer(300);
  assert.equal(timerLeft(t, t0), 300);
  t = { ...t, ...startTimer(t, t0) };
  assert.equal(timerRunning(t, t0 + 1000), true);
  assert.equal(timerLeft(t, t0 + 60_000), 240);
  t = { ...t, ...pauseTimer(t, t0 + 60_000) };
  assert.equal(t.endsAt, null);
  assert.equal(timerLeft(t, t0 + 999_999), 240); // paused: time does not move
  t = { ...t, ...startTimer(t, t0 + 100_000) }; // resumes from 240 s
  assert.equal(timerLeft(t, t0 + 130_000), 210);
  assert.equal(timerLeft(t, t0 + 10_000_000), 0); // never negative
  assert.equal(timerRunning(t, t0 + 10_000_000), false);
  t = { ...t, ...resetTimer(t) };
  assert.equal(timerLeft(t, t0), 300);
  t = { ...t, ...setTimerLength(60) };
  assert.equal(timerLeft(t, t0), 60);
});

test("starting a finished timer starts it again from the full length", () => {
  const t: TimerObj = { ...newTimer(60), endsAt: 5000, left: 0 };
  const s = startTimer(t, 9000);
  assert.equal(s.endsAt, 9000 + 60_000);
});

test("formatTime shows minutes and seconds", () => {
  assert.equal(formatTime(300), "5:00");
  assert.equal(formatTime(65), "1:05");
  assert.equal(formatTime(0), "0:00");
});

test("votes are separate objects, counted per target and per voter", () => {
  const objs: BoardObject[] = [newVote("a", "u1"), newVote("a", "u2"), newVote("b", "u1")];
  assert.equal(votesOn(objs, "a").length, 2);
  assert.equal(myVotes(objs, "u1").length, 2);
  assert.equal(myVotes(objs, "nobody").length, 0);
});

test("reactions go stale; stale ones are swept by the next reaction", () => {
  const r = newReaction("🎉", 1, 2, 1000);
  assert.equal(isStale(r, 1000 + REACTION_LIFE), false);
  assert.equal(isStale(r, 1000 + REACTION_LIFE * 3 + 1), true);
});

test("overlay objects are not board content and the server accepts them", () => {
  const list = [newTimer(), newVote("a", "u"), newReaction("👍", 0, 0)];
  assert.ok(list.every((o) => isOverlay(o)));
  assert.equal(contentBounds(list), null);
  assert.ok(list.every((o) => isObj(o)));
});

test("undo keeps the timer and reactions that exist right now", () => {
  const sticky = { id: "s", type: "sticky", x: 0, y: 0, width: 1, height: 1, rotation: 0, text: "", color: "#fff" } as BoardObject;
  const timer = newTimer();
  const older = [sticky];
  const current = [sticky, timer, { ...sticky, id: "s2" } as BoardObject];
  const merged = withLiveParts(older, current);
  assert.deepEqual(merged.map((o) => o.id), ["s", timer.id]);
});
