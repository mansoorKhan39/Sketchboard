import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHandles, handleFor } from "./mentions";

test("finds handles, ignores e-mail addresses and duplicates", () => {
  assert.deepEqual(extractHandles("hi @Ali and @sara_k, also @ali. mail a@b.com"), ["ali", "sara_k"]);
  assert.deepEqual(extractHandles("no one here"), []);
});
test("uses the first name unless it is shared", () => {
  assert.equal(handleFor("Ali Khan", ["Ali Khan", "Sara Noor"]), "Ali");
  assert.equal(handleFor("Ali Khan", ["Ali Khan", "Ali Raza"]), "AliKhan");
});
