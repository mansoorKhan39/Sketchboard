import type { BoardObject } from "./types";
import { isOverlay } from "./kinds";

// Aligning, spreading out, grouping and layer order. All of these are plain functions: they take the board and
// return the small changes ("patches") to apply, so they are easy to test and they sync like any other edit.

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type Patches = Record<string, Partial<BoardObject>>;
type Item = { id: string; x: number; y: number; width: number; height: number };

// Objects that have a real place on the board (not connectors, comments, votes ...)
export const placeable = (o: BoardObject) => o.type !== "connector" && !isOverlay(o);

export function alignPatches(items: Item[], mode: AlignMode): Patches {
  if (items.length < 2) return {};
  const left = Math.min(...items.map((o) => o.x));
  const right = Math.max(...items.map((o) => o.x + o.width));
  const top = Math.min(...items.map((o) => o.y));
  const bottom = Math.max(...items.map((o) => o.y + o.height));
  const out: Patches = {};
  for (const o of items) {
    if (mode === "left") out[o.id] = { x: left };
    else if (mode === "right") out[o.id] = { x: right - o.width };
    else if (mode === "hcenter") out[o.id] = { x: (left + right) / 2 - o.width / 2 };
    else if (mode === "top") out[o.id] = { y: top };
    else if (mode === "bottom") out[o.id] = { y: bottom - o.height };
    else out[o.id] = { y: (top + bottom) / 2 - o.height / 2 };
  }
  return out;
}

// Spread three or more objects so the gaps between them are equal. The two outer ones stay where they are.
export function distributePatches(items: Item[], axis: "h" | "v"): Patches {
  if (items.length < 3) return {};
  const h = axis === "h";
  const pos = (o: Item) => (h ? o.x : o.y);
  const len = (o: Item) => (h ? o.width : o.height);
  const sorted = [...items].sort((a, b) => pos(a) - pos(b));
  const start = pos(sorted[0]);
  const end = Math.max(...sorted.map((o) => pos(o) + len(o)));
  const gap = (end - start - sorted.reduce((n, o) => n + len(o), 0)) / (sorted.length - 1);
  const out: Patches = {};
  let at = start;
  for (const o of sorted) {
    out[o.id] = h ? { x: at } : { y: at };
    at += len(o) + gap;
  }
  return out;
}

// ---- groups ----

// Selecting one member of a group selects the whole group.
export function expandGroups(objects: BoardObject[], ids: string[]): string[] {
  const groups = new Set(objects.filter((o) => ids.includes(o.id) && o.group).map((o) => o.group));
  if (!groups.size) return ids;
  const all = new Set(ids);
  for (const o of objects) if (o.group && groups.has(o.group)) all.add(o.id);
  return [...all];
}

// "" means "not in a group" (an empty string, not a missing field, because a removed field cannot be sent to other people).
export const groupPatches = (ids: string[], groupId: string): Patches => Object.fromEntries(ids.map((id) => [id, { group: groupId }]));

// ---- layer order ----

export type LayerMove = "front" | "back" | "forward" | "backward";
const zOf = (o: BoardObject) => o.z ?? 0;

// The order things are drawn in: lowest z first. Equal z keeps the order of the list. (Array.sort is stable.)
export const sortByZ = (objects: BoardObject[]): BoardObject[] => (objects.some((o) => o.z) ? [...objects].sort((a, b) => zOf(a) - zOf(b)) : objects);

const overlaps = (a: Omit<Item, "id">, b: Omit<Item, "id">) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

export function layerPatches(objects: BoardObject[], ids: string[], move: LayerMove): Patches {
  const list = sortByZ(objects.filter(placeable));
  const picked = list.filter((o) => ids.includes(o.id));
  if (!picked.length) return {};
  const out: Patches = {};
  if (move === "front" || move === "back") {
    const rest = list.filter((o) => !ids.includes(o.id));
    if (!rest.length) return {};
    const ceiling = Math.max(...rest.map(zOf));
    const floor = Math.min(...rest.map(zOf));
    picked.forEach((o, i) => {
      const z = move === "front" ? ceiling + 1 + i : floor - picked.length + i;
      if (zOf(o) !== z) out[o.id] = { z };
    });
    return out;
  }
  // one step: swap places with the neighbours that actually overlap the selection
  const box = {
    x: Math.min(...picked.map((o) => o.x)), y: Math.min(...picked.map((o) => o.y)),
    width: 0, height: 0,
  };
  box.width = Math.max(...picked.map((o) => o.x + o.width)) - box.x;
  box.height = Math.max(...picked.map((o) => o.y + o.height)) - box.y;
  const group = list.filter((o) => ids.includes(o.id) || overlaps(o, box));
  const idx = group.findIndex((o) => ids.includes(o.id));
  const last = group.length - 1 - [...group].reverse().findIndex((o) => ids.includes(o.id));
  const block = group.filter((o) => ids.includes(o.id));
  const rest = group.filter((o) => !ids.includes(o.id));
  let pos: number; // where the block goes among `rest`
  if (move === "forward") {
    const above = group.slice(last + 1).filter((o) => !ids.includes(o.id));
    if (!above.length) return {};
    pos = rest.indexOf(above[0]) + 1;
  } else {
    const below = group.slice(0, idx).filter((o) => !ids.includes(o.id));
    if (!below.length) return {};
    pos = rest.indexOf(below[below.length - 1]);
  }
  const next = [...rest.slice(0, pos), ...block, ...rest.slice(pos)];
  const base = Math.min(...group.map(zOf));
  next.forEach((o, i) => {
    if (zOf(o) !== base + i) out[o.id] = { z: base + i };
  });
  return out;
}

// New objects land on top once anything has been given a layer.
export const nextZ = (objects: BoardObject[]): number | undefined => {
  const top = objects.reduce((m, o) => Math.max(m, zOf(o)), 0);
  return top > 0 ? top + 1 : undefined;
};
