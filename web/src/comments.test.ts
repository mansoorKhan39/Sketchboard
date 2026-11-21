import { test } from "node:test";
import assert from "node:assert/strict";
import { newMessage, countOpen, MAX_THREAD, MAX_COMMENT_CHARS } from "./comments.js";
import { diffOps, applyOps } from "./realtime/ops.js";
import { isObj } from "./realtime/validate.js";
import { contentBounds } from "./geometry.js";
import type { BoardObject, CommentObj } from "./types";

const pin = (id: string, thread = [] as CommentObj["thread"], resolved = false): CommentObj => ({
  id, type: "comment", x: 5, y: 6, width: 0, height: 0, rotation: 0, thread, resolved,
});

test("a message keeps its author (cut to 40 chars) and the time", () => {
  const m = newMessage("A".repeat(60), "hi", 123);
  assert.equal(m.author.length, 40);
  assert.equal(m.at, 123);
  assert.equal(m.text, "hi");
});

test("the largest allowed thread is far below the server's 64 000 character limit", () => {
  const thread = Array.from({ length: MAX_THREAD }, () => newMessage("N".repeat(40), "x".repeat(MAX_COMMENT_CHARS)));
  assert.equal(isObj(pin("c", thread)), true);
});

test("the server accepts a comment; replying travels as one small change", () => {
  const before: BoardObject[] = [pin("c")];
  const after: BoardObject[] = [pin("c", [newMessage("Ana", "hello")])];
  const ops = diffOps(before, after);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, "set");
  assert.deepEqual(applyOps(before, ops), after);
});

test("open comments are counted; resolved ones are not; pins do not count as board content", () => {
  assert.equal(countOpen([pin("a"), pin("b", [], true), { type: "sticky" }]), 1);
  assert.equal(contentBounds([pin("a")]), null);
});
