import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createApi, COOKIE } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import type { ApiResponse } from "../_lib/types.js";

const SECRET = "test-secret";
const KEY = "appId.keyId:key-secret";

// pass null to switch live collaboration off (undefined would fall back to the default)
function setup(ablyKey: string | null = KEY) {
  const handle = createApi(new MemoryStore(), { secret: SECRET, ablyKey: ablyKey ?? undefined });
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
// read an Ably token (a JWT): header, payload, the channel rights, and whether the signature is right
const readJwt = (token: string) => {
  const [h, p, sig] = token.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString()),
    payload,
    cap: JSON.parse(payload["x-ably-capability"]) as Record<string, string[]>,
    clientId: payload["x-ably-clientId"] as string,
    signed: sig === createHmac("sha256", "key-secret").update(`${h}.${p}`).digest("base64url"),
  };
};
const claimsOf = (token: string) => {
  const j = readJwt(token);
  const canEdit = Object.values(j.cap).some((ops) => ops.includes("publish") && ops.length > 1 && !ops.includes("presence"));
  return { ...j, role: canEdit ? "editor-or-owner" : "viewer" };
};

test("owner gets an Ably pass that is signed with the key and limited to this board's channels", async () => {
  const owner = setup().make();
  await owner("POST", "/auth/register", user("Alice"));
  const id = ((await owner("POST", "/boards", {})).body as any).board.id;
  const r = await owner("POST", `/boards/${id}/join`);
  assert.equal(r.status, 200);
  const { token, role, clientId } = r.body as any;
  assert.equal(role, "owner");
  const j = readJwt(token);
  assert.ok(j.signed);
  assert.equal(j.header.kid, "appId.keyId"); // the key NAME is public, the secret never leaves the server
  assert.equal(j.clientId, clientId);
  assert.deepEqual(Object.keys(j.cap).sort(), [`board:${id}`, `cur:${id}`]); // nothing else on the account
  assert.ok(j.cap[`board:${id}`].includes("publish"));
  assert.ok(j.payload.exp * 1000 > Date.now() && j.payload.exp * 1000 - Date.now() <= 61 * 60_000);
  assert.ok(!JSON.stringify(r.body).includes("key-secret"));
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
  assert.equal(c.role, "viewer"); // a viewer's pass has no right to publish edits
  assert.ok(!c.cap[`board:${id}`].includes("publish"));
  assert.equal((j.body as any).name, "Team board");
  assert.equal((j.body as any).you, "Visitor");
  assert.match(c.clientId, /^g_/);

  // the same guest asks again (pass renewal): keeps the same id
  const again = await guest("POST", `/share/${token}/join`, { name: "Visitor", guestId: c.clientId });
  assert.equal(readJwt((again.body as any).token).clientId, c.clientId);
  assert.equal((await guest("POST", `/share/${token}/join`, { guestId: "../../x" })).status, 400);

  // change the right to editor
  await owner("PUT", `/boards/${id}/share`, { enabled: true, right: "editor" });
  const e = (await guest("POST", `/share/${token}/join`, {})).body as any;
  assert.equal(e.role, "editor");
  assert.ok(claimsOf(e.token).cap[`board:${id}`].includes("publish"));
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
  const b = (await bob("POST", `/share/${token}/join`, { name: "ignored" })).body as any;
  assert.equal(b.name, "Untitled board"); // the board's name; the person is identified by account id on the channel
  assert.equal(b.you, "Bob"); // the name other people see next to the cursor
  assert.equal(b.role, "editor");
  assert.notEqual(b.clientId, ((await owner("POST", `/share/${token}/join`, {})).body as any).clientId);
  assert.equal(((await owner("POST", `/share/${token}/join`, {})).body as any).role, "owner");
});

test("share state: anyone with the link reads; editors (and the owner) save; viewers cannot", async () => {
  const { make } = setup();
  const owner = make(), guest = make();
  await owner("POST", "/auth/register", user("Alice"));
  const id = ((await owner("POST", "/boards", { objects: [{ id: "a", type: "sticky", x: 0, y: 0, width: 1, height: 1, rotation: 0 }] })).body as any).board.id;
  const obj = (n: string) => ({ id: n, type: "text", x: 0, y: 0, width: 5, height: 5, rotation: 0, text: n });
  const token = ((await owner("PUT", `/boards/${id}/share`, { enabled: true, right: "viewer" })).body as any).share.token;

  assert.equal(((await guest("GET", `/share/${token}/state`)).body as any).objects.length, 1);
  assert.equal((await guest("PUT", `/share/${token}/state`, { objects: [obj("x")] })).status, 403); // viewer
  assert.equal((await owner("PUT", `/share/${token}/state`, { objects: [obj("x")] })).status, 200); // owner may

  await owner("PUT", `/boards/${id}/share`, { enabled: true, right: "editor" });
  assert.equal((await guest("PUT", `/share/${token}/state`, { objects: [obj("x"), obj("y")] })).status, 200);
  assert.equal((((await owner("GET", `/boards/${id}`)).body as any).board.objects).length, 2);
  assert.equal((await guest("PUT", `/share/${token}/state`, { objects: "no" })).status, 400);
  assert.equal((await guest("PUT", `/share/${token}/state`, { objects: [obj("x")] }, {})).status, 403); // no CSRF header

  await owner("PUT", `/boards/${id}/share`, { enabled: false });
  assert.equal((await guest("GET", `/share/${token}/state`)).status, 404); // link off: no access
});

test("the old internal room endpoints are gone", async () => {
  const { make } = setup();
  const anyone = make();
  assert.equal((await anyone("GET", "/internal/boards/x/state", undefined, { "x-realtime-key": "k" })).status, 404);
});
