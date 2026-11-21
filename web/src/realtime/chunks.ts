import type { ChunkMsg, EditMsg, Op } from "./protocol";

// Ably (free plan) refuses a message bigger than 64 KB, but one picture can be ~200 KB.
// So a big edit is cut into pieces of text, sent in order, and glued back together by the receiver.

export const MAX_SINGLE = 40_000; // an edit whose JSON is longer than this is cut up
export const PIECE = 30_000;

export type Outgoing = { name: "edit"; data: EditMsg } | { name: "chunk"; data: ChunkMsg };

export function toMessages(ops: Op[], eid: string): Outgoing[] {
  const text = JSON.stringify({ ops } satisfies EditMsg);
  if (text.length <= MAX_SINGLE) return [{ name: "edit", data: { ops } }];
  const n = Math.ceil(text.length / PIECE);
  return Array.from({ length: n }, (_, i) => ({ name: "chunk" as const, data: { eid, i, n, s: text.slice(i * PIECE, (i + 1) * PIECE) } }));
}

// Collects pieces per sender. Gives back the ops when the last piece arrives, otherwise null.
export function createAssembler() {
  const parts = new Map<string, { n: number; got: Map<number, string>; at: number }>();
  return (from: string, c: ChunkMsg): Op[] | null => {
    if (typeof c?.eid !== "string" || !Number.isInteger(c.i) || !Number.isInteger(c.n) || c.n < 1 || c.n > 50 || c.i < 0 || c.i >= c.n || typeof c.s !== "string") return null;
    const now = Date.now();
    for (const [k, v] of parts) if (now - v.at > 60_000) parts.delete(k); // pieces that never completed
    const key = `${from}:${c.eid}`;
    const e = parts.get(key) ?? { n: c.n, got: new Map(), at: now };
    e.got.set(c.i, c.s);
    parts.set(key, e);
    if (e.got.size < e.n) return null;
    parts.delete(key);
    try {
      const text = Array.from({ length: e.n }, (_, i) => e.got.get(i) ?? "").join("");
      const msg = JSON.parse(text) as EditMsg;
      return Array.isArray(msg.ops) ? msg.ops : null;
    } catch {
      return null;
    }
  };
}

// Keep the number of messages down: two changes to the same object in a row become one.
export function compact(ops: Op[]): Op[] {
  const out: Op[] = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (op.op === "set" && last?.op === "set" && last.id === op.id) out[out.length - 1] = { op: "set", id: op.id, fields: { ...last.fields, ...op.fields } };
    else if (op.op === "set" && last?.op === "add" && last.obj.id === op.id) out[out.length - 1] = { op: "add", obj: { ...last.obj, ...op.fields } as typeof last.obj };
    else out.push(op);
  }
  return out;
}
