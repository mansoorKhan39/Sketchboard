import { nanoid } from "nanoid";
import { ApiError, type JoinInfo } from "../api";
import { flushSave, useBoard } from "../store";
import type { BoardObject } from "../types";
import { compact, createAssembler, toMessages } from "./chunks";
import type { ChunkMsg, CursorMsg, EditMsg, Op, PresenceData } from "./protocol";
import { checkOps } from "./validate";

// Live collaboration through Ably (ably.com), a service built for bad networks: if a WebSocket is blocked or keeps
// dropping, it quietly switches to plain HTTPS and keeps going, and it replays what you missed after a reconnect.
//
//   my change  -> `pending` -> published on channel "board:<id>" -> Ably tells every other person -> they apply it
//   the board  -> loaded from the server (the database) when we join, then the edits we missed are laid on top
//   saving     -> whoever edits saves the board to the server (see flushSave in store.ts)
//
// Every operation can safely be applied twice (see ops.ts), so replays and retries never duplicate anything.
// Who may do what is decided by the server: the pass it gives a viewer has no right to publish edits.

interface Session {
  boardId: string;
  fetchJoin: (previousClientId?: string) => Promise<JoinInfo>;
  fetchState: () => Promise<BoardObject[]>;
  join: JoinInfo | null;
  everLive: boolean;
  ready: boolean; // the board is loaded; edits from others are applied straight away
  syncing: boolean;
  buffer: Op[]; // edits from others that arrived before the board finished loading
}

// The small part of Ably that we use. Declared here so tests can plug in a fake.
interface Msg {
  name?: string;
  data?: unknown;
  connectionId?: string;
}
interface Member {
  connectionId: string;
  data?: Partial<PresenceData>;
}
export interface RtChannel {
  subscribe(name: string, cb: (m: Msg) => void): unknown;
  publish(name: string, data: unknown): Promise<unknown>;
  on(event: string, cb: (change: { resumed?: boolean; reason?: { code?: number; message?: string } | null }) => void): unknown;
  presence: {
    enter(data: PresenceData): Promise<unknown>;
    get(): Promise<Member[]>;
    subscribe(cb: () => void): unknown;
  };
}
export interface RtClient {
  connection: { id?: string; on(cb: (change: { current: string; reason?: { code?: number; message?: string } | null }) => void): unknown; close(): void; connect(): void };
  channels: { get(name: string, opts?: unknown): RtChannel };
  close(): void;
}
export type ClientFactory = (opts: { authCallback: (data: unknown, cb: (err: string | null, token: string | null) => void) => void }) => Promise<RtClient>;

const defaultFactory: ClientFactory = async (opts) => {
  const Ably = await import("ably"); // loaded only when a live board is opened, so the first page stays light
  return new Ably.Realtime({ ...opts, echoMessages: false, autoConnect: true }) as unknown as RtClient;
};
let factory: ClientFactory = defaultFactory;
export function setClientFactoryForTests(f: ClientFactory | null) {
  factory = f ?? defaultFactory;
}

let session: Session | null = null;
let client: RtClient | null = null;
let edits: RtChannel | null = null;
let cur: RtChannel | null = null;
let assemble = createAssembler();
let generation = 0; // bumps whenever we start/stop, so late callbacks from an old session can be ignored
let pending: { editId: string; ops: Op[] }[] = [];
let queue: Op[] = []; // changes waiting for the next send (changes within 60 ms go out together)
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
let myId = "";

