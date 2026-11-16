import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOps, diffOps } from "./ops.js";
import type { BoardObject } from "../types.js";

const sticky = (id: string, over: Partial<BoardObject> = {}) =>
  ({ id, type: "sticky", x: 0, y: 0, width: 180, height: 180, rotation: 0, text: "", color: "#FFD43B", ...over }) as BoardObject;

test("diff: nothing changed -> no operations", () => {
  const a = [sticky("a")];
  assert.deepEqual(diffOps(a, a), []);
  assert.deepEqual(diffOps(a, [{ ...a[0] }]), []); // a new object with equal content is still "no change"
});

test("diff: add, change only the changed fields, remove", () => {
  const prev = [sticky("a"), sticky("b")];
  const next = [sticky("a", { x: 50, text: "hi" }), sticky("c")];
  const ops = diffOps(prev, next);
  assert.deepEqual(ops, [
    { op: "set", id: "a", fields: { x: 50, text: "hi" } },
    { op: "add", obj: sticky("c") },
    { op: "remove", id: "b" },
  ]);
});

test("apply: add, set, remove", () => {
  let b = [sticky("a")];
  b = applyOps(b, [{ op: "add", obj: sticky("b") as never }]);
  assert.deepEqual(b.map((o) => o.id), ["a", "b"]);
  b = applyOps(b, [{ op: "set", id: "a", fields: { text: "x" } }]);
  assert.equal((b[0] as { text: string }).text, "x");
  b = applyOps(b, [{ op: "remove", id: "a" }]);
  assert.deepEqual(b.map((o) => o.id), ["b"]);
});

test("apply never changes the array it was given", () => {
  const original = [sticky("a")];
  const frozen = JSON.stringify(original);
  applyOps(original, [{ op: "set", id: "a", fields: { x: 9 } }, { op: "remove", id: "a" }]);
  assert.equal(JSON.stringify(original), frozen);
});

test("apply twice = apply once (retries are safe)", () => {
  const ops = [
    { op: "add", obj: sticky("n") as never },
    { op: "set", id: "a", fields: { x: 7 } },
    { op: "remove", id: "gone" },
  ] as const;
  const once = applyOps([sticky("a"), sticky("gone")], [...ops]);
  const twice = applyOps(once, [...ops]);
  assert.deepEqual(twice.map((o) => o.id), ["a", "n"]); // "n" was not added a second time
  assert.deepEqual(twice, once.map((o) => (o.id === "gone" ? o : o)));
});

test("changing something someone else deleted is ignored", () => {
  const b = applyOps([sticky("a")], [{ op: "set", id: "ghost", fields: { x: 1 } }, { op: "remove", id: "ghost" }]);
  assert.deepEqual(b.map((o) => o.id), ["a"]);
});

test("two people changing different fields of one object both win; same field: last one wins", () => {
  const start = [sticky("a")];
  const mine = [{ op: "set", id: "a", fields: { text: "mine" } }] as const;
  const theirs = [{ op: "set", id: "a", fields: { color: "#F783AC" } }] as const;
  const server = applyOps(applyOps(start, [...theirs]), [...mine]);
  assert.equal((server[0] as any).text, "mine");
  assert.equal((server[0] as any).color, "#F783AC");
  const clash = applyOps(applyOps(start, [{ op: "set", id: "a", fields: { x: 1 } }]), [{ op: "set", id: "a", fields: { x: 2 } }]);
  assert.equal(clash[0].x, 2);
});

test("convergence: two screens applying the same edits in the same order end up identical", () => {
  const edits = [
    [{ op: "add", obj: sticky("a") as never }],
    [{ op: "add", obj: sticky("b") as never }, { op: "set", id: "a", fields: { x: 10 } }],
    [{ op: "set", id: "b", fields: { text: "hello" } }],
    [{ op: "remove", id: "a" }],
  ] as const;
  const screen1 = edits.reduce((b, e) => applyOps(b, [...e]), [] as BoardObject[]);
  // screen 2 saw the first two, then a reconnect: it rebuilt from the room's state and replays everything
  const screen2 = edits.reduce((b, e) => applyOps(b, [...e]), edits.slice(0, 2).reduce((b, e) => applyOps(b, [...e]), [] as BoardObject[]));
  assert.deepEqual(screen1, screen2);
});
