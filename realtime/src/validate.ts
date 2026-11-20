import type { Obj, ObjType, Op } from "./protocol";

export const MAX_OBJECTS = 5000;
export const MAX_OPS_PER_EDIT = 200;
const MAX_OBJECT_BYTES = 64_000;
export const MAX_IMAGE_BYTES = 200_000; // pictures are compressed in the browser to stay under this
const limitFor = (type: unknown) => (type === "image" ? MAX_IMAGE_BYTES : MAX_OBJECT_BYTES);
const TYPES: ObjType[] = ["sticky", "shape", "stroke", "text", "image", "frame", "comment", "vote", "timer", "reaction", "settings", "connector"];
const NUM = ["x", "y", "width", "height", "rotation"] as const;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const size = (v: unknown) => JSON.stringify(v).length;

export function isObj(o: unknown): o is Obj {
  if (typeof o !== "object" || o === null) return false;
  const r = o as Record<string, unknown>;
  return (
    typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64 &&
    TYPES.includes(r.type as ObjType) &&
    NUM.every((k) => isNum(r[k])) &&
    size(o) <= limitFor(r.type)
  );
}

// Returns an error text, or null when every op is acceptable. Checked BEFORE anything is applied,
// so an edit is applied completely or not at all.
export function checkOps(ops: unknown, has: (id: string) => boolean, count: number): string | null {
  if (!Array.isArray(ops) || ops.length === 0) return "An edit needs at least one operation.";
  if (ops.length > MAX_OPS_PER_EDIT) return "Too many operations in one edit.";
  let added = 0;
  const known = new Set<string>(); // ids added earlier in the same edit
  for (const raw of ops as Op[]) {
    if (typeof raw !== "object" || raw === null) return "Bad operation.";
    if (raw.op === "add") {
      if (!isObj(raw.obj)) return "Bad object.";
      added++;
      known.add(raw.obj.id);
    } else if (raw.op === "set") {
      if (typeof raw.id !== "string" || typeof raw.fields !== "object" || raw.fields === null) return "Bad change.";
      if ("id" in raw.fields || "type" in raw.fields) return "id and type cannot change.";
      for (const k of NUM) if (k in raw.fields && !isNum(raw.fields[k])) return `${k} must be a number.`;
      if (size(raw.fields) > MAX_OBJECT_BYTES) return "Change is too large.";
      // changing something that someone else just deleted is fine: it is ignored
      if (!has(raw.id) && !known.has(raw.id)) continue;
    } else if (raw.op === "remove") {
      if (typeof raw.id !== "string") return "Bad delete.";
    } else return "Unknown operation.";
  }
  if (count + added > MAX_OBJECTS) return "This board has reached the object limit.";
  return null;
}
