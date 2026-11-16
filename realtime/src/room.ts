import { DurableObject } from "cloudflare:workers";
import { CLOSE, type ClientMsg, type Obj, type Op, type Peer, type Role, type ServerMsg } from "./protocol";
import { checkOps } from "./validate";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  REALTIME_SECRET: string;
  API_BASE: string;
}

// What we remember about each connected person (kept by Cloudflare with the socket, survives hibernation).
interface Attachment {
  peerId: string;
  userId: string;
  name: string;
  color: string;
  role: Role;
}

const COLORS = ["#E03131", "#2F9E44", "#1971C2", "#F08C00", "#7048E8", "#0C8599", "#C2255C", "#5C940D"];
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const FLUSH_AFTER_MS = 5000; // save to the database this long after the first unsaved edit
const RETRY_MS = 10_000;
const MAX_MESSAGE = 256_000;
const EDITS_PER_SECOND = 20; // sustained; bursts up to 2x
const CURSORS_PER_SECOND = 10;

export class Room extends DurableObject<Env> {
  // The board lives here, in memory, and every change is also written to SQLite (so a restart loses nothing).
  // Map order = stacking order (last = on top).
  private objects = new Map<string, Obj>();
  private ords = new Map<string, number>();
  private maxOrd = 0;
  private seq = 0;
  private version = 0; // bumps on every edit; lets us know whether a save covered the latest edit
  private dirty = false; // true while the database does not yet have the latest edits
  private seeded = false;
  private boardId = "";
  private edits = new WeakMap<WebSocket, { tokens: number; at: number }>();
  private cursors = new WeakMap<WebSocket, { tokens: number; at: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Runs on first use AND every time the room wakes up from hibernation.
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, ord INTEGER NOT NULL, json TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
      const meta = new Map<string, string>();
      for (const r of sql.exec("SELECT k, v FROM meta")) meta.set(r.k as string, r.v as string);
      this.seeded = meta.get("seeded") === "1";
      this.seq = Number(meta.get("seq") ?? 0);
      this.dirty = meta.get("dirty") === "1";
      this.boardId = meta.get("boardId") ?? "";
      for (const r of sql.exec("SELECT id, ord, json FROM objects ORDER BY ord")) {
        this.objects.set(r.id as string, JSON.parse(r.json as string));
        this.ords.set(r.id as string, r.ord as number);
        this.maxOrd = Math.max(this.maxOrd, r.ord as number);
      }
    });
  }

  private setMeta(k: string, v: string) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", k, v);
  }

  // ---------- connecting ----------
  async fetch(req: Request): Promise<Response> {
    const boardId = req.headers.get("x-board") ?? "";
    const who = JSON.parse(req.headers.get("x-peer") ?? "{}") as { userId: string; name: string; role: Role };
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // First visit ever: copy the board from the database into the room.
    if (!this.seeded) {
      const err = await this.seed(boardId);
      if (err) {
        server.accept();
        server.close(err === "missing" ? CLOSE.NOT_FOUND : 1011, err === "missing" ? "board not found" : "storage unavailable");
        return new Response(null, { status: 101, webSocket: client });
      }
    }

    const info: Attachment = {
      peerId: crypto.randomUUID().slice(0, 8),
      userId: who.userId,
      name: who.name.slice(0, 40) || "Guest",
      color: colorFor(who.userId),
      role: who.role,
    };
    this.ctx.acceptWebSocket(server); // "hibernation" API: the room may sleep between messages, sockets stay open
    server.serializeAttachment(info);
    this.send(server, this.welcome(info));
    this.broadcastPresence(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async seed(boardId: string): Promise<"missing" | "unavailable" | null> {
    try {
      const r = await fetch(`${this.env.API_BASE}/api/v1/internal/boards/${boardId}/state`, {
        headers: { "x-realtime-key": this.env.REALTIME_SECRET },
      });
      if (r.status === 404) return "missing";
      if (!r.ok) return "unavailable";
      const { objects } = (await r.json()) as { objects: Obj[] };
      this.ctx.storage.transactionSync(() => {
        for (const o of objects) this.put(o);
        this.boardId = boardId;
        this.setMeta("boardId", boardId);
        this.setMeta("seeded", "1");
      });
      this.seeded = true;
      return null;
    } catch {
      return "unavailable";
    }
  }

  // ---------- state changes ----------
  private put(o: Obj) {
    const ord = this.ords.get(o.id) ?? ++this.maxOrd;
    this.ords.set(o.id, ord);
    this.objects.set(o.id, o);
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO objects (id, ord, json) VALUES (?, ?, ?)", o.id, ord, JSON.stringify(o));
  }

  private apply(op: Op) {
    if (op.op === "add") {
      const old = this.objects.get(op.obj.id);
      this.put(old ? { ...old, ...op.obj } : op.obj); // adding twice (a retry) just merges
    } else if (op.op === "set") {
      const old = this.objects.get(op.id);
      if (old) this.put({ ...old, ...op.fields } as Obj); // object already deleted by someone else: ignore
    } else {
      if (this.objects.delete(op.id)) {
        this.ords.delete(op.id);
        this.ctx.storage.sql.exec("DELETE FROM objects WHERE id = ?", op.id);
      }
    }
  }

  private welcome(me: Attachment): ServerMsg {
    return {
      t: "welcome",
      you: { id: me.peerId, name: me.name, color: me.color, role: me.role },
      seq: this.seq,
      objects: [...this.objects.values()],
      peers: this.peers(),
    };
  }

  // ---------- messages ----------
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string" || message.length > MAX_MESSAGE) return void ws.close(1009, "message too large");
    let msg: ClientMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    const me = ws.deserializeAttachment() as Attachment;

    if (msg.t === "cursor") {
      if (typeof msg.x !== "number" || typeof msg.y !== "number" || !this.take(this.cursors, ws, CURSORS_PER_SECOND)) return;
      this.broadcast({ t: "cursor", from: me.peerId, x: msg.x, y: msg.y }, ws);
      return;
    }

    if (msg.t === "edit") {
      const editId = typeof msg.editId === "string" ? msg.editId.slice(0, 64) : "";
      // Whenever we refuse an edit we also send the true board state, so the sender's screen cannot drift.
      const refuse = (reason: string, text: string) => {
        this.send(ws, { t: "reject", editId, reason, message: text });
        this.send(ws, this.welcome(me));
      };
      if (me.role === "viewer") return refuse("forbidden", "You can only view this board.");
      if (!this.take(this.edits, ws, EDITS_PER_SECOND)) return refuse("rate_limited", "Slow down a little.");
      const problem = checkOps(msg.ops, (id) => this.objects.has(id), this.objects.size);
      if (problem) return refuse("invalid", problem);

      this.ctx.storage.transactionSync(() => {
        for (const op of msg.ops) this.apply(op);
      });
      this.seq++;
      this.version++;
      this.markDirty();
      this.send(ws, { t: "ack", editId, seq: this.seq });
      this.broadcast({ t: "edit", seq: this.seq, from: me.peerId, ops: msg.ops }, ws);
    }
  }

  // Token bucket: each socket may do `perSecond` things per second (and burst to twice that).
  private take(map: WeakMap<WebSocket, { tokens: number; at: number }>, ws: WebSocket, perSecond: number): boolean {
    const now = Date.now();
    const b = map.get(ws) ?? { tokens: perSecond * 2, at: now };
    b.tokens = Math.min(perSecond * 2, b.tokens + ((now - b.at) / 1000) * perSecond);
    b.at = now;
    map.set(ws, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  async webSocketClose(ws: WebSocket) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    this.broadcastPresence(ws);
    // last person left: save right away instead of waiting
    if (this.dirty && this.liveSockets(ws).length === 0) await this.ctx.storage.setAlarm(Date.now() + 300);
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  // ---------- saving to the database ----------
  private async markDirty() {
    if (!this.dirty) {
      this.dirty = true;
      this.setMeta("dirty", "1");
    }
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + FLUSH_AFTER_MS);
  }

  async alarm() {
    if (!this.dirty) return;
    const version = this.version;
    try {
      const r = await fetch(`${this.env.API_BASE}/api/v1/internal/boards/${this.boardId}/state`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-realtime-key": this.env.REALTIME_SECRET },
        body: JSON.stringify({ objects: [...this.objects.values()] }),
      });
      if (r.ok || r.status === 404) {
        // 404 = the owner deleted the board: nothing left to save to
        if (version === this.version) {
          this.dirty = false;
          this.setMeta("dirty", "0");
          this.setMeta("seq", String(this.seq));
          return;
        }
        return void (await this.ctx.storage.setAlarm(Date.now() + 500)); // edits arrived during the save
      }
    } catch {
      /* network problem — retry below */
    }
    await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
  }

  // ---------- helpers ----------
  private liveSockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((s) => s !== except && s.readyState === WebSocket.READY_STATE_OPEN);
  }
  private peers(except?: WebSocket): Peer[] {
    return this.liveSockets(except).map((s) => {
      const a = s.deserializeAttachment() as Attachment;
      return { id: a.peerId, name: a.name, color: a.color, role: a.role };
    });
  }
  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* the socket just closed */
    }
  }
  private broadcast(msg: ServerMsg, except?: WebSocket) {
    const text = JSON.stringify(msg);
    for (const s of this.liveSockets(except)) {
      try {
        s.send(text);
      } catch {
        /* ignore */
      }
    }
  }
  // `leaving` is excluded from the list, so this works both for a new joiner (it is added by the caller) and a leaver.
  private broadcastPresence(changed: WebSocket) {
    const closing = changed.readyState !== WebSocket.READY_STATE_OPEN;
    const peers = this.peers(closing ? changed : undefined);
    const text = JSON.stringify({ t: "presence", peers } satisfies ServerMsg);
    for (const s of this.liveSockets(closing ? changed : undefined)) {
      try {
        s.send(text);
      } catch {
        /* ignore */
      }
    }
  }
}
