import { test } from "node:test";
import assert from "node:assert/strict";
import { fitInside, contentBounds } from "./geometry.js";
import { diffOps, applyOps } from "./realtime/ops.js";
import { checkOps, isObj, MAX_IMAGE_BYTES } from "./realtime/validate.js";
import type { BoardObject } from "./types";

const pic = (id: string, src = "data:image/webp;base64,AAAA"): BoardObject =>
  ({ id, type: "image", x: 10, y: 20, width: 200, height: 100, rotation: 0, src, name: "a.png" }) as BoardObject;

test("fitInside shrinks a big picture, keeps its shape, and never enlarges", () => {
  assert.deepEqual(fitInside(1600, 800, 800), { w: 800, h: 400 });
  assert.deepEqual(fitInside(600, 1200, 800), { w: 400, h: 800 });
  assert.deepEqual(fitInside(300, 200, 800), { w: 300, h: 200 });
  assert.deepEqual(fitInside(1, 5000, 800), { w: 1, h: 800 });
});

test("contentBounds covers every object plus padding, and ignores connectors", () => {
  assert.equal(contentBounds([]), null);
  assert.equal(contentBounds([{ type: "connector", x: 0, y: 0, width: 0, height: 0 }]), null);
  const box = contentBounds(
    [
      { type: "sticky", x: 100, y: 100, width: 180, height: 180 },
      { type: "image", x: 400, y: 50, width: 200, height: 100 },
      { type: "connector", x: 0, y: 0, width: 0, height: 0 },
    ],
    10,
  );
  assert.deepEqual(box, { x: 90, y: 40, width: 520, height: 250 });
});

test("a picture travels as an ordinary object: add, move, remove", () => {
  const start: BoardObject[] = [];
  const withPic = [pic("p1")];
  const ops = diffOps(start, withPic);
  assert.equal(ops[0].op, "add");
  const moved = [{ ...withPic[0], x: 50 } as BoardObject];
  const move = diffOps(withPic, moved);
  assert.deepEqual(move, [{ op: "set", id: "p1", fields: { x: 50 } }]); // the big src is not sent again
  assert.deepEqual(applyOps(applyOps(start, ops), move)[0], moved[0]);
  assert.deepEqual(applyOps(moved, [{ op: "remove", id: "p1" }]), []);
});

test("the room accepts a picture up to its size limit and refuses a bigger one", () => {
  const small = pic("p1");
  assert.ok(isObj(small));
  const big = pic("p2", "data:image/webp;base64," + "A".repeat(MAX_IMAGE_BYTES));
  assert.equal(isObj(big), false);
  assert.equal(checkOps([{ op: "add", obj: small }], () => false, 0), null);
  assert.match(checkOps([{ op: "add", obj: big }], () => false, 0) ?? "", /Bad object/);
  // other object types keep the smaller 64,000 limit
  const hugeSticky = { id: "s", type: "sticky", x: 0, y: 0, width: 1, height: 1, rotation: 0, text: "x".repeat(70_000) };
  assert.equal(isObj(hugeSticky), false);
});
