import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, COOKIE } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import { createToken, readToken } from "../_lib/security.js";
import type { ApiResponse } from "../_lib/types.js";

const SECRET = "test-secret";

// A tiny "browser": it keeps cookies between calls, just like a real one.
function client(handle = createApi(new MemoryStore(), { secret: SECRET }), secure = true) {
  let cookie: string | undefined;
  const send = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<ApiResponse> => {
    const out = await handle({
      method, path,
      headers: { "x-sketchboard": "1", ...extra },
      cookies: cookie ? { [COOKIE]: cookie } : {},
      body, secure,
    });
    const set = out.headers?.["Set-Cookie"];
    if (typeof set === "string") {
      const value = set.split(";")[0].slice(COOKIE.length + 1);
      cookie = value || undefined;
    }
    return out;
  };
  return { send, handle, clearCookie: () => (cookie = undefined) };
}

const alice = { name: "Alice", email: "Alice@Example.com", password: "correct horse" };
const obj = (id: string) => ({ id, type: "sticky", x: 1, y: 2, width: 180, height: 180, rotation: 0, text: "hi", color: "#FFD43B" });

test("register signs you in and sets a safe cookie", async () => {
  const c = client();
  const r = await c.send("POST", "/auth/register", alice);
  assert.equal(r.status, 201);
  assert.equal((r.body as any).user.email, "alice@example.com"); // e-mail is lower-cased
  assert.ok(!JSON.stringify(r.body).includes("passwordHash"));
  const cookie = r.headers!["Set-Cookie"] as string;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  const me = await c.send("GET", "/auth/me");
  assert.equal(me.status, 200);
});

test("cookie is not marked Secure over plain http (local development)", async () => {
  const c = client(undefined, false);
  const r = await c.send("POST", "/auth/register", alice);
  assert.doesNotMatch(r.headers!["Set-Cookie"] as string, /Secure/);
});

test("duplicate e-mail is rejected, weak input is rejected", async () => {
  const c = client();
  await c.send("POST", "/auth/register", alice);
  assert.equal((await c.send("POST", "/auth/register", { ...alice, email: "ALICE@example.com" })).status, 409);
  assert.equal((await c.send("POST", "/auth/register", { ...alice, email: "x@y.com", password: "short" })).status, 400);
  assert.equal((await c.send("POST", "/auth/register", { ...alice, email: "not-an-email" })).status, 400);
  assert.equal((await c.send("POST", "/auth/register", { email: "a@b.com" })).status, 400);
});

test("login works, wrong password and unknown e-mail give the same message", async () => {
  const shared = createApi(new MemoryStore(), { secret: SECRET });
  await client(shared).send("POST", "/auth/register", alice);
  const c = client(shared);
  const ok = await c.send("POST", "/auth/login", { email: "alice@example.com", password: alice.password });
  assert.equal(ok.status, 200);
  const bad = await client(shared).send("POST", "/auth/login", { email: "alice@example.com", password: "nope nope" });
  const ghost = await client(shared).send("POST", "/auth/login", { email: "ghost@example.com", password: "nope nope" });
  assert.equal(bad.status, 401);
  assert.equal(ghost.status, 401);
  assert.deepEqual(bad.body, ghost.body);
});

test("logout clears the session", async () => {
  const c = client();
  await c.send("POST", "/auth/register", alice);
  assert.equal((await c.send("POST", "/auth/logout")).status, 204);
  assert.equal((await c.send("GET", "/auth/me")).status, 401);
});

test("state-changing requests without the custom header are blocked (CSRF)", async () => {
  const h = createApi(new MemoryStore(), { secret: SECRET });
  const r = await h({ method: "POST", path: "/auth/register", headers: {}, cookies: {}, body: alice, secure: true });
  assert.equal(r.status, 403);
});

test("boards need a signed-in user", async () => {
  const c = client();
  assert.equal((await c.send("GET", "/boards")).status, 401);
  assert.equal((await c.send("POST", "/boards", {})).status, 401);
});

