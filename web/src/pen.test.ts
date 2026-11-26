import { test } from "node:test";
import assert from "node:assert/strict";
import { strokeHit, strokeParams, strokesTouched, straight, thin, validDraftChunk, DEFAULT_PEN } from "./pen";
import type { Stroke } from "./types";

const stroke = (over: Partial<Stroke> = {}): Stroke => ({ id: "s", type: "stroke", x: 100, y: 100, width: 100, height: 0, rotation: 0, points: [0, 0, 100, 0], color: "#000000", lineWidth: 4, ...over });

test("highlighter is wide and see-through, pen is not", () => {
  assert.deepEqual(strokeParams(DEFAULT_PEN), { lineWidth: 4, alpha: 1 });
  const h = strokeParams({ ...DEFAULT_PEN, mode: "highlighter", width: 8 });
  assert.equal(h.lineWidth, 32);
  assert.equal(h.alpha, 0.4);
  assert.equal(strokeParams({ ...DEFAULT_PEN, mode: "highlighter", width: 2 }).lineWidth, 14); // never thinner than 14
});

test("thin keeps the ends and drops crowded points; straight makes a line", () => {
  const pts = [0, 0, 0.5, 0, 1, 0, 5, 0, 5.2, 0, 10, 0];
  assert.deepEqual(thin(pts, 2), [0, 0, 5, 0, 10, 0]);
  assert.deepEqual(thin([1, 1, 2, 2], 5), [1, 1, 2, 2]);
  assert.deepEqual(straight([0, 0, 3, 4, 9, 9]), [0, 0, 9, 9]);
});

test("eraser hit test: near the line yes, far no, moved and rotated strokes too", () => {
  const s = stroke();
  assert.ok(strokeHit(s, 150, 105, 5)); // 5 away from a 4 wide line, radius 5
  assert.ok(!strokeHit(s, 150, 120, 5));
  assert.ok(!strokeHit(s, 250, 100, 5)); // beyond the end
  // turned 90 degrees clockwise around its top-left corner: the line now goes down from (100,100)
  const r = stroke({ rotation: 90 });
  assert.ok(strokeHit(r, 100, 150, 3));
  assert.ok(!strokeHit(r, 150, 100, 3));
  assert.ok(strokeHit(stroke({ points: [0, 0] }), 100, 100, 1)); // a dot
});

test("one pass of the eraser removes only the strokes it touched", () => {
  const a = stroke({ id: "a" });
  const b = stroke({ id: "b", y: 300 });
  assert.deepEqual(strokesTouched([a, b], [120, 100, 130, 101], 6), ["a"]);
  assert.deepEqual(strokesTouched([a, b], [120, 100, 120, 300], 6).sort(), ["a", "b"]);
  assert.deepEqual(strokesTouched([a, b], [], 6), []);
});

test("live drawing pieces from other people are checked", () => {
  assert.ok(validDraftChunk({ id: "x", p: [1, 2, 3, 4], c: "#E03131", w: 4, a: 1 }));
  assert.ok(validDraftChunk({ id: "x", p: [], done: true }));
  assert.ok(!validDraftChunk({ id: "x", p: [1, 2, 3] })); // odd number of values
  assert.ok(!validDraftChunk({ id: "x", p: [1, NaN] }));
  assert.ok(!validDraftChunk({ id: "x", p: [1, 2], c: "red" }));
  assert.ok(!validDraftChunk({ id: "x", p: [1, 2], w: 5000 }));
  assert.ok(!validDraftChunk({ id: "", p: [] }));
  assert.ok(!validDraftChunk({ id: "x", p: Array.from({ length: 402 }, () => 1) }));
});
