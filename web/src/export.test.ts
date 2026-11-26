import { test } from "node:test";
import assert from "node:assert/strict";
import { objectsToSvg, wrapLines } from "./exportSvg";
import { jpegToPdf } from "./pdf";
import { parseBoardFile, toBoardFile } from "./boardFile";
import type { BoardObject } from "./types";

const base = { x: 100, y: 100, width: 200, height: 100, rotation: 0 };
const sticky = { id: "s1", type: "sticky", ...base, text: "Hello <b> & friends", color: "#FFD43B" } as BoardObject;
const shape = { id: "sh", type: "shape", kind: "star", x: 400, y: 100, width: 100, height: 100, rotation: 0, fill: "#fff", stroke: "#000", strokeWidth: 2, text: "" } as BoardObject;
const conn = { id: "c1", type: "connector", x: 0, y: 0, width: 0, height: 0, rotation: 0, fromId: "s1", toId: "sh", lineStyle: "straight", endArrow: true, color: "#1F2937", dash: "dashed" } as BoardObject;

test("SVG export draws every kind of object and escapes the text", () => {
  const svg = objectsToSvg([sticky, shape, conn])!;
  assert.match(svg, /^<svg xmlns=/);
  assert.ok(svg.includes("&lt;b&gt;") && svg.includes("&amp;")); // special letters are escaped
  assert.ok(svg.includes("<polygon")); // the star and the arrow head
  assert.ok(svg.includes('stroke-dasharray="10 7"')); // dashed connector
  assert.ok(!svg.includes("<b>"));
  assert.equal(objectsToSvg([]), null);
});

test("SVG export only embeds real picture data", () => {
  const bad = { id: "i", type: "image", ...base, src: 'javascript:alert(1)" onload="x', name: "x" } as BoardObject;
  assert.ok(!objectsToSvg([bad, sticky])!.includes("javascript"));
});

test("text wrapping cuts long lines and long words", () => {
  assert.deepEqual(wrapLines("aaa bbb ccc", 60, 10), ["aaa bbb", "ccc"]);
  assert.ok(wrapLines("x".repeat(50), 55, 10).every((l) => l.length <= 10));
  assert.deepEqual(wrapLines("a\n\nb", 500, 10), ["a", "", "b"]);
});

test("PDF has the right skeleton and correct xref offsets", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, 800, 600);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/MediaBox \[0 0 800 600\]/);
  const xref = Number(text.match(/startxref\n(\d+)/)![1]);
  assert.equal(text.slice(xref, xref + 4), "xref");
  const offsets = [...text.slice(xref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  assert.equal(jpegToPdf(jpeg, 40000, 20000).length > 0, true);
  assert.match(new TextDecoder("latin1").decode(jpegToPdf(jpeg, 40000, 20000)), /MediaBox \[0 0 14400 7200\]/); // page size limit
});

test("board file: round trip, and bad content is dropped", () => {
  const back = parseBoardFile(toBoardFile("Plan", [sticky, shape, conn]));
  assert.equal(back.name, "Plan");
  assert.equal(back.objects.length, 3);
  assert.equal(back.skipped, 0);
  const dirty = JSON.stringify({ sketchboard: 1, name: "  ", objects: [sticky, { id: "x", type: "virus" }, sticky, { id: "y", type: "sticky" }, 5] });
  const r = parseBoardFile(dirty);
  assert.equal(r.objects.length, 1); // duplicate id, unknown type, missing fields, not an object
  assert.equal(r.skipped, 4);
  assert.equal(r.name, "Imported board");
});

test("board file: wrong files are refused with a clear message", () => {
  assert.throws(() => parseBoardFile("not json"), /not a Sketchboard file/);
  assert.throws(() => parseBoardFile('{"objects":[]}'), /not a Sketchboard file/);
  assert.throws(() => parseBoardFile(JSON.stringify({ sketchboard: 1, objects: new Array(5001).fill(sticky) })), /more than 5000/);
});

test("SVG export draws word styles as separate styled pieces", () => {
  const rich = { id: "r", type: "sticky", ...base, text: "a <b> c", color: "#FFD43B", spans: [{ s: 2, e: 5, b: true, c: "#E03131" }] } as BoardObject;
  const svg = objectsToSvg([rich])!;
  assert.match(svg, /<tspan[^>]*font-weight="700"[^>]*fill="#E03131"[^>]*>&lt;b&gt;<\/tspan>/);
  assert.ok(!svg.includes("<b>"));
});
