import type { BoardObject } from "./types";
import { isObj } from "./realtime/validate";
import { isOverlay } from "./kinds";

// A board saved as a file (.sketchboard.json) that can be imported again, on any account.
export const FILE_VERSION = 1;
export const MAX_FILE_BYTES = 8_000_000;
export const MAX_OBJECTS = 5000;

export const toBoardFile = (name: string, objects: BoardObject[]): string =>
  JSON.stringify({ sketchboard: FILE_VERSION, name, objects: objects.filter((o) => !isOverlay(o) || o.type === "comment") }, null, 1);

// Reads and cleans a file. Things that are not valid objects are dropped (and counted), so a damaged
// or hand-edited file can never put something strange on the board.
export function parseBoardFile(text: string): { name: string; objects: BoardObject[]; skipped: number } {
  if (text.length > MAX_FILE_BYTES) throw new Error("This file is too big to import.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This is not a Sketchboard file.");
  }
  const d = data as { sketchboard?: unknown; name?: unknown; objects?: unknown };
  if (!d || typeof d !== "object" || d.sketchboard !== FILE_VERSION || !Array.isArray(d.objects)) throw new Error("This is not a Sketchboard file.");
  if (d.objects.length > MAX_OBJECTS) throw new Error(`This board has more than ${MAX_OBJECTS} objects.`);
  const seen = new Set<string>();
  const objects: BoardObject[] = [];
  let skipped = 0;
  for (const o of d.objects) {
    if (isObj(o) && !seen.has((o as { id: string }).id)) {
      seen.add((o as { id: string }).id);
      objects.push(o as unknown as BoardObject);
    } else skipped++;
  }
  const name = typeof d.name === "string" && d.name.trim() ? d.name.trim().slice(0, 100) : "Imported board";
  return { name, objects, skipped };
}
