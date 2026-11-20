import { test, before } from "node:test";
import assert from "node:assert/strict";
import { isHiddenFrom, isPrivate, togglePrivate } from "./extras.js";
import { isObj } from "../../realtime/src/validate.js";
import type { BoardObject } from "./types";

// The store and the templates are written for a browser, so give Node a tiny pretend one.
let store: typeof import("./store.js");
let tpl: typeof import("./templates.js");
before(async () => {
  const mem = new Map<string, string>();
  Object.assign(globalThis, {
    window: { addEventListener() {}, innerWidth: 1280, innerHeight: 800, location: { hash: "" } },
    localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
  });
  store = await import("./store.js");
  tpl = await import("./templates.js");
});

const reset = (objects: BoardObject[]) =>
  store.useBoard.setState({ boardId: "b", loaded: true, role: "solo", objects, selectedIds: [], past: [], future: [] });

test("every template builds objects the server accepts, with fresh ids each time", () => {
  for (const t of tpl.TEMPLATES) {
    const a = t.build(), b = t.build();
    assert.ok(a.every((o) => isObj(o)), t.id);
    if (a.length) assert.notEqual(a[0].id, b[0].id, t.id);
    for (const c of a) if (c.type === "connector") assert.ok(a.some((o) => o.id === c.fromId) && a.some((o) => o.id === c.toId), t.id + " connector ends exist");
  }
  assert.ok(tpl.TEMPLATES.length >= 9);
});

test("mind map: a child is linked to its parent and stacked under earlier children", () => {
  const root = { id: "r", type: "sticky", x: 0, y: 0, width: 180, height: 180, rotation: 0, text: "root", color: "#FFD43B" } as BoardObject;
  reset([root]);
  const s = store.useBoard.getState();
  const c1 = s.addChildNode("r", "me")!;
  const c2 = s.addChildNode("r", "me")!;
  const { objects, selectedIds } = store.useBoard.getState();
  const n1 = objects.find((o) => o.id === c1)!, n2 = objects.find((o) => o.id === c2)!;
  assert.ok(n1.x >= 180 + 100 - 1); // to the right of the parent
  assert.ok(n2.y >= n1.y + n1.height + 24 - 1); // below the first child, not on top of it
  assert.equal(objects.filter((o) => o.type === "connector").length, 2);
  assert.deepEqual(selectedIds, [c2]);
  assert.equal(store.useBoard.getState().past.length, 2); // one undo step each
});

test("mind map: a sibling hangs from the same parent; a note without a parent has no sibling", () => {
  reset([{ id: "r", type: "sticky", x: 0, y: 0, width: 180, height: 180, rotation: 0, text: "", color: "#FFD43B" } as BoardObject]);
  const s = store.useBoard.getState();
  assert.equal(s.addSiblingNode("r", "me"), null);
  const kid = s.addChildNode("r", "me")!;
  const sib = store.useBoard.getState().addSiblingNode(kid, "me")!;
  const links = store.useBoard.getState().objects.filter((o) => o.type === "connector");
  assert.ok(links.every((l) => l.type === "connector" && l.fromId === "r"));
  assert.ok(sib && sib !== kid);
});

test("viewers cannot add nodes", () => {
  reset([{ id: "r", type: "sticky", x: 0, y: 0, width: 180, height: 180, rotation: 0, text: "", color: "#FFD43B" } as BoardObject]);
  store.useBoard.setState({ role: "viewer" });
  assert.equal(store.useBoard.getState().addChildNode("r", "me"), null);
});

test("private mode hides other people's notes only, and only while it is on", () => {
  assert.equal(isHiddenFrom({ by: "u2" }, "u1", true), true);
  assert.equal(isHiddenFrom({ by: "u1" }, "u1", true), false); // my own note
  assert.equal(isHiddenFrom({}, "u1", true), false); // no author: stays visible
  assert.equal(isHiddenFrom({ by: "u2" }, "u1", false), false); // switched off = revealed
  let objs: BoardObject[] = [];
  assert.equal(isPrivate(objs), false);
  objs = togglePrivate(objs);
  assert.equal(isPrivate(objs), true);
  objs = togglePrivate(objs);
  assert.equal(isPrivate(objs), false);
  assert.equal(objs.filter((o) => o.type === "settings").length, 1); // toggling never makes a second switch object
});