const CONNECT_TIMEOUT_MS = 20_000; // never connected after this long: carry on alone (the board still saves normally)
const COLORS = ["#E03131", "#2F9E44", "#1971C2", "#F08C00", "#7048E8", "#0C8599", "#C2255C", "#5C940D"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const set = (p: Partial<ReturnType<typeof useBoard.getState>>) => useBoard.setState(p);
const roleNow = () => session?.join?.role ?? "viewer";

export const isActive = () => session !== null;

export function startRealtime(boardId: string, fetchJoin: (previousClientId?: string) => Promise<JoinInfo>, fetchState: () => Promise<BoardObject[]>) {
  stopRealtime();
  session = { boardId, fetchJoin, fetchState, join: null, everLive: false, ready: false, syncing: false, buffer: [] };
  set({ connection: "connecting", peers: [], cursors: {}, me: null, notice: "" });
  const gen = generation;
  giveUpTimer = setTimeout(() => {
    if (session && !session.everLive) giveUp(gen, "");
  }, CONNECT_TIMEOUT_MS);
  void connect(gen);
}

export function stopRealtime() {
  generation++;
  clearTimeout(flushTimer);
  clearTimeout(giveUpTimer);
  const old = client;
  client = edits = cur = null;
  session = null;
  pending = [];
  queue = [];
  assemble = createAssembler();
  myId = "";
  try {
    old?.close();
  } catch {
    /* ignore */
  }
  if (useBoard.getState().connection !== "off") set({ connection: "off", peers: [], cursors: {}, me: null });
}

async function connect(gen: number) {
  const s = session;
  if (!s) return;
  let first: JoinInfo;
  try {
    first = await s.fetchJoin();
  } catch (e) {
    // The website refusing us (not set up / not allowed) is final; a network error is worth retrying a little.
    if (e instanceof ApiError && e.code === "realtime_not_configured") return giveUp(gen, ""); // the server has no Ably key: work alone
    if (e instanceof ApiError && e.status !== 0 && e.status < 500) return giveUp(gen, e.message);
    if (gen === generation && session) setTimeout(() => void connect(gen), 2000);
    return;
  }
  if (!session || gen !== generation) return;
  s.join = first;

  let firstToken: string | null = first.token;
  let c: RtClient;
  try {
    c = await factory({
      // Ably calls this whenever it needs a pass: now, and again before the old one runs out.
      authCallback: (_data, cb) => {
        if (firstToken) {
          const t = firstToken;
          firstToken = null;
          return cb(null, t);
        }
        s.fetchJoin(s.join?.clientId).then(
          (j) => {
            s.join = j;
            cb(null, j.token);
          },
          (e) => cb(e instanceof Error ? e.message : "Could not renew the pass.", null),
        );
      },
    });
  } catch {
    return giveUp(gen, "");
  }
  if (!session || gen !== generation) {
    c.close();
    return;
  }
  client = c;
  edits = c.channels.get(`board:${first.boardId}`, { params: { rewind: "60s" } }); // rewind: also replay the last minute of edits
  cur = c.channels.get(`cur:${first.boardId}`);

  c.connection.on((change) => {
    if (gen !== generation) return;
    if (change.current === "connected") {
      myId = c.connection.id ?? myId;
    } else if (change.current === "failed") {
      giveUp(gen, "Could not connect to this board.");
    } else if (["disconnected", "suspended", "connecting"].includes(change.current) && session?.everLive) {
      set({ connection: "offline" });
    }
    if (change.current === "connected" && session?.everLive && session.ready) set({ connection: "live" });
  });

  edits.subscribe("edit", (m) => onRemote(gen, (m.data as EditMsg | undefined)?.ops));
  edits.subscribe("chunk", (m) => onRemote(gen, assemble(m.connectionId ?? "?", m.data as ChunkMsg)));
  edits.on("attached", (change) => {
    // first time, or Ably could not replay everything we missed: load the board again to be sure
    if (gen === generation && (!session?.ready || change.resumed === false)) void sync(gen);
  });
  edits.on("failed", (change) => giveUp(gen, change.reason?.code === 40160 ? "You do not have access to this board." : "Could not connect to this board."));

  cur.subscribe("c", (m) => {
    const d = m.data as CursorMsg | undefined;
    if (gen !== generation || !m.connectionId || m.connectionId === myId || typeof d?.x !== "number" || typeof d?.y !== "number") return;
    set({ cursors: { ...useBoard.getState().cursors, [m.connectionId]: { x: d.x, y: d.y, at: Date.now() } } });
  });
  cur.presence.subscribe(() => void refreshPeers(gen));
}

// Load the true board from the server, lay the edits we missed and our own unconfirmed edits on top, then go live.
async function sync(gen: number) {
  const s = session;
  if (!s || s.syncing) return;
  s.syncing = true;
  s.ready = false;
  try {
    const objects = await s.fetchState();
    if (gen !== generation || !session) return;
    const missed = s.buffer;
    s.buffer = [];
    useBoard.getState().loadSnapshot(objects, [...missed, ...pending.flatMap((p) => p.ops)]);
    s.ready = true;
    s.everLive = true;
    clearTimeout(giveUpTimer);
    const join = s.join!;
    const me = { id: client?.connection.id ?? myId, name: join.you, color: colorFor(join.clientId), role: join.role };
    myId = me.id;
    set({ connection: "live", me, role: join.role, notice: "" });
    void cur?.presence.enter({ name: me.name, color: me.color, role: me.role }).catch(() => {});
    void refreshPeers(gen);
    for (const p of pending) void publish(p.editId, p.ops); // anything not confirmed yet is sent again (safe: ops are repeatable)
  } catch (e) {
    if (gen !== generation) return;
    if (e instanceof ApiError && e.status !== 0 && e.status < 500) return giveUp(gen, e.message);
    setTimeout(() => {
      if (gen === generation && session) {
        session.syncing = false;
        void sync(gen);
      }
    }, 2000);
    return;
  } finally {
    if (gen === generation && session) session.syncing = false;
  }
}

function onRemote(gen: number, ops: unknown) {
  if (gen !== generation || !session || !Array.isArray(ops) || !ops.length) return;
  if (!session.ready) {
    session.buffer.push(...(ops as Op[]));
    return;
  }
  const store = useBoard.getState();
  // The server decides who may publish, but we still check what arrives: a bad edit is ignored, never applied.
  const ids = new Set(store.objects.map((o) => o.id));
  if (checkOps(ops, (id) => ids.has(id), store.objects.length)) return;
  store.applyRemoteOps(ops as Op[]);
}

async function refreshPeers(gen: number) {
  const ch = cur;
  if (!ch || gen !== generation) return;
  try {
    const members = await ch.presence.get();
    if (gen !== generation) return;
    const seen = new Set<string>();
    const peers = members
      .filter((m) => m.connectionId !== myId && !seen.has(m.connectionId) && seen.add(m.connectionId))
      .map((m) => ({
        id: m.connectionId,
        name: String(m.data?.name ?? "Guest").slice(0, 40),
        color: typeof m.data?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(m.data.color) ? m.data.color : "#1971C2",
        role: (["owner", "editor", "viewer"].includes(String(m.data?.role)) ? m.data?.role : "viewer") as PresenceData["role"],
      }));
    const ids = new Set(peers.map((p) => p.id));
    const cursors = useBoard.getState().cursors;
    set({ peers, cursors: Object.fromEntries(Object.entries(cursors).filter(([id]) => ids.has(id))) });
  } catch {
    /* the next presence change tries again */
  }
}

function giveUp(gen: number, message: string) {
  if (gen !== generation) return;
  const wasLive = session?.everLive ?? false;
  stopRealtime();
  set({ notice: message || (useBoard.getState().mode === "shared" ? "Could not connect to this board." : "") });
  // we were never live: go back to normal saving so nothing is lost
  if (!wasLive) void flushSave();
}

async function publish(editId: string, ops: Op[]) {
  const ch = edits;
  const gen = generation;
  if (!ch || !session?.ready || roleNow() === "viewer") return;
  try {
    for (const m of toMessages(ops, editId)) await ch.publish(m.name, m.data);
    if (gen === generation) pending = pending.filter((p) => p.editId !== editId);
  } catch {
    /* stays in `pending`; it is sent again after the next sync */
  }
}

// Called by the store after every change made on this screen.
export function sendOps(ops: Op[]) {
  if (!session || !ops.length || roleNow() === "viewer") return;
  queue.push(...ops);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, 60);
}

function flushQueue() {
  const all = compact(queue);
  queue = [];
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const editId = nanoid(10);
    pending.push({ editId, ops: chunk });
    void publish(editId, chunk); // if we are not live yet it simply waits in `pending`
  }
}

let lastCursor = 0;
export function sendCursor(x: number, y: number) {
  const now = Date.now();
  if (now - lastCursor < 100 || !cur || useBoard.getState().connection !== "live") return;
  lastCursor = now;
  void cur.publish("c", { x, y } satisfies CursorMsg).catch(() => {});
}

// Only for tests: pretend the network dropped, so the reconnect path can be exercised.
export function dropSocketForTests() {
  client?.connection.close();
  setTimeout(() => client?.connection.connect(), 300);
}
