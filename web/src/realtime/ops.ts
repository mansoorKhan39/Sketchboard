import type { BoardObject } from "../types";
import type { Obj, Op } from "./protocol";

// Turn "what changed on the board" into small operations, and apply operations that came from other people.

// Compare two versions of the board and describe the difference.
export function diffOps(prev: BoardObject[], next: BoardObject[]): Op[] {
  const ops: Op[] = [];
  const before = new Map(prev.map((o) => [o.id, o]));
  const after = new Set<string>();
  for (const o of next) {
    after.add(o.id);
    const old = before.get(o.id);
    if (!old) {
      ops.push({ op: "add", obj: o as unknown as Obj });
    } else if (old !== o) {
      const fields: Record<string, unknown> = {};
      const a = old as unknown as Record<string, unknown>;
      const b = o as unknown as Record<string, unknown>;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (a[k] !== b[k]) fields[k] = b[k]; // only the fields that changed — so two people can edit different fields of one object
      }
      if (Object.keys(fields).length) ops.push({ op: "set", id: o.id, fields });
    }
  }
  for (const o of prev) if (!after.has(o.id)) ops.push({ op: "remove", id: o.id });
  return ops;
}

// Apply operations to a board. Returns the same array if nothing changed.
// Applying the same operation twice gives the same result, which makes retries safe.
export function applyOps(objects: BoardObject[], ops: Op[]): BoardObject[] {
  let list = objects;
  let copied = false;
  const own = () => {
    if (!copied) {
      list = [...list];
      copied = true;
    }
  };
  for (const op of ops) {
    if (op.op === "add") {
      const i = list.findIndex((o) => o.id === op.obj.id);
      own();
      if (i >= 0) list[i] = { ...list[i], ...op.obj } as BoardObject;
      else list.push(op.obj as unknown as BoardObject);
    } else if (op.op === "set") {
      const i = list.findIndex((o) => o.id === op.id);
      if (i < 0) continue; // someone deleted it meanwhile
      own();
      list[i] = { ...list[i], ...op.fields } as BoardObject;
    } else {
      const i = list.findIndex((o) => o.id === op.id);
      if (i < 0) continue;
      own();
      list.splice(i, 1);
    }
  }
  return list;
}
