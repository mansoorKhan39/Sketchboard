import { test } from "node:test";
import assert from "node:assert/strict";
import { charStyles, layoutRich, sameSpans, spansFromStyles, validSpans, type Measure } from "./richtext";

// every letter is 10 wide (bold 12)
const measure: Measure = (t, s) => t.length * (s.b ? 12 : 10);

test("spans <-> per-character styles round trip, and plain text gets none", () => {
  const spans = [{ s: 2, e: 5, b: true }, { s: 4, e: 8, u: true, c: "#E03131" }];
  const st = charStyles(10, spans);
  assert.equal(st[1].b, false);
  assert.equal(st[4].b, true);
  assert.equal(st[4].u, true);
  assert.equal(st[4].c, "#E03131");
  assert.deepEqual(spansFromStyles(st), [{ s: 2, e: 4, b: true }, { s: 4, e: 5, b: true, u: true, c: "#E03131" }, { s: 5, e: 8, u: true, c: "#E03131" }]);
  assert.deepEqual(spansFromStyles(charStyles(5, [])), []);
  assert.ok(sameSpans(undefined, []));
});

test("whole-object bold is added on top of the spans", () => {
  const st = charStyles(3, [{ s: 0, e: 1, i: true }], { b: true });
  assert.ok(st.every((c) => c.b));
  assert.ok(st[0].i && !st[1].i);
});

test("validSpans refuses bad shapes and colours", () => {
  assert.ok(validSpans([{ s: 0, e: 3, b: true, c: "#00FF00" }]));
  assert.ok(!validSpans([{ s: 3, e: 3 }]));
  assert.ok(!validSpans([{ s: -1, e: 3 }]));
  assert.ok(!validSpans([{ s: 0, e: 3, c: "red" }]));
  assert.ok(!validSpans([{ s: 0, e: 3, b: "yes" }]));
  assert.ok(!validSpans("nope"));
  assert.ok(!validSpans(Array.from({ length: 301 }, (_, i) => ({ s: i, e: i + 1 }))));
});

test("layout wraps at word boundaries and keeps each word's style", () => {
  const text = "aa bbb cc dd";
  // "bbb" bold: widths aa=20, space=10, bbb=36
  const { lines, height } = layoutRich(text, [{ s: 3, e: 6, b: true }], { width: 60, size: 10, measure });
  assert.deepEqual(lines.map((l) => l.segs.map((s) => s.text).join("")), ["aa", "bbb", "cc dd"]);
  assert.equal(lines[1].segs[0].b, true); // "bbb" is bold
  const l3 = lines[2].segs;
  assert.equal(l3.length, 1);
  assert.equal(l3[0].text, "cc dd"); // a space inside a line is kept
  const l2 = layoutRich("aa bbb", [{ s: 3, e: 6, b: true }], { width: 200, size: 10, measure }).lines[0].segs;
  assert.deepEqual(l2.map((s) => [s.text, s.x, s.b]), [["aa ", 0, false], ["bbb", 30, true]]); // the bold word starts right after "aa "
  assert.equal(height, 3 * 12.5);
});

test("layout: newlines, empty lines, bullets, alignment", () => {
  const r = layoutRich("a\n\nb", [], { width: 100, size: 10, measure });
  assert.equal(r.lines.length, 3);
  assert.equal(r.lines[1].segs.length, 0);
  const bl = layoutRich("a\n\nb", [], { width: 100, size: 10, measure, bullets: true });
  assert.equal(bl.lines[0].segs[0].text, "• ");
  assert.equal(bl.lines[1].segs.length, 0); // empty line gets no bullet
  assert.equal(bl.lines[2].segs[0].text, "• ");
  const c = layoutRich("ab", [], { width: 100, size: 10, measure, align: "center" });
  assert.equal(c.lines[0].segs[0].x, 40); // (100 - 20) / 2
  const rt = layoutRich("ab", [], { width: 100, size: 10, measure, align: "right" });
  assert.equal(rt.lines[0].segs[0].x, 80);
});

test("layout breaks a word that is wider than the line", () => {
  const { lines } = layoutRich("abcdefghij", [], { width: 40, size: 10, measure });
  assert.deepEqual(lines.map((l) => l.segs.map((s) => s.text).join("")), ["abcd", "efgh", "ij"]);
});
