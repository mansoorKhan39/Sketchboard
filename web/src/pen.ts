import type { Stroke } from "./types";

// Pen, highlighter and eraser: the small pure helpers (no screen code), so they can be tested.
export type PenMode = "pen" | "highlighter";
export interface PenSettings {
  mode: PenMode;
  color: string;
  width: number; // one of PEN_WIDTHS
}
export const PEN_WIDTHS = [2, 4, 8, 14];
export const PEN_COLORS = ["#1F2937", "#E03131", "#2F9E44", "#1971C2", "#F08C00", "#7048E8", "#E64980"];
export const DEFAULT_PEN: PenSettings = { mode: "pen", color: PEN_COLORS[0], width: 4 };
export const HIGHLIGHT_ALPHA = 0.4;

// What a stroke gets from the pen settings. A highlighter is the same colour, wide, and see-through.
export const strokeParams = (p: PenSettings): { lineWidth: number; alpha: number } =>
  p.mode === "highlighter" ? { lineWidth: Math.max(14, p.width * 4), alpha: HIGHLIGHT_ALPHA } : { lineWidth: p.width, alpha: 1 };

// Drops points that are closer than `min` to the last kept point (a slow hand makes hundreds of nearly equal points).
// The first and the last point always stay.
export function thin(points: number[], min: number): number[] {
  if (points.length <= 4) return points;
  const out = [points[0], points[1]];
  for (let i = 2; i < points.length - 2; i += 2) {
    if (Math.hypot(points[i] - out[out.length - 2], points[i + 1] - out[out.length - 1]) >= min) out.push(points[i], points[i + 1]);
  }
  out.push(points[points.length - 2], points[points.length - 1]);
  return out;
}

// Holding Shift: a straight line from where the pen went down to where it is now.
export const straight = (points: number[]): number[] => (points.length < 4 ? points : [points[0], points[1], points[points.length - 2], points[points.length - 1]]);

const distToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Does the eraser circle (centre in board coordinates, radius in board units) touch this stroke?
export function strokeHit(s: Pick<Stroke, "x" | "y" | "rotation" | "points" | "lineWidth">, wx: number, wy: number, radius: number): boolean {
  // the point in the stroke's own coordinates (strokes turn around their top-left corner)
  const a = (-s.rotation * Math.PI) / 180;
  const dx = wx - s.x, dy = wy - s.y;
  const px = dx * Math.cos(a) - dy * Math.sin(a);
  const py = dx * Math.sin(a) + dy * Math.cos(a);
  const reach = radius + s.lineWidth / 2;
  const p = s.points;
  if (p.length < 4) return p.length >= 2 && Math.hypot(px - p[0], py - p[1]) <= reach;
  for (let i = 0; i + 3 < p.length; i += 2) if (distToSegment(px, py, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach) return true;
  return false;
}

// Strokes under the eraser, as a list of ids (one pass over all the places the eraser went).
export function strokesTouched(strokes: Stroke[], path: number[], radius: number): string[] {
  const hit = new Set<string>();
  for (const s of strokes) {
    for (let i = 0; i + 1 < path.length; i += 2) {
      if (strokeHit(s, path[i], path[i + 1], radius)) {
        hit.add(s.id);
        break;
      }
    }
  }
  return [...hit];
}

// Live drawing: what another person sends while they draw (the checks are for data from other people).
export interface Draft {
  color: string;
  width: number;
  alpha: number;
  points: number[];
}
export const MAX_DRAFT_POINTS = 8000; // numbers, so 4000 points
const HEX = /^#[0-9a-fA-F]{6}$/;
export function validDraftChunk(d: unknown): d is { id: string; p: number[]; c?: string; w?: number; a?: number; done?: boolean } {
  if (typeof d !== "object" || d === null) return false;
  const r = d as Record<string, unknown>;
  return (
    typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64 &&
    Array.isArray(r.p) && r.p.length <= 400 && r.p.length % 2 === 0 && r.p.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e7) &&
    (r.c === undefined || (typeof r.c === "string" && HEX.test(r.c))) &&
    (r.w === undefined || (typeof r.w === "number" && r.w >= 0.5 && r.w <= 80)) &&
    (r.a === undefined || (typeof r.a === "number" && r.a >= 0.05 && r.a <= 1)) &&
    (r.done === undefined || typeof r.done === "boolean")
  );
}
