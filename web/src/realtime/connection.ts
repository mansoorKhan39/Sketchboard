import { nanoid } from "nanoid";
import { ApiError, type JoinInfo } from "../api";
import { flushSave, useBoard } from "../store";
import type { BoardObject } from "../types";
import type { ClientMsg, Op, ServerMsg } from "./protocol";

// Keeps one WebSocket open to the board's room and moves edits in both directions.
//
//   my change  -> queued in `pending` -> sent as an "edit" -> the room answers "ack" -> removed from `pending`
//   their change <- "edit" arrives <- applied to my board
//
// If the connection drops, `pending` keeps my unsent/unconfirmed edits. After reconnecting, the room sends the true
// board ("welcome"), my pending edits are applied on top of it and sent again. Because each operation can safely be
// applied twice, nothing is lost and nothing is duplicated.

interface Session {
  boardId: string;
  fetchJoin: () => Promise<JoinInfo>;
  everLive: boolean;
}

let session: Session | null = null;
let ws: WebSocket | null = null;
let generation = 0; // bumps whenever we start/stop, so late callbacks from an old session can be ignored
let pending: { editId: string; ops: Op[] }[] = [];
let sent = new Set<string>(); // editIds already sent on the current socket
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

const FATAL = new Set([4001, 4003, 4004]); // bad token, forbidden, board not found: retrying cannot help
const MAX_OPS_PER_EDIT = 200;

const set = (p: Partial<ReturnType<typeof useBoard.getState>>) => useBoard.setState(p);

export const isActive = () => session !== null;

export function startRealtime(boardId: string, fetchJoin: () => Promise<JoinInfo>) {
  stopRealtime();
  session = { boardId, fetchJoin, everLive: false };
  set({ connection: "connecting", peers: [], cursors: {}, me: null, notice: "" });
  void connect(generation);
}

export function stopRealtime() {
  generation++;
  clearTimeout(retryTimer);
  const old = ws;
  ws = null;
  session = null;
  pending = [];
  sent = new Set();
  retries = 0;
  try {
    old?.close(1000);
  } catch {
    /* ignore */
  }
  if (useBoard.getState().connection !== "off") set({ connection: "off", peers: [], cursors: {}, me: null });
}

async function connect(gen: number) {
  if (!session || gen !== generation) return;
  let join: JoinInfo;
  try {
    join = await session.fetchJoin();
  } catch (e) {
    // The website refusing us (not set up / not allowed) is final; a network error is worth retrying.
    return e instanceof ApiError && e.status !== 0 && e.status < 500 ? giveUp(gen, e.message) : onClosed(gen, 1006);
  }
  if (!session || gen !== generation) return;
  const sock = new WebSocket(`${join.wsUrl}?token=${encodeURIComponent(join.token)}`);
  ws = sock;
  sent = new Set();
  sock.onmessage = (ev) => {
    if (gen === generation && ws === sock) handle(JSON.parse(ev.data as string) as ServerMsg);
  };
  sock.onclose = (ev) => {
    if (gen === generation && ws === sock) {
      ws = null;
      onClosed(gen, ev.code);
    }
  };
}

function onClosed(gen: number, code: number) {
  if (!session || gen !== generation) return;
  if (FATAL.has(code)) return giveUp(gen, code === 4004 ? "This board no longer exists." : "You do not have access to this board.");
  // Never managed to connect: after a couple of tries, carry on alone (the board still saves normally).
  if (!session.everLive && retries >= 2) return giveUp(gen, "");
  set({ connection: session.everLive ? "offline" : "connecting", peers: [], cursors: {} });
  retryTimer = setTimeout(() => void connect(gen), Math.min(15_000, 1000 * 2 ** retries));
  retries++;
}

function giveUp(gen: number, message: string) {
  if (gen !== generation) return;
  const wasLive = session?.everLive ?? false;
  stopRealtime();
  set({ notice: message || (useBoard.getState().mode === "shared" ? "Could not connect to this board." : "") });
  // we were never live: go back to normal saving so nothing is lost
  if (!wasLive) void flushSave();
}

function handle(msg: ServerMsg) {
  const store = useBoard.getState();
  switch (msg.t) {
    case "welcome": {
      if (session) session.everLive = true;
      retries = 0;
      // the room's board + my edits that the room has not confirmed yet
      store.loadSnapshot(msg.objects as unknown as BoardObject[], pending.flatMap((p) => p.ops));
      set({
        connection: "live",
        me: msg.you,
        role: msg.you.role,
        peers: msg.peers.filter((p) => p.id !== msg.you.id),
        notice: "",
      });
      for (const p of pending) if (!sent.has(p.editId)) transmit(p.editId, p.ops);
      break;
    }
    case "ack":
      pending = pending.filter((p) => p.editId !== msg.editId);
      break;
    case "edit":
      store.applyRemoteOps(msg.ops);
      break;
    case "reject":
      pending = pending.filter((p) => p.editId !== msg.editId);
      set({ notice: msg.message }); // a fresh "welcome" follows and repairs the board
      break;
    case "presence": {
      const me = store.me?.id;
      const peers = msg.peers.filter((p) => p.id !== me);
      const ids = new Set(peers.map((p) => p.id));
      set({ peers, cursors: Object.fromEntries(Object.entries(store.cursors).filter(([id]) => ids.has(id))) });
      break;
    }
    case "cursor":
      set({ cursors: { ...store.cursors, [msg.from]: { x: msg.x, y: msg.y, at: Date.now() } } });
      break;
  }
}

function transmit(editId: string, ops: Op[]) {
  if (ws?.readyState === WebSocket.OPEN && useBoard.getState().connection === "live") {
    ws.send(JSON.stringify({ t: "edit", editId, ops } satisfies ClientMsg));
    sent.add(editId);
  }
}

// Called by the store after every change made on this screen.
export function sendOps(ops: Op[]) {
  if (!session || !ops.length) return;
  for (let i = 0; i < ops.length; i += MAX_OPS_PER_EDIT) {
    const chunk = ops.slice(i, i + MAX_OPS_PER_EDIT);
    const editId = nanoid(10);
    pending.push({ editId, ops: chunk });
    transmit(editId, chunk); // if we are not live yet it simply waits in `pending`
  }
}

let lastCursor = 0;
export function sendCursor(x: number, y: number) {
  const now = Date.now();
  if (now - lastCursor < 80 || ws?.readyState !== WebSocket.OPEN || useBoard.getState().connection !== "live") return;
  lastCursor = now;
  ws.send(JSON.stringify({ t: "cursor", x, y } satisfies ClientMsg));
}

// Only for tests: pretend the network dropped, so the reconnect path can be exercised.
export function dropSocketForTests() {
  ws?.close(4999);
}
