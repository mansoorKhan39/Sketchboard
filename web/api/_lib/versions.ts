import type { VersionRec } from "./types.js";

export const MAX_VERSIONS = 5; // how many snapshots a board keeps
export const MAX_VERSION_BYTES = 8_000_000; // all snapshots of one board together (MongoDB documents stop at 16 MB)

const sizeOf = (v: VersionRec) => JSON.stringify(v.objects).length;

// Adds a snapshot at the end (newest last) and forgets the oldest ones until both limits hold.
export function addVersion(list: VersionRec[], v: VersionRec): VersionRec[] {
  const out = [...list, v];
  while (out.length > MAX_VERSIONS) out.shift();
  while (out.length > 1 && out.reduce((n, x) => n + sizeOf(x), 0) > MAX_VERSION_BYTES) out.shift();
  return out;
}
