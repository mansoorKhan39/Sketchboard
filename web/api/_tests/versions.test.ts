import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, COOKIE } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import { addVersion, MAX_VERSIONS, MAX_VERSION_BYTES } from "../_lib/versions.js";
import type { VersionRec } from "../_lib/types.js";

function client(handle = createApi(new MemoryStore(), { secret: "s" })) {
  let cookie: string | undefined;
  const send = async (method: string, path: string, body?: unknown) => {
    const out = await handle({ method, path, headers: { "x-sketchboard": "1" }, cookies: cookie ? { [COOKIE]: cookie } : {}, body, secure: true });
    const set = out.headers?.["Set-Cookie"];
    if (typeof set === "string") cookie = set.split(";")[0].slice(COOKIE.length + 1) || undefined;
    return out;
  };
  return { send, handle };
}
const obj = (id: string) => ({ id, type: "sticky", x: 1, y: 2, width: 180, height: 180, rotation: 0, text: id, color: "#FFD43B" });
const rec = (n: number, objects: unknown[] = []): VersionRec => ({ id: "v" + n, at: n, label: "x", objects });

test("only the newest 5 versions are kept", () => {
  let list: VersionRec[] = [];
  for (let i = 1; i <= 7; i++) list = addVersion(list, rec(i));
  assert.equal(list.length, MAX_VERSIONS);
  assert.deepEqual(list.map((v) => v.id), ["v3", "v4", "v5", "v6", "v7"]);
});

test("big boards keep fewer versions so the database document stays small", () => {
  const big = [{ pad: "x".repeat(3_000_000) }];
  let list: VersionRec[] = [];
  for (let i = 1; i <= 5; i++) list = addVersion(list, rec(i, big));
  assert.ok(list.length < 5 && list.length >= 1);
  assert.ok(JSON.stringify(list.map((v) => v.objects)).length <= MAX_VERSION_BYTES + 10);
  assert.equal(list[list.length - 1].id, "v5"); // the newest always survives
});

test("save, list (newest first), read back and limit over the API", async () => {
  const c = client();
  await c.send("POST", "/auth/register", { name: "Alice", email: "a@b.co", password: "correct horse" });
  const id = ((await c.send("POST", "/boards", {})).body as any).board.id;
  assert.deepEqual(((await c.send("GET", `/boards/${id}/versions`)).body as any).versions, []);
  for (let i = 1; i <= 6; i++) {
    const r = await c.send("POST", `/boards/${id}/versions`, { label: `v${i}`, objects: [obj("a" + i)] });
    assert.equal(r.status, 201);
  }
  const list = ((await c.send("GET", `/boards/${id}/versions`)).body as any).versions;
  assert.equal(list.length, 5);
  assert.equal(list[0].label, "v6"); // newest first
  assert.equal(list[0].count, 1);
  assert.ok(!JSON.stringify(list).includes('"objects"')); // the list never carries the content
  const one = await c.send("GET", `/boards/${id}/versions/${list[1].id}`);
  assert.equal((one.body as any).objects[0].id, "a5");
  assert.equal((await c.send("GET", `/boards/${id}/versions/nope`)).status, 404);
});

test("versions are private to the owner, and bad input is refused", async () => {
  const handle = createApi(new MemoryStore(), { secret: "s" });
  const a = client(handle), b = client(handle);
  await a.send("POST", "/auth/register", { name: "A", email: "a@b.co", password: "correct horse" });
  await b.send("POST", "/auth/register", { name: "B", email: "b@b.co", password: "correct horse" });
  const id = ((await a.send("POST", "/boards", {})).body as any).board.id;
  await a.send("POST", `/boards/${id}/versions`, { objects: [obj("a")] });
  assert.equal((await b.send("GET", `/boards/${id}/versions`)).status, 404);
  assert.equal((await b.send("POST", `/boards/${id}/versions`, { objects: [] })).status, 404);
  assert.equal((await a.send("POST", `/boards/${id}/versions`, { objects: "nope" })).status, 400);
  assert.equal((await a.send("POST", `/boards/${id}/versions`, { objects: [{ id: "x", type: "banana", x: 0, y: 0, width: 0, height: 0, rotation: 0 }] })).status, 400);
  const anon = client(handle);
  assert.equal((await anon.send("GET", `/boards/${id}/versions`)).status, 401);
});

test("deleting a board deletes its versions", async () => {
  const store = new MemoryStore();
  const c = client(createApi(store, { secret: "s" }));
  await c.send("POST", "/auth/register", { name: "A", email: "a@b.co", password: "correct horse" });
  const id = ((await c.send("POST", "/boards", {})).body as any).board.id;
  await c.send("POST", `/boards/${id}/versions`, { objects: [obj("a")] });
  await c.send("DELETE", `/boards/${id}`);
  assert.deepEqual(await store.getVersions(id), []);
});
