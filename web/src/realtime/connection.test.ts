import { test } from "node:test";
import assert from "node:assert/strict";
import type { RtChannel, RtClient } from "./connection";
import type { Obj, Op } from "./protocol";

// The store and connection code expect a browser; give them the little they touch.
const g = globalThis as Record<string, unknown>;
g.window = { addEventListener() {}, innerWidth: 1200, innerHeight: 800, location: { hash: "" }, matchMedia: () => ({ matches: false, addEventListener() {} }) };
g.document = { documentElement: { classList: { toggle() {}, add() {}, remove() {} } } };
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// ---- a tiny fake of Ably: a "cloud" that connects fake clients and passes messages between them ----
class Cloud {
  clients: FakeClient[] = [];
  log: { channel: string; name: string; data: unknown; from: string }[] = [];
}
class FakeChannel implements RtChannel {
  subs = new Map<string, ((m: { name: string; data: unknown; connectionId: string }) => void)[]>();
  handlers = new Map<string, ((c: { resumed?: boolean; reason?: { code?: number } | null }) => void)[]>();
  members = new Map<string, unknown>();
  presenceCbs: (() => void)[] = [];
  constructor(public name: string, public owner: FakeClient) {}
  subscribe(name: string, cb: (m: { name: string; data: unknown; connectionId: string }) => void) {
    this.subs.set(name, [...(this.subs.get(name) ?? []), cb]);
    return undefined;
  }
  on(ev: string, cb: (c: { resumed?: boolean }) => void) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), cb]);
    if (ev === "attached") queueMicrotask(() => cb({ resumed: false })); // Ably attaches shortly after subscribing
    return undefined;
  }
  async publish(name: string, data: unknown) {
    if (this.owner.denyPublish.has(this.name)) throw new Error("no publish right");
    this.owner.cloud.log.push({ channel: this.name, name, data, from: this.owner.id });
    for (const c of this.owner.cloud.clients) {
      if (c === this.owner) continue; // echoMessages: false
      for (const cb of c.channels_.get(this.name)?.subs.get(name) ?? []) cb({ name, data, connectionId: this.owner.id });
    }
  }
  presence = {
    enter: async (data: unknown) => {
      this.members.set(this.owner.id, data);
      for (const c of this.owner.cloud.clients) for (const cb of c.channels_.get(this.name)?.presenceCbs ?? []) cb();
    },
    get: async () => {
      const out: { connectionId: string; data: never }[] = [];
      for (const c of this.owner.cloud.clients) {
        const d = c.channels_.get(this.name)?.members.get(c.id);
        if (d) out.push({ connectionId: c.id, data: d as never });
      }
      return out;
    },
    subscribe: (cb: () => void) => void this.presenceCbs.push(cb),
  };
}
let nextId = 1;
class FakeClient implements RtClient {
  id = `conn${nextId++}`;
  channels_ = new Map<string, FakeChannel>();
  denyPublish = new Set<string>();
  closed = false;
  stateCbs: ((c: { current: string }) => void)[] = [];
  constructor(public cloud: Cloud) {
    cloud.clients.push(this);
  }
  connection = {
    id: this.id,
    on: (cb: (c: { current: string }) => void) => {
      this.stateCbs.push(cb);
      queueMicrotask(() => cb({ current: "connected" }));
    },
    close: () => {},
    connect: () => {},
  };
  channels = {
    get: (name: string) => {
      const ch = this.channels_.get(name) ?? new FakeChannel(name, this);
      this.channels_.set(name, ch);
      return ch;
    },
  };
  close() {
    this.closed = true;
    this.cloud.clients = this.cloud.clients.filter((c) => c !== this);
    for (const c of this.cloud.clients) for (const ch of c.channels_.values()) ch.presenceCbs.forEach((cb) => cb());
  }
}

const sticky = (id: string, text = id): Obj => ({ id, type: "sticky", x: 0, y: 0, width: 100, height: 100, rotation: 0, text });
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

