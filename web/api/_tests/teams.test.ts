import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, COOKIE } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import { roleOf, teamRoleOf } from "../_lib/collab.js";
import type { ApiResponse, BoardRec, TeamRec } from "../_lib/types.js";

function world() {
  const handle = createApi(new MemoryStore(), { secret: "s", ablyKey: "appId.keyId:key-secret" });
  const person = (name: string) => {
    let cookie: string | undefined;
    const email = `${name.toLowerCase()}@example.com`;
    const send = async (method: string, path: string, body?: unknown): Promise<ApiResponse> => {
      const out = await handle({ method, path, headers: { "x-sketchboard": "1" }, cookies: cookie ? { [COOKIE]: cookie } : {}, body, secure: true });
      const set = out.headers?.["Set-Cookie"];
      if (typeof set === "string") cookie = set.split(";")[0].slice(COOKIE.length + 1) || undefined;
      return out;
    };
    return { send, email, join: () => send("POST", "/auth/register", { name, email, password: "long enough pass" }) };
  };
  return { person };
}
const b = (r: ApiResponse) => r.body as any;

test("team roles map to board rights", () => {
  const team = { id: "t", name: "T", ownerId: "a", members: [{ userId: "a", role: "admin", addedAt: 0 }, { userId: "m", role: "member", addedAt: 0 }], invites: [], createdAt: 0 } as TeamRec;
  assert.equal(teamRoleOf(team, "a"), "owner");
  assert.equal(teamRoleOf(team, "m"), "editor");
  assert.equal(teamRoleOf(team, "x"), null);
  const board = { id: "b", ownerId: "z", teamId: "t", members: [{ userId: "m", role: "viewer", addedAt: 0 }] } as unknown as BoardRec;
  assert.equal(roleOf(board, "m", team), "editor"); // the better of viewer and team editor
  assert.equal(roleOf(board, "a", team), "owner");
  assert.equal(roleOf(board, "x", team), null);
  assert.equal(roleOf(board, "m", null), "viewer"); // not in the team any more: only the named right
});

test("a team: create, invite, boards visible to members, admin rights, leaving", async () => {
  const { person } = world();
  const ann = person("Ann"), ben = person("Ben"), cat = person("Cat"), out = person("Outsider");
  for (const p of [ann, ben, cat, out]) await p.join();

  const t = b(await ann.send("POST", "/teams", { name: "Design crew" })).team;
  assert.equal(t.you, "admin");
  // Ben joins as member, Cat is invited by e-mail before... (she has an account here, so she is added directly)
  assert.equal((await ann.send("PUT", `/teams/${t.id}/members`, { email: ben.email, role: "member" })).status, 200);
  assert.equal((await ann.send("PUT", `/teams/${t.id}/members`, { email: "later@example.com", role: "member" })).status, 200);
  assert.equal((await ben.send("PUT", `/teams/${t.id}/members`, { email: cat.email, role: "member" })).status, 403); // members cannot invite
  assert.equal((await out.send("GET", `/teams/${t.id}`)).status, 404); // strangers do not see it exist

  // a board made inside the team is visible to Ben as editor, not to the outsider
  const bd = b(await ann.send("POST", "/boards", { name: "Brand board", teamId: t.id })).board;
  const benList = b(await ben.send("GET", "/boards"));
  assert.equal(benList.shared.length, 1);
  assert.equal(benList.shared[0].role, "editor");
  assert.equal(benList.shared[0].teamName, "Design crew");
  assert.equal(benList.teams.length, 1);
  assert.equal(b(await out.send("GET", "/boards")).shared.length, 0);
  assert.equal((await out.send("GET", `/boards/${bd.id}`)).status, 404);
  assert.equal((await ben.send("PUT", `/boards/${bd.id}`, { objects: [] })).status, 200); // member can save
  assert.equal((await ben.send("PATCH", `/boards/${bd.id}`, { name: "x" })).status, 403); // but not manage

  // the person who wasn't a user yet gets the team when she signs up
  const later = person("Later");
  await later.join();
  assert.equal(b(await later.send("GET", "/boards")).teams.length, 1);

  // a board can only be moved into a team you belong to; the owner can move it back
  const mine = b(await ben.send("POST", "/boards", { name: "Ben's" })).board;
  assert.equal((await ben.send("PATCH", `/boards/${mine.id}`, { teamId: "nope" })).status, 404);
  assert.equal((await ben.send("PATCH", `/boards/${mine.id}`, { teamId: t.id })).status, 200);
  assert.equal(b(await ann.send("GET", "/boards")).shared.length, 1); // Ann (admin) now sees Ben's board in the team
  assert.equal((await ann.send("PATCH", `/boards/${mine.id}`, { teamId: "" })).status, 403); // only the maker may move it
  assert.equal((await ben.send("PATCH", `/boards/${mine.id}`, { teamId: "" })).status, 200);

  // admin copy of a team board becomes the admin's own personal board
  const dup = b(await ann.send("POST", `/boards/${bd.id}/duplicate`)).board;
  const got = b(await ann.send("GET", `/boards/${dup.id}`)).board;
  assert.equal(got.teamId, "");

  // the last admin cannot leave; a member can
  assert.equal((await ann.send("DELETE", `/teams/${t.id}/members/${ann.email}`)).status, 404);
  const annId = b(await ann.send("GET", `/teams/${t.id}`)).team.members.find((m: any) => m.name === "Ann").userId;
  assert.equal((await ann.send("DELETE", `/teams/${t.id}/members/${annId}`)).status, 400);
  const benId = b(await ann.send("GET", `/teams/${t.id}`)).team.members.find((m: any) => m.name === "Ben").userId;
  assert.equal((await ben.send("DELETE", `/teams/${t.id}/members/${benId}`)).status, 200);
  assert.equal(b(await ben.send("GET", "/boards")).shared.length, 0); // Ben lost access

  // deleting the team makes its boards personal again
  assert.equal((await ann.send("DELETE", `/teams/${t.id}`)).status, 204);
  assert.equal(b(await ann.send("GET", "/boards")).teams.length, 0);
  assert.equal(b(await ann.send("GET", `/boards/${bd.id}`)).board.teamId, "");
});
