import { test } from "node:test";
import assert from "node:assert/strict";
import { sortedFrames, frameFit, insideFrame } from "./geometry.js";
import { isObj } from "./realtime/validate.js";
import type { BoardObject, FrameObj } from "./types";

const frame = (id: string, slide: number, x = 0, y = 0, width = 640, height = 360): FrameObj => ({
  id, type: "frame", x, y, width, height, rotation: 0, text: id, slide,
});
const sticky = (id: string, x: number, y: number): BoardObject => ({
  id, type: "sticky", x, y, width: 100, height: 100, rotation: 0, text: "", color: "#fff",
});

test("frames are presented by slide number, then by id", () => {
  const out = sortedFrames([sticky("s", 0, 0), frame("b", 2), frame("c", 1), frame("a", 2)]);
  assert.deepEqual(out.map((f) => f.id), ["c", "a", "b"]);
});

test("frameFit centres the frame and leaves a margin", () => {
  const v = frameFit(frame("a", 1, 100, 100, 400, 200), 1000, 500);
  assert.ok(Math.abs(v.scale - 2.25) < 1e-9); // min(1000/400, 500/200) = 2.5, times 0.9
  // the frame's centre (300, 200) must land in the middle of the screen
  assert.ok(Math.abs(300 * v.scale + v.x - 500) < 1e-6);
  assert.ok(Math.abs(200 * v.scale + v.y - 250) < 1e-6);
});

test("objects whose middle is inside a frame travel with it", () => {
  const f = frame("f", 1, 0, 0, 640, 360);
  assert.equal(insideFrame(f, sticky("in", 100, 100)), true);
  assert.equal(insideFrame(f, sticky("out", 900, 100)), false);
  assert.equal(insideFrame(f, frame("g", 2, 10, 10, 50, 50)), false);
});

test("the realtime server accepts a frame object", () => {
  const f = frame("f", 1);
  assert.equal(isObj(f), true);
});
