import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, COOKIE } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import { findMentioned, handleOf } from "../_lib/collab.js";
import type { ApiResponse } from "../_lib/types.js";

const KEY = "appId.keyId:key-secret";
function world() {
  const mails: { to: string; subject: string; text: string }[] = [];
  const handle = createApi(new MemoryStore(), { secret: "s", ablyKey: KEY, appUrl: "https://app.test", sendMail: async (m) => void mails.push(m) });
  const person = (name: string, email = `${name.toLowerCase()}@example.com`) => {
    let cookie: string | undefined;
    const send = async (method: string, path: string, body?: unknown): Promise<ApiResponse> => {
      const out = await handle({ method, path, headers: { "x-sketchboard": "1" }, cookies: cookie ? { [COOKIE]: cookie } : {}, body, secure: true });
      const set = out.headers?.["Set-Cookie"];
      if (typeof set === "string") cookie = set.split(";")[0].slice(COOKIE.length + 1) || undefined;
      return out;
    };
    return { send, email, name, join: async () => send("POST", "/auth/register", { name, email, password: "long enough pass" }) };
  };
  return { mails, person };
}
const b = (r: ApiResponse) => r.body as any;

test("invite by e-mail: roles decide who can read, save and join", async () => {
  const { mails, person } = world();
  const owner = person("Olivia"), ed = person("Eddie"), view = person("Vera"), stranger = person("Sam");
  for (const p of [owner, ed, view, stranger]) await p.join();
  const id = b(await owner.send("POST", "/boards", { name: "Team plan", objects: [] })).board.id as string;

  const r1 = await owner.send("PUT", `/boards/${id}/members`, { email: "EDDIE@example.com", role: "editor" });
  assert.equal(r1.status, 200);
  assert.equal(b(r1).emailed, true);
  assert.equal(mails.length, 1);
  assert.match(mails[0].text, /https:\/\/app\.test\/#\/board\//);
  await owner.send("PUT", `/boards/${id}/members`, { email: "vera@example.com", role: "viewer" });

  // the editor sees it in "shared", opens it, saves it and gets an editor pass
  const list = b(await ed.send("GET", "/boards"));
  assert.equal(list.shared.length, 1);
  assert.deepEqual([list.shared[0].role, list.shared[0].ownerName], ["editor", "Olivia"]);
  assert.equal(b(await ed.send("GET", `/boards/${id}`)).board.role, "editor");
  assert.equal((await ed.send("PUT", `/boards/${id}`, { objects: [] })).status, 200);
  assert.equal(b(await ed.send("POST", `/boards/${id}/join`)).role, "editor");

  // the viewer can read and join as viewer, but not save, rename or invite
  assert.equal((await view.send("GET", `/boards/${id}`)).status, 200);
  assert.equal((await view.send("PUT", `/boards/${id}`, { objects: [] })).status, 403);
  assert.equal(b(await view.send("POST", `/boards/${id}/join`)).role, "viewer");
  assert.equal((await view.send("PATCH", `/boards/${id}`, { name: "x" })).status, 403);
  assert.equal((await ed.send("PUT", `/boards/${id}/members`, { email: "sam@example.com", role: "editor" })).status, 403);
  assert.equal((await ed.send("DELETE", `/boards/${id}`)).status, 403);
  assert.equal((await ed.send("POST", `/boards/${id}/duplicate`)).status, 403);

  // somebody who is not on the board cannot even tell that it exists
  for (const [m, p] of [["GET", `/boards/${id}`], ["POST", `/boards/${id}/join`], ["GET", `/boards/${id}/members`], ["GET", `/boards/${id}/activity`]] as const) assert.equal((await stranger.send(m, p)).status, 404, p);
  assert.equal(b(await stranger.send("GET", "/boards")).shared.length, 0);

  // e-mail addresses and pending invites are for the owner only
  const forOwner = b(await owner.send("GET", `/boards/${id}/members`));
  assert.deepEqual(forOwner.members.map((m: any) => [m.name, m.role, m.email]), [["Eddie", "editor", "eddie@example.com"], ["Vera", "viewer", "vera@example.com"]]);
  const forEditor = b(await ed.send("GET", `/boards/${id}/members`));
  assert.ok(forEditor.members.every((m: any) => m.email === undefined) && forEditor.invites.length === 0);
  assert.equal(forEditor.owner.name, "Olivia");
});

test("an invitation for an address with no account waits and is claimed on sign up", async () => {
  const { mails, person } = world();
  const owner = person("Olivia"), newbie = person("Nina");
  await owner.join();
  const id = b(await owner.send("POST", "/boards", { name: "Plan" })).board.id as string;
  const r = await owner.send("PUT", `/boards/${id}/members`, { email: "nina@example.com", role: "editor" });
  assert.deepEqual(b(r).invites, [{ email: "nina@example.com", role: "editor" }]);
  assert.match(mails[0].text, /Create a free account/);
  await newbie.join();
  const list = b(await newbie.send("GET", "/boards"));
  assert.equal(list.shared.length, 1);
  assert.equal(list.shared[0].role, "editor");
  assert.equal(b(await owner.send("GET", `/boards/${id}/members`)).invites.length, 0);
  // withdrawing an invitation
  await owner.send("PUT", `/boards/${id}/members`, { email: "later@example.com", role: "viewer" });
  const gone = await owner.send("DELETE", `/boards/${id}/invites/${encodeURIComponent("later@example.com")}`);
  assert.equal(b(gone).invites.length, 0);
});

test("change a role, remove a person, leave a board", async () => {
  const { person } = world();
  const owner = person("Olivia"), a = person("Aron"), c = person("Cleo");
  for (const p of [owner, a, c]) await p.join();
  const id = b(await owner.send("POST", "/boards", { name: "Plan" })).board.id as string;
  await owner.send("PUT", `/boards/${id}/members`, { email: "aron@example.com", role: "viewer" });
  await owner.send("PUT", `/boards/${id}/members`, { email: "cleo@example.com", role: "editor" });
  await owner.send("PUT", `/boards/${id}/members`, { email: "aron@example.com", role: "editor" }); // viewer -> editor
  assert.equal((await a.send("PUT", `/boards/${id}`, { objects: [] })).status, 200);
  const cleoId = b(await owner.send("GET", `/boards/${id}/members`)).members.find((m: any) => m.name === "Cleo").userId;
  assert.equal((await a.send("DELETE", `/boards/${id}/members/${cleoId}`)).status, 403); // a member cannot remove somebody else
  const aronId = b(await owner.send("GET", `/boards/${id}/members`)).members.find((m: any) => m.name === "Aron").userId;
  assert.equal((await a.send("DELETE", `/boards/${id}/members/${aronId}`)).status, 200); // but can leave
  assert.equal((await a.send("GET", `/boards/${id}`)).status, 404);
  await owner.send("DELETE", `/boards/${id}/members/${cleoId}`);
  assert.equal((await c.send("GET", `/boards/${id}`)).status, 404);
  assert.equal((await owner.send("PUT", `/boards/${id}/members`, { email: "olivia@example.com", role: "editor" })).status, 400); // yourself
  assert.equal((await owner.send("PUT", `/boards/${id}/members`, { email: "not-an-email", role: "editor" })).status, 400);
});

test("activity log records the changes people made", async () => {
  const { person } = world();
  const owner = person("Olivia"), a = person("Aron");
  await owner.join(); await a.join();
  const id = b(await owner.send("POST", "/boards", { name: "Plan" })).board.id as string;
  await owner.send("PUT", `/boards/${id}/members`, { email: "aron@example.com", role: "editor" });
  await a.send("POST", `/boards/${id}/versions`, { objects: [], label: "v1" });
  await owner.send("PATCH", `/boards/${id}`, { name: "Plan B" });
  const texts = b(await a.send("GET", `/boards/${id}/activity`)).activity.map((x: any) => x.text);
  assert.deepEqual(texts, ['Olivia renamed the board to "Plan B"', 'Aron saved a version "v1"', "Olivia added Aron as editor"]); // newest first
});

test("mentions and notifications", async () => {
  const { person } = world();
  const owner = person("Olivia"), a = person("Aron Khan", "aron@example.com"), v = person("Vera");
  for (const p of [owner, a, v]) await p.join();
  const id = b(await owner.send("POST", "/boards", { name: "Plan" })).board.id as string;
  await owner.send("PUT", `/boards/${id}/members`, { email: "aron@example.com", role: "editor" });
  await owner.send("PUT", `/boards/${id}/members`, { email: "vera@example.com", role: "viewer" });
  // being invited is a notification too
  const inv = b(await a.send("GET", "/notifications"));
  assert.equal(inv.unread, 1);
  assert.match(inv.notifications[0].text, /Olivia invited you to "Plan"/);
  assert.equal(inv.notifications[0].boardId, id);

  const r = await owner.send("POST", `/boards/${id}/mentions`, { handles: ["aron", "vera", "nobody", "olivia"], text: "please look" });
  assert.equal(b(r).notified, 2); // Aron and Vera; "nobody" is nobody and you do not notify yourself
  assert.equal(b(await v.send("GET", "/notifications")).unread, 2);
  assert.equal((await v.send("POST", `/boards/${id}/mentions`, { handles: ["aron"], text: "hi" })).status, 403); // viewers cannot comment
  await a.send("POST", "/notifications/read");
  const after = b(await a.send("GET", "/notifications"));
  assert.equal(after.unread, 0);
  assert.equal(after.notifications.length, 2);
  assert.equal((await person("Nobody").send("GET", "/notifications")).status, 401);
});

test("a duplicate board starts with no members, invites or activity", async () => {
  const { person } = world();
  const owner = person("Olivia"), a = person("Aron");
  await owner.join(); await a.join();
  const id = b(await owner.send("POST", "/boards", { name: "Plan" })).board.id as string;
  await owner.send("PUT", `/boards/${id}/members`, { email: "aron@example.com", role: "editor" });
  const copy = b(await owner.send("POST", `/boards/${id}/duplicate`)).board;
  assert.equal(b(await owner.send("GET", `/boards/${copy.id}/members`)).members.length, 0);
  assert.equal((await a.send("GET", `/boards/${copy.id}`)).status, 404);
});

test("a person who is trashed from view: members no longer see a trashed board", async () => {
  const { person } = world();
  const owner = person("Olivia"), a = person("Aron");
  await owner.join(); await a.join();
  const id = b(await owner.send("POST", "/boards", { name: "Plan" })).board.id as string;
  await owner.send("PUT", `/boards/${id}/members`, { email: "aron@example.com", role: "editor" });
  await owner.send("PATCH", `/boards/${id}`, { trashed: true });
  assert.equal(b(await a.send("GET", "/boards")).shared.length, 0);
  assert.equal((await a.send("POST", `/boards/${id}/join`)).status, 404);
});

test("@handles match whole names, or a first name that is unique", () => {
  const people = [{ id: "1", name: "Aron Khan" }, { id: "2", name: "Maya Ali" }, { id: "3", name: "Maya Shah" }];
  assert.equal(handleOf("Aron  Khan!"), "aronkhan");
  assert.deepEqual(findMentioned(["aron"], people), ["1"]);
  assert.deepEqual(findMentioned(["AronKhan"], people), ["1"]);
  assert.deepEqual(findMentioned(["maya"], people), []); // two Mayas: a guess would notify the wrong person
  assert.deepEqual(findMentioned(["mayaali", "zzz", ""], people), ["2"]);
});
