import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApi, COOKIE } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import type { ApiResponse } from "../_lib/types.js";

const SECRET = "test-secret";
const RT = { secret: "rt-secret", url: "wss://rt.example.workers.dev/" };

// pass null to switch realtime off (undefined would fall back to the default)
function setup(realtime: typeof RT | null = RT) {
  const handle = createApi(new MemoryStore(), { secret: SECRET, realtime: realtime ?? undefined });
  const make = () => {
    let cookie: string | undefined;
    return async (method: string, path: string, body?: unknown, headers: Record<string, string> = { "x-sketchboard": "1" }): Promise<ApiResponse> => {
      const out = await handle({ method, path, headers, cookies: cookie ? { [COOKIE]: cookie } : {}, body, secure: true });
      const set = out.headers?.["Set-Cookie"];
      if (typeof set === "string") cookie = set.split(";")[0].slice(COOKIE.length + 1) || undefined;
      return out;
    };
  };
  return { make };
}
const user = (name: string) => ({ name, email: `${name.toLowerCase()}@example.com`, password: "long enough pass" });
const claimsOf = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());

test("owner gets a join token that the realtime service can verify", async () => {
  const owner = setup().make();
  await owner("POST", "/auth/register", user("Alice"));
  const id = ((await owner("POST", "/boards", {})).body as any).board.id;
  const r = await owner("POST", `/boards/${id}/join`);
  assert.equal(r.status, 200);
  const { token, wsUrl, role } = r.body as any;
  assert.equal(role, "owner");
  assert.equal(wsUrl, `wss://rt.example.workers.dev/ws/${id}`);
  const [payload, sig] = token.split(".");
  assert.equal(sig, createHmac("sha256", RT.secret).update(payload).digest("base64url"));
  const c = claimsOf(token);
  assert.equal(c.b, id);
  assert.equal(c.r, "owner");
  assert.ok(c.exp - Date.now() <= 2 * 60_000 && c.exp > Date.now()); // lives about two minutes
});

test("join and share answer 503 when realtime is not configured", async () => {
  const owner = setup(null).make();
  await owner("POST", "/auth/register", user("Alice"));
  const id = ((await owner("POST", "/boards", {})).body as any).board.id;
  assert.equal((await owner("POST", `/boards/${id}/join`)).status, 503);
  assert.equal((await owner("PUT", `/boards/${id}/share`, { enabled: true })).status, 503);
});

test("share link: off by default, owner turns it on, guests join with the link's right", async () => {
  const { make } = setup();
  const owner = make(), guest = make();
  await owner("POST", "/auth/register", user("Alice"));
  const id = ((await owner("POST", "/boards", { name: "Team board" })).body as any).board.id;

  assert.equal(((await owner("GET", `/boards/${id}/share`)).body as any).share, null);
  const on = (await owner("PUT", `/boards/${id}/share`, { enabled: true, right: "viewer" })).body as any;
  assert.equal(on.share.enabled, true);
  const token = on.share.token as string;
  assert.ok(token.length >= 24);

  const info = (await guest("GET", `/share/${token}`)).body as any;
  assert.deepEqual(info.board, { id, name: "Team board" });
  assert.equal(info.right, "viewer");

  const j = await guest("POST", `/share/${token}/join`, { name: "Visitor" });
  assert.equal(j.status, 200);
  const c = claimsOf((j.body as any).token);
  assert.equal(c.r, "viewer");
  assert.equal(c.n, "Visitor");
  assert.match(c.u, /^g_/);

  // change the right to editor
  await owner("PUT", `/boards/${id}/share`, { enabled: true, right: "editor" });
  assert.equal(claimsOf(((await guest("POST", `/share/${token}/join`, {})).body as any).token).r, "editor");
});

test("turning the link off or regenerating it kills the old link", async () => {
  const { make } = setup();
  const owner = make(), guest = make();
  await owner("POST", "/auth/register", user("Alice"));
  const id = ((await owner("POST", "/boards", {})).body as any).board.id;
  const t1 = ((await owner("PUT", `/boards/${id}/share`, { enabled: true })).body as any).share.token;
  const t2 = ((await owner("PUT", `/boards/${id}/share`, { enabled: true, regenerate: true })).body as any).share.token;
  assert.notEqual(t1, t2);
  assert.equal((await guest("GET", `/share/${t1}`)).status, 404);
  assert.equal((await guest("GET", `/share/${t2}`)).status, 200);
  await owner("PUT", `/boards/${id}/share`, { enabled: false });
  assert.equal((await guest("GET", `/share/${t2}`)).status, 404);
  assert.equal((await guest("POST", `/share/${t2}/join`, {})).status, 404);
});

test("only the owner can change sharing or get an owner token", async () => {
  const { make } = setup();
  const owner = make(), other = make();
  await owner("POST", "/auth/register", user("Alice"));
  await other("POST", "/auth/register", user("Bob"));
  const id = ((await owner("POST", "/boards", {})).body as any).board.id;
  assert.equal((await other("PUT", `/boards/${id}/share`, { enabled: true })).status, 404);
  assert.equal((await other("GET", `/boards/${id}/share`)).status, 404);
  assert.equal((await other("POST", `/boards/${id}/join`)).status, 404);
});

test("a signed-in user opening someone's link uses their account name; the owner keeps the owner role", async () => {
  const { make } = setup();
  const owner = make(), bob = make();
  await owner("POST", "/auth/register", user("Alice"));
  await bob("POST", "/auth/register", user("Bob"));
  const id = ((await owner("POST", "/boards", {})).body as any).board.id;
  const token = ((await owner("PUT", `/boards/${id}/share`, { enabled: true, right: "editor" })).body as any).share.token;
  const b = claimsOf(((await bob("POST", `/share/${token}/join`, { name: "ignored" })).body as any).token);
  assert.equal(b.n, "Bob");
  assert.equal(b.r, "editor");
  assert.equal(claimsOf(((await owner("POST", `/share/${token}/join`, {})).body as any).token).r, "owner");
});

test("internal room endpoints need the realtime secret", async () => {
  const { make } = setup();
  const owner = make(), room = make();
  await owner("POST", "/auth/register", user("Alice"));
  const id = ((await owner("POST", "/boards", { objects: [{ id: "a", type: "sticky", x: 0, y: 0, width: 1, height: 1, rotation: 0 }] })).body as any).board.id;

  assert.equal((await room("GET", `/internal/boards/${id}/state`, undefined, {})).status, 401);
  assert.equal((await room("GET", `/internal/boards/${id}/state`, undefined, { "x-realtime-key": "wrong" })).status, 401);
  assert.equal((await owner("GET", `/internal/boards/${id}/state`)).status, 401); // a signed-in user is not the room

  const key = { "x-realtime-key": RT.secret };
  const got = (await room("GET", `/internal/boards/${id}/state`, undefined, key)).body as any;
  assert.equal(got.objects.length, 1);
  // PUT works without the browser CSRF header, because the secret is the proof
  const obj = (n: string) => ({ id: n, type: "text", x: 0, y: 0, width: 5, height: 5, rotation: 0, text: n });
  assert.equal((await room("PUT", `/internal/boards/${id}/state`, { objects: [obj("x"), obj("y")] }, key)).status, 200);
  assert.equal((((await owner("GET", `/boards/${id}`)).body as any).board.objects).length, 2);
  assert.equal((await room("PUT", `/internal/boards/${id}/state`, { objects: "no" }, key)).status, 400);
  assert.equal((await room("GET", `/internal/boards/nope/state`, undefined, key)).status, 404);
});
