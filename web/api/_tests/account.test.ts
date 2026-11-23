import { test } from "node:test";
import assert from "node:assert/strict";
import { COOKIE, createApi } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import type { ApiResponse } from "../_lib/types.js";
import type { GoogleProfile } from "../_lib/google.js";
import type { Mail } from "../_lib/mail.js";

const SECRET = "test-secret-test-secret-test-secret";

function setup(opts: { google?: boolean; mail?: boolean } = {}) {
  const store = new MemoryStore();
  const sent: Mail[] = [];
  // a pretend Google: the "credential" is simply JSON describing the person
  const verifyGoogle = async (credential: string): Promise<GoogleProfile> => {
    if (!credential.startsWith("{")) throw new Error("bad token");
    return JSON.parse(credential) as GoogleProfile;
  };
  const handle = createApi(store, {
    secret: SECRET,
    googleClientId: opts.google === false ? undefined : "client-id-123",
    verifyGoogle: opts.google === false ? undefined : verifyGoogle,
    sendMail: opts.mail === false ? undefined : async (m) => void sent.push(m),
    appUrl: opts.mail === false ? undefined : "https://example.test",
  });
  const person = () => {
    let cookie: string | undefined;
    return async (method: string, path: string, body?: unknown): Promise<ApiResponse> => {
      const out = await handle({ method, path, headers: { "x-sketchboard": "1" }, cookies: cookie ? { [COOKIE]: cookie } : {}, body, secure: true });
      const set = out.headers?.["Set-Cookie"];
      if (typeof set === "string") cookie = set.split(";")[0].slice(COOKIE.length + 1) || undefined;
      return out;
    };
  };
  return { store, sent, person };
}
const g = (o: Partial<GoogleProfile> = {}) => JSON.stringify({ sub: "g-1", email: "Gita@Example.com", emailVerified: true, name: "Gita Rao", picture: "https://lh3.example/pic.jpg", ...o });
const reg = (name: string, email: string, password = "password one") => ({ name, email, password });
const linkOf = (m: Mail) => m.text.match(/#\/reset\/([\w-]+)/)![1];

test("sign-in screen can ask what is available", async () => {
  const on = setup().person();
  assert.deepEqual((await on("GET", "/auth/config")).body, { google: "client-id-123", resetEmail: true });
  const off = setup({ google: false, mail: false }).person();
  assert.deepEqual((await off("GET", "/auth/config")).body, { google: null, resetEmail: false });
});

test("Google: a new person gets an account and is signed in", async () => {
  const { person, store } = setup();
  const p = person();
  const r = await p("POST", "/auth/google", { credential: g() });
  assert.equal(r.status, 200);
  const u = (r.body as any).user;
  assert.equal(u.email, "gita@example.com"); // lower-cased
  assert.equal(u.name, "Gita Rao");
  assert.equal(u.google, true);
  assert.equal(u.hasPassword, false);
  assert.equal(u.avatar, "https://lh3.example/pic.jpg");
  assert.equal(((await p("GET", "/auth/me")).body as any).user.id, u.id); // the session cookie works
  assert.equal((await store.findUserByEmail("gita@example.com"))?.passwordHash, null);
  assert.equal(JSON.stringify(r.body).includes("passwordHash"), false);
});

test("Google: signing in again, or with an existing e-mail, uses the same account", async () => {
  const { person } = setup();
  const a = person();
  const id = ((await a("POST", "/auth/register", reg("Gita", "gita@example.com"))).body as any).user.id;
  const b = person();
  const r = await b("POST", "/auth/google", { credential: g() });
  assert.equal((r.body as any).user.id, id); // linked, not duplicated
  assert.equal((r.body as any).user.google, true);
  assert.equal((r.body as any).user.hasPassword, true); // the password still works too
  assert.equal(((await person()("POST", "/auth/login", { email: "gita@example.com", password: "password one" })).body as any).user.id, id);
});

test("Google: bad tokens, unverified e-mail and a different Google account for the same e-mail are refused", async () => {
  const { person } = setup();
  const p = person();
  assert.equal((await p("POST", "/auth/google", { credential: "x".repeat(40) })).status, 401);
  assert.equal((await p("POST", "/auth/google", { credential: g({ emailVerified: false }) })).status, 401);
  assert.equal((await p("POST", "/auth/google", { credential: "short" })).status, 400);
  assert.equal((await p("POST", "/auth/google", { credential: g() })).status, 200);
  assert.equal((await person()("POST", "/auth/google", { credential: g({ sub: "someone-else" }) })).status, 401);
  assert.equal(((await p("GET", "/auth/me")).status), 200);
});

test("Google: not set up gives a clear 503", async () => {
  const r = await setup({ google: false }).person()("POST", "/auth/google", { credential: g() });
  assert.equal(r.status, 503);
  assert.equal((r.body as any).error.code, "google_not_configured");
});

test("an unsafe picture address is not stored", async () => {
  const p = setup().person();
  const r = await p("POST", "/auth/google", { credential: g({ picture: "javascript:alert(1)" }) });
  assert.equal((r.body as any).user.avatar, undefined);
});

test("a Google-only account cannot sign in with a password, and is told why", async () => {
  const { person } = setup();
  await person()("POST", "/auth/google", { credential: g() });
  const r = await person()("POST", "/auth/login", { email: "gita@example.com", password: "anything at all" });
  assert.equal(r.status, 401);
  assert.equal((r.body as any).error.code, "use_google");
});

test("forgot password: same answer for everyone, one e-mail only for real accounts, link works once", async () => {
  const { person, sent, store } = setup();
  await person()("POST", "/auth/register", reg("Asha", "asha@example.com", "old password 1"));
  const p = person();
  const real = await p("POST", "/auth/forgot", { email: "asha@example.com" });
  const fake = await p("POST", "/auth/forgot", { email: "nobody@example.com" });
  assert.deepEqual(real.body, fake.body); // cannot tell them apart
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "asha@example.com");
  assert.match(sent[0].text, /https:\/\/example\.test\/#\/reset\//);
  const secret = linkOf(sent[0]);
  const u = (await store.findUserByEmail("asha@example.com"))!;
  assert.notEqual(u.resetHash, secret); // only a hash is stored, never the link's secret

  const r = await p("POST", "/auth/reset", { token: secret, password: "brand new pass 2" });
  assert.equal(r.status, 200);
  assert.equal(((await p("GET", "/auth/me")).body as any).user.email, "asha@example.com"); // signed in by the reset
  assert.equal((await person()("POST", "/auth/login", { email: "asha@example.com", password: "old password 1" })).status, 401);
  assert.equal((await person()("POST", "/auth/login", { email: "asha@example.com", password: "brand new pass 2" })).status, 200);
  assert.equal((await person()("POST", "/auth/reset", { token: secret, password: "third password 3" })).status, 400); // used up
});

test("forgot password: expired link, wrong link, short password, and no flooding", async () => {
  const { person, sent, store } = setup();
  await person()("POST", "/auth/register", reg("Asha", "asha@example.com"));
  const p = person();
  await p("POST", "/auth/forgot", { email: "asha@example.com" });
  await p("POST", "/auth/forgot", { email: "asha@example.com" }); // within a minute: no second mail
  assert.equal(sent.length, 1);
  const secret = linkOf(sent[0]);
  assert.equal((await p("POST", "/auth/reset", { token: secret, password: "short" })).status, 400);
  assert.equal((await p("POST", "/auth/reset", { token: "x".repeat(43), password: "long enough pw" })).status, 400);
  const u = (await store.findUserByEmail("asha@example.com"))!;
  await store.updateUser(u.id, { resetExp: Date.now() - 1000 });
  assert.equal((await p("POST", "/auth/reset", { token: secret, password: "long enough pw" })).status, 400); // expired
  await store.updateUser(u.id, { resetSentAt: Date.now() - 61_000 });
  await p("POST", "/auth/forgot", { email: "asha@example.com" });
  assert.equal(sent.length, 2); // after a minute a new one is allowed
});

test("forgot password: a Google-only person can use it to add a password", async () => {
  const { person, sent } = setup();
  await person()("POST", "/auth/google", { credential: g() });
  const p = person();
  await p("POST", "/auth/forgot", { email: "gita@example.com" });
  await p("POST", "/auth/reset", { token: linkOf(sent[0]), password: "my new password" });
  const me = ((await p("GET", "/auth/me")).body as any).user;
  assert.equal(me.hasPassword, true);
  assert.equal(me.google, true);
});

test("forgot password: not set up gives a clear 503", async () => {
  const r = await setup({ mail: false }).person()("POST", "/auth/forgot", { email: "a@example.com" });
  assert.equal(r.status, 503);
});

test("profile: change name; change password needs the current one, a Google-only account does not", async () => {
  const { person } = setup();
  const p = person();
  await p("POST", "/auth/register", reg("Asha", "asha@example.com", "old password 1"));
  assert.equal(((await p("PATCH", "/auth/me", { name: "  Asha K  " })).body as any).user.name, "Asha K");
  assert.equal((await p("PATCH", "/auth/me", { name: "   " })).status, 400);
  assert.equal((await p("POST", "/auth/password", { current: "wrong", password: "new password 2" })).status, 400);
  assert.equal((await p("POST", "/auth/password", { password: "new password 2" })).status, 400); // current missing
  assert.equal((await p("POST", "/auth/password", { current: "old password 1", password: "new password 2" })).status, 200);
  assert.equal((await person()("POST", "/auth/login", { email: "asha@example.com", password: "new password 2" })).status, 200);

  const q = person();
  await q("POST", "/auth/google", { credential: g() });
  assert.equal((await q("POST", "/auth/password", { password: "first password" })).status, 200);
  assert.equal((await person()("POST", "/auth/login", { email: "gita@example.com", password: "first password" })).status, 200);
  assert.equal((await person()("PATCH", "/auth/me", { name: "x" })).status, 401); // signed out
});

test("delete account: needs the e-mail typed, removes boards too, and ends the session", async () => {
  const { person, store } = setup();
  const p = person(), other = person();
  const id = ((await p("POST", "/auth/register", reg("Asha", "asha@example.com"))).body as any).user.id;
  await other("POST", "/auth/register", reg("Bo", "bo@example.com"));
  await p("POST", "/boards", { name: "mine" });
  await other("POST", "/boards", { name: "theirs" });
  assert.equal((await p("DELETE", "/auth/me", { confirm: "wrong@example.com" })).status, 400);
  assert.equal((await store.listBoards(id)).length, 1);
  const r = await p("DELETE", "/auth/me", { confirm: "ASHA@example.com" });
  assert.equal(r.status, 204);
  assert.match(String((r.headers as any)["Set-Cookie"]), /Max-Age=0/);
  assert.equal(await store.findUserById(id), null);
  assert.equal((await store.listBoards(id)).length, 0);
  assert.equal(((await other("GET", "/boards")).body as any).boards.length, 1); // the other person is untouched
  assert.equal((await person()("POST", "/auth/login", { email: "asha@example.com", password: "password one" })).status, 401);
});
