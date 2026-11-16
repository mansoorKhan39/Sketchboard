import type { Connector, Placeable } from "./types";

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
