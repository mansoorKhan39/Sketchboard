import type { BoardObject, Connector, FrameObj, Placeable, Viewport } from "./types";
import { isOverlay } from "./kinds";
import { MAX_SCALE, MIN_SCALE } from "./constants";

type Pt = { x: number; y: number };

// The four side-midpoints of an object (top, right, bottom, left). Rotation is ignored for now.
const anchors = (o: Placeable): Pt[] => [
  { x: o.x + o.width / 2, y: o.y },
  { x: o.x + o.width, y: o.y + o.height / 2 },
  { x: o.x + o.width / 2, y: o.y + o.height },
  { x: o.x, y: o.y + o.height / 2 },
];

export const centerOf = (o: Placeable): Pt => ({ x: o.x + o.width / 2, y: o.y + o.height / 2 });

// Line points for a connector: picks the closest pair of side-midpoints so the line looks natural.
export function connectorPoints(c: Connector, from: Placeable, to: Placeable): number[] {
  let best: [Pt, Pt] = [anchors(from)[0], anchors(to)[0]];
  let bestD = Infinity;
  for (const a of anchors(from)) {
    for (const b of anchors(to)) {
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [a, b];
      }
    }
  }
  const [a, b] = best;
  if (c.lineStyle === "elbow") {
    const mx = (a.x + b.x) / 2;
    return [a.x, a.y, mx, a.y, mx, b.y, b.x, b.y];
  }
  return [a.x, a.y, b.x, b.y];
}

// Largest size that keeps the shape and fits inside `max` on the longest side (used when shrinking pictures).
export function fitInside(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

// The box (in board coordinates) that holds every object, with some space around it. Null for an empty board.
export function contentBounds(
  objects: { type: string; x: number; y: number; width: number; height: number }[],
  pad = 40,
): { x: number; y: number; width: number; height: number } | null {
  const list = objects.filter((o) => o.type !== "connector" && !isOverlay(o));
  if (!list.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of list) {
    minX = Math.min(minX, o.x);
    minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width);
    maxY = Math.max(maxY, o.y + o.height);
  }
  return { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad };
}

// ---- frames & presentation ----

// Frames in presentation order: by slide number, then by id so the order is the same on every screen.
export const sortedFrames = (objects: BoardObject[]): FrameObj[] =>
  objects
    .filter((o): o is FrameObj => o.type === "frame")
    .sort((a, b) => a.slide - b.slide || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// The view (pan + zoom) that shows one frame centred on a screen of w x h, with a little breathing room.
export function frameFit(f: { x: number; y: number; width: number; height: number }, w: number, h: number, margin = 0.9): Viewport {
  const raw = Math.min(w / Math.max(f.width, 1), h / Math.max(f.height, 1)) * margin;
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
  return { scale, x: w / 2 - (f.x + f.width / 2) * scale, y: h / 2 - (f.y + f.height / 2) * scale };
}

// Is the middle of `o` inside the frame? Those objects travel with the frame when it is dragged.
export const insideFrame = (f: FrameObj, o: BoardObject): boolean => {
  if (o.id === f.id || o.type === "frame" || o.type === "connector") return false;
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  return cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height;
};
