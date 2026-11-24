import { test } from "node:test";
import assert from "node:assert/strict";
import { addCol, addRow, cellAt, makeCells, nextCell, removeCol, removeRow, setCell, validCells, MAX_ROWS } from "./table";
import { displayText, firstLink } from "./textstyle";

test("table rows and columns can be added, removed and edited", () => {
  let t = makeCells(2, 2);
  t = setCell(t, 0, 1, "hi");
  assert.deepEqual(t, [["", "hi"], ["", ""]]);
  t = addRow(t, 1);
  assert.equal(t.length, 3);
  t = addCol(t, 0);
  assert.deepEqual(t[0], ["", "", "hi"]);
  t = removeCol(removeRow(t, 1), 0);
  assert.deepEqual(t, [["", "hi"], ["", ""]]);
  assert.deepEqual(removeRow(makeCells(1, 2), 0), makeCells(1, 2)); // the last row stays
  assert.equal(addRow(makeCells(MAX_ROWS, 1), 0).length, MAX_ROWS); // limit
});

test("finding the cell under a point and moving with Tab", () => {
  const t = makeCells(2, 3);
  assert.deepEqual(cellAt(t, 300, 100, 150, 75), { r: 1, c: 1 });
  assert.deepEqual(cellAt(t, 300, 100, 299, 99), { r: 1, c: 2 });
  assert.equal(cellAt(t, 300, 100, -1, 5), null);
  assert.deepEqual(nextCell(t, 0, 2), { r: 1, c: 0 });
  assert.equal(nextCell(t, 1, 2), null);
  assert.deepEqual(nextCell(t, 1, 0, true), { r: 0, c: 2 });
});

test("only well-formed tables are accepted", () => {
  assert.ok(validCells([["a", "b"], ["c", "d"]]));
  assert.ok(!validCells([["a"], ["c", "d"]])); // ragged
  assert.ok(!validCells([]));
  assert.ok(!validCells([[1]]));
});

test("bullets and links", () => {
  assert.equal(displayText({ bullets: true }, "one\n\ntwo"), "• one\n\n• two");
  assert.equal(displayText({}, "one"), "one");
  assert.equal(firstLink("see https://example.com/a, ok"), "https://example.com/a");
  assert.equal(firstLink("no link"), null);
});

import { checkOps } from "./realtime/validate";
test("the room accepts good tables and text styles, and refuses bad ones", () => {
  const table = { id: "t", type: "table", x: 0, y: 0, width: 100, height: 50, rotation: 0, cells: [["a", "b"]], header: true };
  assert.equal(checkOps([{ op: "add", obj: table }], () => false, 0), null);
  assert.ok(checkOps([{ op: "add", obj: { ...table, cells: [["a"], ["b", "c"]] } }], () => false, 0));
  const set = (fields: Record<string, unknown>) => checkOps([{ op: "set", id: "t", fields }], () => true, 1);
  assert.equal(set({ bold: true, align: "right", fs: 24, bullets: false }), null);
  assert.equal(set({ fs: 0 }), null); // 0 = default size
  assert.ok(set({ bold: "yes" }));
  assert.ok(set({ align: "middle" }));
  assert.ok(set({ fs: 5000 }));
  assert.ok(set({ cells: [[1]] }));
});