test("boards: create, list, read, save, rename, duplicate, delete", async () => {
  const c = client();
  await c.send("POST", "/auth/register", alice);
  const created = await c.send("POST", "/boards", { name: "Plan", objects: [obj("a")] });
  assert.equal(created.status, 201);
  const id = (created.body as any).board.id as string;

  const list = (await c.send("GET", "/boards")).body as any;
  assert.equal(list.boards.length, 1);

  const saved = await c.send("PUT", `/boards/${id}`, { objects: [obj("a"), obj("b")], viewport: { x: 5, y: 6, scale: 2 } });
  assert.equal(saved.status, 200);
  const got = ((await c.send("GET", `/boards/${id}`)).body as any).board;
  assert.equal(got.objects.length, 2);
  assert.deepEqual(got.viewport, { x: 5, y: 6, scale: 2 });

  assert.equal((await c.send("PATCH", `/boards/${id}`, { name: "  New name " })).status, 200);
  assert.equal((((await c.send("GET", `/boards/${id}`)).body as any).board).name, "New name");

  const dup = await c.send("POST", `/boards/${id}/duplicate`);
  assert.equal(dup.status, 201);
  assert.equal((dup.body as any).board.name, "New name copy");
  assert.equal(((await c.send("GET", "/boards")).body as any).boards.length, 2);

  assert.equal((await c.send("DELETE", `/boards/${id}`)).status, 204);
  assert.equal((await c.send("GET", `/boards/${id}`)).status, 404);
});

test("you cannot read, change or delete someone else's board", async () => {
  const shared = createApi(new MemoryStore(), { secret: SECRET });
  const a = client(shared);
  const b = client(shared);
  await a.send("POST", "/auth/register", alice);
  await b.send("POST", "/auth/register", { name: "Bob", email: "bob@example.com", password: "another long one" });
  const id = ((await a.send("POST", "/boards", { name: "Private" })).body as any).board.id;

  for (const [m, body] of [["GET"], ["PUT", { objects: [] }], ["PATCH", { name: "x" }], ["DELETE"], ["POST", undefined]] as const) {
    const path = m === "POST" ? `/boards/${id}/duplicate` : `/boards/${id}`;
    assert.equal((await b.send(m, path, body)).status, 404, `${m} should be 404`);
  }
  assert.equal(((await b.send("GET", "/boards")).body as any).boards.length, 0);
  assert.equal((((await a.send("GET", `/boards/${id}`)).body as any).board).name, "Private"); // untouched
});

test("board input is validated", async () => {
  const c = client();
  await c.send("POST", "/auth/register", alice);
  const id = ((await c.send("POST", "/boards", {})).body as any).board.id;
  assert.equal((await c.send("PUT", `/boards/${id}`, { objects: [{ id: "a", type: "virus", x: 0, y: 0, width: 1, height: 1, rotation: 0 }] })).status, 400);
  assert.equal((await c.send("PUT", `/boards/${id}`, { objects: [{ id: "a", type: "sticky", x: "left" }] })).status, 400);
  assert.equal((await c.send("PUT", `/boards/${id}`, { objects: "nope" })).status, 400);
  assert.equal((await c.send("PATCH", `/boards/${id}`, { name: "   " })).status, 400);
  const tooMany = Array.from({ length: 5001 }, (_, i) => obj(String(i)));
  assert.equal((await c.send("PUT", `/boards/${id}`, { objects: tooMany })).status, 400);
});

test("forged, edited and expired tokens are rejected", () => {
  const t = createToken("u1", SECRET);
  assert.equal(readToken(t, SECRET), "u1");
  assert.equal(readToken(t, "other-secret"), null);
  const [payload, sig] = t.split(".");
  const evil = Buffer.from(JSON.stringify({ uid: "admin", exp: Date.now() + 1e9 })).toString("base64url");
  assert.equal(readToken(`${evil}.${sig}`, SECRET), null);
  assert.equal(readToken(`${payload}.`, SECRET), null);
  assert.equal(readToken(undefined, SECRET), null);
  assert.equal(readToken(t, SECRET, Date.now() + 31 * 86_400_000), null); // after 30 days
});

test("unknown addresses give a clean 404", async () => {
  const c = client();
  const r = await c.send("GET", "/nothing/here");
  assert.equal(r.status, 404);
  assert.equal((r.body as any).error.code, "not_found");
});