test("two screens: edits cross in both directions, the board loads from the server, bad edits are ignored", async () => {
  const { useBoard } = await import("../store");
  const conn = await import("./connection");
  const cloud = new Cloud();
  const server: Obj[] = [sticky("old")]; // what the database holds
  const join = (role: "owner" | "editor" | "viewer", id: string) => async () => ({ token: "t", clientId: id, role, boardId: "b1", name: "Board", you: id });

  // --- screen A (the owner) ---
  conn.setClientFactoryForTests(async (opts) => {
    const c = new FakeClient(cloud);
    opts.authCallback({}, () => {});
    return c;
  });
  useBoard.setState({ boardId: "b1", mode: "owned", role: "solo", objects: server as never, loaded: true });
  conn.startRealtime("b1", join("owner", "alice"), async () => server as never);
  await wait();
  const A = useBoard.getState();
  assert.equal(A.connection, "live");
  assert.equal(A.role, "owner");
  assert.deepEqual(A.objects.map((o) => o.id), ["old"]);

  // my own change goes out on the board channel as one "edit" message
  conn.sendOps([{ op: "add", obj: sticky("a1") }]);
  await wait(200);
  const sent = cloud.log.filter((l) => l.channel === "board:b1");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, "edit");
  assert.deepEqual((sent[0].data as { ops: Op[] }).ops[0], { op: "add", obj: sticky("a1") });

  // --- a second client (editor) listens on the same channel: simulate what its connection code receives ---
  const peer = new FakeClient(cloud);
  const peerEdits = peer.channels.get("board:b1") as FakeChannel;
  const received: Op[][] = [];
  peerEdits.subscribe("edit", (m) => received.push((m.data as { ops: Op[] }).ops));
  conn.sendOps([{ op: "set", id: "a1", fields: { text: "changed" } }]);
  await wait(200);
  assert.equal(received.length, 1); // the editor sees it

  // an edit from the peer arrives at A: applied to the board and the screen's undo history is untouched
  const peerCur = peer.channels.get("cur:b1") as FakeChannel;
  await peerEdits.publish("edit", { ops: [{ op: "add", obj: sticky("p1") }] });
  assert.ok(useBoard.getState().objects.some((o) => o.id === "p1"));
  assert.equal(useBoard.getState().past.length, 0);

  // a malformed edit (bad type) from a misbehaving client is ignored
  await peerEdits.publish("edit", { ops: [{ op: "add", obj: { id: "evil", type: "virus", x: 0, y: 0, width: 1, height: 1, rotation: 0 } }] });
  assert.ok(!useBoard.getState().objects.some((o) => o.id === "evil"));
  await peerEdits.publish("edit", { ops: "nope" });

  // a pointer and "who is here"
  await peerCur.presence.enter({ name: "Bob", color: "#2F9E44", role: "editor" });
  await peerCur.publish("c", { x: 10, y: 20 });
  await wait();
  const s = useBoard.getState();
  assert.deepEqual(s.peers.map((p) => p.name), ["Bob"]);
  assert.deepEqual(s.cursors[peer.id] && { x: s.cursors[peer.id].x, y: s.cursors[peer.id].y }, { x: 10, y: 20 });

  // live drawing: Bob's stroke appears while he draws (pieces are added up), garbage is ignored, and "done" removes it
  await peerCur.publish("d", { id: "st1", p: [0, 0, 5, 5], c: "#E03131", w: 4, a: 1 });
  await peerCur.publish("d", { id: "st1", p: [10, 10] });
  await peerCur.publish("d", { id: "st1", p: [1, 2, 3], c: "#E03131" }); // odd number of values: refused
  await peerCur.publish("d", { id: "st2", p: [1, 1], c: "red" }); // bad colour: refused
  await wait();
  const dr = useBoard.getState().drafts[peer.id];
  assert.deepEqual(dr && { points: dr.points, color: dr.color, width: dr.width }, { points: [0, 0, 5, 5, 10, 10], color: "#E03131", width: 4 });
  await peerCur.publish("d", { id: "st1", p: [], done: true });
  await wait();
  assert.equal(useBoard.getState().drafts[peer.id], undefined);
  // my own drawing is sent in pieces: the first piece waits for nothing, the rest are batched, "done" flushes everything
  const sentD: unknown[] = [];
  peerCur.subscribe("d", (m) => sentD.push(m.data));
  conn.liveStroke("mine", { c: "#2F9E44", w: 3, a: 1 }, [0, 0]);
  conn.liveStroke("mine", { c: "#2F9E44", w: 3, a: 1 }, [1, 1]); // within 80 ms: kept back
  conn.liveStroke("mine", { c: "#2F9E44", w: 3, a: 1 }, [2, 2], true);
  await wait();
  assert.deepEqual(sentD.map((d) => (d as { p: number[] }).p), [[0, 0], [1, 1, 2, 2], []]);
  assert.equal((sentD[2] as { done?: boolean }).done, true);

  // follow mode: Bob tells where he looks; garbage is ignored; when I follow him and he leaves, I stop following
  await peerCur.publish("v", { cx: 100, cy: 50, s: 2 });
  await peerCur.publish("v", { cx: "x", cy: 1, s: 1 });
  await peerCur.publish("v", { cx: 1, cy: 1, s: -3 });
  await wait();
  assert.deepEqual(
    useBoard.getState().views[peer.id] && { cx: useBoard.getState().views[peer.id].cx, cy: useBoard.getState().views[peer.id].cy, s: useBoard.getState().views[peer.id].s },
    { cx: 100, cy: 50, s: 2 },
  );
  useBoard.getState().follow(peer.id);
  const { applyFollowView } = await import("../store");
  applyFollowView(useBoard.getState().views[peer.id], 1000, 600);
  assert.equal(useBoard.getState().following, peer.id); // applying his view does not end following
  assert.deepEqual(useBoard.getState().viewport, { scale: 2, x: 300, y: 200 });
  useBoard.getState().setViewport({ scale: 1, x: 0, y: 0 }); // I move myself: stop following
  assert.equal(useBoard.getState().following, null);
  useBoard.getState().follow(peer.id);

  // when Bob leaves, his pointer and avatar go away
  peer.close();
  await wait();
  assert.deepEqual(useBoard.getState().peers, []);
  assert.equal(useBoard.getState().following, null);
  assert.deepEqual(useBoard.getState().views, {});

  conn.stopRealtime();
  assert.equal(useBoard.getState().connection, "off");
});

