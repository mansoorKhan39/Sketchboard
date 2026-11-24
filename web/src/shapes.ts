import type { ShapeKind } from "./types";

// Every shape the shape tool can draw, with the name shown in the menu.
export const SHAPE_KINDS: { kind: ShapeKind; label: string }[] = [
  { kind: "rect", label: "Rectangle" },
  { kind: "ellipse", label: "Ellipse" },
  { kind: "diamond", label: "Diamond" },
  { kind: "triangle", label: "Triangle" },
  { kind: "hexagon", label: "Hexagon" },
  { kind: "star", label: "Star" },
  { kind: "arrow", label: "Block arrow" },
  { kind: "speech", label: "Speech bubble" },
  { kind: "cloud", label: "Cloud" },
  { kind: "cylinder", label: "Cylinder" },
];

// Shapes made of straight lines: the corner points (x1, y1, x2, y2 ...) for a box of this size.
export function polygonPoints(kind: ShapeKind, w: number, h: number): number[] | null {
  switch (kind) {
    case "diamond":
      return [w / 2, 0, w, h / 2, w / 2, h, 0, h / 2];
    case "triangle":
      return [w / 2, 0, w, h, 0, h];
    case "hexagon":
      return [w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2];
    case "arrow":
      return [0, h * 0.3, w * 0.6, h * 0.3, w * 0.6, 0, w, h / 2, w * 0.6, h, w * 0.6, h * 0.7, 0, h * 0.7];
    case "star": {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.4;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(w / 2 + (Math.cos(a) * r * w) / 2, h / 2 + (Math.sin(a) * r * h) / 2);
      }
      return pts;
    }
    default:
      return null;
  }
}

// Curvy shapes: an SVG path drawn in a 100 x 100 box (it is stretched to the object's size).
export function curvePath(kind: ShapeKind): { body: string; detail?: string } | null {
  switch (kind) {
    case "cloud":
      return { body: "M26 82 A19 19 0 0 1 20 46 A24 24 0 0 1 62 28 A22 22 0 0 1 91 52 A15 15 0 0 1 78 82 Z" };
    case "cylinder":
      return { body: "M4 14 A46 12 0 0 1 96 14 L96 86 A46 12 0 0 1 4 86 Z", detail: "M4 14 A46 12 0 0 0 96 14" };
    case "speech":
      return { body: "M8 6 H92 Q96 6 96 10 V64 Q96 68 92 68 H42 L22 94 L26 68 H8 Q4 68 4 64 V10 Q4 6 8 6 Z" };
    default:
      return null;
  }
}
