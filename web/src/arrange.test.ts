import { test } from "node:test";
import assert from "node:assert/strict";
import { alignPatches, distributePatches, expandGroups, layerPatches, nextZ, sortByZ } from "./arrange";
import { snapBox } from "./snapping";
import { curvePath, polygonPoints, SHAPE_KINDS } from "./shapes";
import type { BoardObject } from "./types";

const box = (id: string, x: number, y: number, w = 100, h = 100, extra: Partial<BoardObject> = {}) =>
  ({ id, type: "sticky", x, y, width: w, height: h, rotation: 0, text: "", color: "#fff", ...extra }) as BoardObject;

test("align left / right / centre", () => {
  const items = [box("a", 0, 0, 50), box("b", 100, 40, 100), box("c", 300, 80, 20)];
  assert.deepEqual(alignPatches(items, "left"), { a: { x: 0 }, b: { x: 0 }, c: { x: 0 } });
  assert.deepEqual(alignPatches(items, "right"), { a: { x: 270 }, b: { x: 220 }, c: { x: 300 } });
  assert.equal((alignPatches(items, "hcenter").b as { x: number }).x, 110);
  assert.deepEqual(alignPatches([items[0]], "left"), {}); // one object: nothing to align to
});

test("align top / bottom / middle", () => {
  const items = [box("a", 0, 0, 100, 50), box("b", 0, 200, 100, 100)];
  assert.deepEqual(alignPatches(items, "top"), { a: { y: 0 }, b: { y: 0 } });
  assert.deepEqual(alignPatches(items, "bottom"), { a: { y: 250 }, b: { y: 200 } });
  assert.deepEqual(alignPatches(items, "vcenter"), { a: { y: 125 }, b: { y: 100 } });
});

test("distribute makes equal gaps and keeps the outer two", () => {
  const items = [box("a", 0, 0, 100), box("b", 120, 0, 100), box("c", 500, 0, 100)];
  const p = distributePatches(items, "h");
  assert.deepEqual(p, { a: { x: 0 }, b: { x: 250 }, c: { x: 500 } });
  assert.deepEqual(distributePatches(items.slice(0, 2), "h"), {});
});

test("selecting one member selects the whole group", () => {
  const list = [box("a", 0, 0, 10, 10, { group: "g1" }), box("b", 0, 0, 10, 10, { group: "g1" }), box("c", 0, 0, 10, 10, { group: "" })];
  assert.deepEqual(expandGroups(list, ["a"]).sort(), ["a", "b"]);
  assert.deepEqual(expandGroups(list, ["c"]), ["c"]); // "" is not a group
});

test("snapping to another object's edge and centre", () => {
  const other = { x: 200, y: 0, width: 100, height: 100 };
  const near = snapBox({ x: 96, y: 3, width: 100, height: 100 }, [other], 6);
  assert.equal(near.dx, 4); // right edge 196 -> 200 (left edge of other)
  assert.equal(near.dy, -3); // top 3 -> 0
  assert.ok(near.guides.some((g) => g.axis === "x" && g.pos === 200));
  assert.ok(near.guides.some((g) => g.axis === "y" && g.pos === 0));
  const far = snapBox({ x: 50, y: 50, width: 100, height: 100 }, [{ x: 600, y: 600, width: 10, height: 10 }], 6);
  assert.deepEqual([far.dx, far.dy, far.guides.length], [0, 0, 0]);
});

test("grid snapping only when nothing is close", () => {
  const g = snapBox({ x: 43, y: 58, width: 10, height: 10 }, [], 6, 20);
  assert.deepEqual([g.dx, g.dy], [-3, 2]);
  const withNeighbour = snapBox({ x: 43, y: 58, width: 10, height: 10 }, [{ x: 44, y: 0, width: 10, height: 10 }], 6, 20);
  assert.equal(withNeighbour.dx, 1); // lines up with the neighbour instead of the grid
});

test("layer order: front, back, one step", () => {
  const list = [box("a", 0, 0), box("b", 10, 10), box("c", 20, 20), box("far", 900, 900)];
  const front = layerPatches(list, ["a"], "front");
  assert.ok((front.a.z as number) > 0);
  const after = list.map((o) => ({ ...o, ...front[o.id] }) as BoardObject);
  assert.equal(sortByZ(after).at(-1)!.id, "a");
  const back = layerPatches(after, ["c"], "back");
  assert.ok((back.c.z as number) < 0);
  assert.equal(sortByZ(after.map((o) => ({ ...o, ...back[o.id] }) as BoardObject))[0].id, "c");
});

test("forward / backward move one step among objects that overlap", () => {
  let list = [box("a", 0, 0), box("b", 10, 10), box("c", 20, 20), box("far", 900, 900)];
  const apply = (p: Record<string, Partial<BoardObject>>) => (list = list.map((o) => ({ ...o, ...p[o.id] }) as BoardObject));
  apply(layerPatches(list, ["a"], "forward"));
  assert.deepEqual(sortByZ(list).filter((o) => o.id !== "far").map((o) => o.id), ["b", "a", "c"]);
  apply(layerPatches(list, ["a"], "backward"));
  assert.deepEqual(sortByZ(list).filter((o) => o.id !== "far").map((o) => o.id), ["a", "b", "c"]);
  assert.deepEqual(layerPatches(list, ["c"], "forward"), {}); // already on top
  assert.deepEqual(layerPatches(list, ["a"], "backward"), {}); // already at the bottom
});

test("new objects land on top once layers are used", () => {
  assert.equal(nextZ([box("a", 0, 0)]), undefined);
  assert.equal(nextZ([box("a", 0, 0, 1, 1, { z: 4 })]), 5);
});

test("every shape has a drawing", () => {
  for (const { kind } of SHAPE_KINDS) {
    if (kind === "rect" || kind === "ellipse") continue;
    assert.ok(polygonPoints(kind, 100, 80) || curvePath(kind), kind);
  }
  assert.equal(polygonPoints("star", 100, 100)!.length, 20);
});

import { applyOps, diffOps } from "./realtime/ops";
import { checkOps } from "./realtime/validate";

test("layer, lock and group changes travel as ordinary field changes", () => {
  const before = [box("a", 0, 0)];
  const after = [{ ...before[0], z: 3, locked: true, group: "g1" } as BoardObject];
  const ops = diffOps(before, after);
  assert.deepEqual(ops, [{ op: "set", id: "a", fields: { z: 3, locked: true, group: "g1" } }]);
  assert.deepEqual(applyOps(before, ops), after);
  assert.equal(checkOps(ops, () => true, 1), null);
});

test("the room refuses wrong types for z, locked and group", () => {
  const bad = (fields: Record<string, unknown>) => checkOps([{ op: "set", id: "a", fields }], () => true, 1);
  assert.ok(bad({ z: "high" }));
  assert.ok(bad({ locked: "yes" }));
  assert.ok(bad({ group: 5 }));
  assert.equal(bad({ group: "" }), null); // "" = ungrouped
});
