import { MAX_SCALE, MIN_SCALE } from "./constants";
import type { Viewport } from "./types";

// Pure maths for moving around the board. A Viewport is { x, y, scale }: board point P is drawn at screen
// point (P.x * scale + x, P.y * scale + y). Nothing here touches the screen, so all of it is easy to test.

export const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

// Zoom by `factor` while the board point under screen point (cx, cy) stays exactly where it is.
export function zoomAt(v: Viewport, factor: number, cx: number, cy: number): Viewport {
  const scale = clampScale(v.scale * factor);
  const k = scale / v.scale;
  return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
}

// Same, but ask for the final zoom level instead of a factor.
export const zoomTo = (v: Viewport, scale: number, cx: number, cy: number) => zoomAt(v, scale / v.scale, cx, cy);

// Slide the board by (dx, dy) screen pixels.
export const panBy = (v: Viewport, dx: number, dy: number): Viewport => ({ ...v, x: v.x + dx, y: v.y + dy });

// The view that shows a board rectangle in the middle of a w x h screen, with some room around it.
// `maxScale` stops a tiny object from being blown up to fill the whole screen.
export function viewOfRect(r: { x: number; y: number; width: number; height: number }, w: number, h: number, margin = 0.85, maxScale = 1.5): Viewport {
  const scale = clampScale(Math.min((w / Math.max(r.width, 1)) * margin, (h / Math.max(r.height, 1)) * margin, maxScale));
  return { scale, x: w / 2 - (r.x + r.width / 2) * scale, y: h / 2 - (r.y + r.height / 2) * scale };
}

// The board point at the middle of the screen, and the view that puts a board point in the middle.
export const centreOf = (v: Viewport, w: number, h: number) => ({ x: (w / 2 - v.x) / v.scale, y: (h / 2 - v.y) / v.scale });
export const viewCentredOn = (px: number, py: number, scale: number, w: number, h: number): Viewport => ({ scale, x: w / 2 - px * scale, y: h / 2 - py * scale });

// What a mouse wheel / trackpad gesture should do.
//   mode "zoom":   a mouse wheel zooms (Miro style); a trackpad two-finger swipe scrolls
//   mode "scroll": everything scrolls (Figma style); only Ctrl/Cmd + wheel and pinch zoom
// Pinching on a trackpad arrives as a wheel event with ctrlKey set, so it zooms in both modes.
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number; // 0 pixels, 1 lines, 2 pages
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}
export type WheelIntent = { kind: "zoom"; factor: number } | { kind: "pan"; dx: number; dy: number };

const LINE = 16;
const PAGE = 400;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// A real mouse wheel sends whole numbers in big steps (about 100 per click) and never sideways;
// a trackpad sends many small, often fractional, values and often sideways ones.
export function looksLikeMouseWheel(e: WheelLike): boolean {
  if (e.deltaMode !== 0) return true; // Firefox sends lines for a mouse wheel
  return e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50;
}

export function wheelIntent(e: WheelLike, mode: "zoom" | "scroll"): WheelIntent {
  const unit = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? PAGE : 1;
  const dx = e.deltaX * unit;
  const dy = e.deltaY * unit;
  if (e.ctrlKey || e.metaKey) {
    // pinch sends small steps, Ctrl + mouse wheel sends big ones: both feel about right with this curve
    return { kind: "zoom", factor: Math.exp(-clamp(dy, -60, 60) * 0.01) };
  }
  if (mode === "zoom" && looksLikeMouseWheel(e)) {
    if (e.shiftKey) return { kind: "pan", dx: -dy, dy: 0 }; // Shift + wheel slides sideways
    return { kind: "zoom", factor: Math.exp(-clamp(dy, -150, 150) * 0.0012) }; // about 12% per click
  }
  // scrolling: the board follows your fingers; Shift + wheel slides sideways
  return e.shiftKey && dx === 0 ? { kind: "pan", dx: -dy, dy: 0 } : { kind: "pan", dx: -dx, dy: -dy };
}

// Two fingers on a touch screen: zoom by how much they spread, and follow where they move.
export function pinchStep(v: Viewport, prev: { cx: number; cy: number; dist: number }, now: { cx: number; cy: number; dist: number }): Viewport {
  const zoomed = prev.dist > 0 && now.dist > 0 ? zoomAt(v, now.dist / prev.dist, prev.cx, prev.cy) : v;
  return panBy(zoomed, now.cx - prev.cx, now.cy - prev.cy);
}

// While dragging a selection box near the edge of the screen, the view should creep that way.
export function edgePanSpeed(pos: number, size: number, edge = 36, max = 18): number {
  if (pos < edge) return Math.min(max, ((edge - pos) / edge) * max); // positive: board slides right/down (we look left/up)
  if (pos > size - edge) return -Math.min(max, ((pos - (size - edge)) / edge) * max);
  return 0;
}

// Arrow keys: how far to move (board units for objects, pixels for the view).
export const arrowStep = (shift: boolean, big = 10) => (shift ? big : 1);

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // easeInOutCubic

// A view part-way between two views: the centre slides in a straight line, the zoom changes smoothly (in log
// space, so zooming out feels as fast as zooming in).
export function blendViews(a: Viewport, b: Viewport, t: number, w: number, h: number): Viewport {
  const ca = centreOf(a, w, h), cb = centreOf(b, w, h);
  const scale = Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * t);
  return viewCentredOn(ca.x + (cb.x - ca.x) * t, ca.y + (cb.y - ca.y) * t, scale, w, h);
}

// The small overview map: where each board point lands inside a box of `box` pixels.
export function miniMapFrame(world: { x: number; y: number; width: number; height: number }, box: { w: number; h: number }) {
  const s = Math.min(box.w / Math.max(world.width, 1), box.h / Math.max(world.height, 1));
  const ox = (box.w - world.width * s) / 2 - world.x * s;
  const oy = (box.h - world.height * s) / 2 - world.y * s;
  return { s, ox, oy, toMini: (x: number, y: number) => ({ x: x * s + ox, y: y * s + oy }), toWorld: (mx: number, my: number) => ({ x: (mx - ox) / s, y: (my - oy) / s }) };
}
