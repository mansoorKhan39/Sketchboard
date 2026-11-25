import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi, COOKIE, TRASH_DAYS } from "../_lib/core.js";
import { MemoryStore } from "../_lib/store.js";
import type { ApiResponse } from "../_lib/types.js";

const store = new MemoryStore();
const handle = createApi(store, { secret: "test-secret", ablyKey: "appId.keyId:key-secret" });
const client = () => {
  let cookie: string | undefined;
  return async (method: string, path: string, body?: unknown): Promise<ApiResponse> => {
    const out = await handle({ method, path, headers: { "x-sketchboard": "1" }, cookies: cookie ? { [COOKIE]: cookie } : {}, body, secure: true });
    const set = out.headers?.["Set-Cookie"];
    if (typeof set === "string") cookie = set.split(";")[0].slice(COOKIE.length + 1) || undefined;
    return out;
  };
};
const body = (r: ApiResponse) => r.body as any;

test("favourite, folder, trash, restore, and the 30-day purge", async () => {
  const send = client();
  await send("POST", "/auth/register", { name: "Maya", email: "maya@example.com", password: "long enough pass" });
  const id = body(await send("POST", "/boards", { name: "Plan" })).board.id as string;
  const other = body(await send("POST", "/boards", { name: "Other" })).board.id as string;

  assert.equal((await send("PATCH", `/boards/${id}`, {})).status, 400); // nothing to change
  const fav = await send("PATCH", `/boards/${id}`, { favorite: true, folder: "  Uni  " });
  assert.deepEqual([body(fav).favorite, body(fav).folder, body(fav).deletedAt], [true, "Uni", 0]);
  const listed = body(await send("GET", "/boards")).boards.find((b: any) => b.id === id);
  assert.deepEqual([listed.favorite, listed.folder], [true, "Uni"]);
  assert.equal(body(await send("PATCH", `/boards/${id}`, { folder: "" })).folder, ""); // "" = no folder
  assert.equal((await send("PATCH", `/boards/${id}`, { folder: "x".repeat(41) })).status, 400);

  // trash: the board stays in the list (marked), its share link stops working, restore brings it back
  await send("PUT", `/boards/${id}/share`, { enabled: true, right: "viewer" });
  const token = body(await send("GET", `/boards/${id}/share`)).share.token;
  assert.equal((await send("GET", `/share/${token}`)).status, 200);
  const t = await send("PATCH", `/boards/${id}`, { trashed: true });
  assert.ok(body(t).deletedAt > 0);
  assert.equal((await send("GET", `/share/${token}`)).status, 404);
  assert.equal(body(await send("GET", "/boards")).boards.length, 2);
  const back = await send("PATCH", `/boards/${id}`, { trashed: false });
  assert.equal(body(back).deletedAt, 0);
  assert.equal(body(await send("GET", `/boards/${id}/share`)).share.enabled, false); // sharing has to be switched on again on purpose

  // 30 days later the trash is emptied by itself, but only for old ones
  await send("PATCH", `/boards/${id}`, { trashed: true });
  await send("PATCH", `/boards/${other}`, { trashed: true });
  await store.updateBoard(id, { deletedAt: Date.now() - (TRASH_DAYS + 1) * 86400_000 });
  const ids = body(await send("GET", "/boards")).boards.map((b: any) => b.id);
  assert.deepEqual(ids, [other]);
  assert.equal((await send("GET", `/boards/${id}`)).status, 404);
  assert.equal((await send("DELETE", `/boards/${other}`)).status, 204); // "delete forever"
});

test("a duplicate does not copy the share link, the star or the trash mark", async () => {
  const send = client();
  await send("POST", "/auth/register", { name: "Noor", email: "noor@example.com", password: "long enough pass" });
  const id = body(await send("POST", "/boards", { name: "A" })).board.id as string;
  await send("PUT", `/boards/${id}/share`, { enabled: true, right: "editor" });
  await send("PATCH", `/boards/${id}`, { favorite: true, folder: "Work" });
  const copy = body(await send("POST", `/boards/${id}/duplicate`)).board;
  assert.deepEqual([copy.favorite, copy.folder, copy.deletedAt], [false, "Work", 0]);
  assert.equal(body(await send("GET", `/boards/${copy.id}/share`)).share, null);
});