test("a viewer never publishes, even if the screen asks it to", async () => {
  const { useBoard } = await import("../store");
  const conn = await import("./connection");
  const cloud = new Cloud();
  conn.setClientFactoryForTests(async () => new FakeClient(cloud));
  useBoard.setState({ boardId: "b2", mode: "shared", sharedToken: "tok", role: "viewer", objects: [], loaded: false });
  conn.startRealtime("b2", async () => ({ token: "t", clientId: "g_x", role: "viewer", boardId: "b2", name: "B", you: "Guest" }), async () => [sticky("s1")] as never);
  await wait();
  assert.equal(useBoard.getState().connection, "live");
  assert.equal(useBoard.getState().role, "viewer");
  assert.deepEqual(useBoard.getState().objects.map((o) => o.id), ["s1"]); // loaded from the server
  conn.sendOps([{ op: "add", obj: sticky("sneaky") }]);
  await wait(200);
  assert.equal(cloud.log.filter((l) => l.channel === "board:b2").length, 0);
  conn.stopRealtime();
});

test("edits made before the board finished loading are kept and sent afterwards", async () => {
  const { useBoard } = await import("../store");
  const conn = await import("./connection");
  const cloud = new Cloud();
  conn.setClientFactoryForTests(async () => new FakeClient(cloud));
  useBoard.setState({ boardId: "b3", mode: "owned", role: "solo", objects: [], loaded: true });
  let release!: (o: Obj[]) => void;
  conn.startRealtime("b3", async () => ({ token: "t", clientId: "u", role: "owner", boardId: "b3", name: "B", you: "U" }), () => new Promise((r) => (release = r as never)) as never);
  await wait();
  conn.sendOps([{ op: "add", obj: sticky("early") }]); // typed while still connecting
  await wait(200);
  assert.equal(cloud.log.length, 0); // nothing sent yet
  release([sticky("db")]);
  await wait(200);
  const ids = useBoard.getState().objects.map((o) => o.id).sort();
  assert.deepEqual(ids, ["db", "early"]); // the database copy with our early edit laid on top
  assert.equal(cloud.log.filter((l) => l.channel === "board:b3").length, 1); // and now it was sent
  conn.stopRealtime();
});
