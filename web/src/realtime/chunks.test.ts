import { test } from "node:test";
import assert from "node:assert/strict";
import { compact, createAssembler, MAX_SINGLE, toMessages } from "./chunks";
import type { Obj, Op } from "./protocol";

const obj = (id: string, extra: Record<string, unknown> = {}): Obj => ({ id, type: "image", x: 0, y: 0, width: 10, height: 10, rotation: 0, ...extra });

test("a small edit is one message", () => {
  const m = toMessages([{ op: "add", obj: obj("a") }], "e1");
  assert.equal(m.length, 1);
  assert.equal(m[0].name, "edit");
});

test("a big picture is cut into pieces under Ably's 64 KB limit and glued back exactly", () => {
  const big: Op[] = [{ op: "add", obj: obj("pic", { src: "data:image/jpeg;base64," + "A".repeat(200_000) }) }];
  const msgs = toMessages(big, "e2");
  assert.ok(msgs.length >= 7);
  for (const m of msgs) {
    assert.equal(m.name, "chunk");
    assert.ok(JSON.stringify(m.data).length < 60_000);
  }
  const assemble = createAssembler();
  let result: Op[] | null = null;
  // pieces may be interleaved with another sender's pieces, and a repeated piece is harmless
  const other = toMessages([{ op: "add", obj: obj("other", { src: "B".repeat(MAX_SINGLE + 10) }) }], "e2");
  const otherAsm: Op[][] = [];
  msgs.forEach((m, i) => {
    if (m.name === "chunk") {
      if (i === 1) assemble("me", m.data);
      result = assemble("me", m.data) ?? result;
      const o = other[i];
      if (o?.name === "chunk") {
        const r = assemble("you", o.data);
        if (r) otherAsm.push(r);
      }
    }
  });
  assert.deepEqual(result, big);
  assert.equal(otherAsm.length, 1);
});

test("broken or half-finished pieces are ignored", () => {
  const assemble = createAssembler();
  assert.equal(assemble("x", { eid: "e", i: 0, n: 2, s: "{" }), null); // never completed
  assert.equal(assemble("x", { eid: "e", i: 5, n: 2, s: "" }), null); // number out of range
  assert.equal(assemble("x", { eid: "e", i: 0, n: 1000, s: "" }), null); // absurd count
  assert.equal(assemble("x", { eid: "f", i: 0, n: 1, s: "not json" }), null);
  assert.equal(assemble("x", { eid: "g", i: 0, n: 1, s: '{"ops":5}' }), null);
});

test("compact joins repeated changes to one object but keeps order across objects", () => {
  const ops: Op[] = [
    { op: "set", id: "a", fields: { x: 1 } },
    { op: "set", id: "a", fields: { y: 2 } },
    { op: "set", id: "b", fields: { x: 3 } },
    { op: "set", id: "a", fields: { x: 4 } },
  ];
  assert.deepEqual(compact(ops), [
    { op: "set", id: "a", fields: { x: 1, y: 2 } },
    { op: "set", id: "b", fields: { x: 3 } },
    { op: "set", id: "a", fields: { x: 4 } },
  ]);
  assert.deepEqual(compact([{ op: "add", obj: obj("n") }, { op: "set", id: "n", fields: { x: 9 } }]), [{ op: "add", obj: obj("n", { x: 9 }) }]);
});
