// Smart guides: while something is dragged, its edges and middle snap to the edges and middles of the other objects.

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A guide is a straight line drawn on the board: axis "x" is a vertical line at x = pos, from y = from to y = to.
export interface Guide {
  axis: "x" | "y";
  pos: number;
  from: number;
  to: number;
}

export const SNAP_DISTANCE = 6; // screen pixels
export const GRID_SIZE = 20; // board units

const marks = (a: number, size: number) => [a, a + size / 2, a + size];

// One direction (x or y). Returns how far to shift the moving box, and the lines it now lines up with.
function snapAxis(moving: Box, others: Box[], horizontal: boolean, threshold: number, grid: number) {
  const a = horizontal ? moving.x : moving.y;
  const size = horizontal ? moving.width : moving.height;
  const mine = marks(a, size);
  let best = Infinity;
  let shift = 0;
  for (const o of others) {
    const theirs = marks(horizontal ? o.x : o.y, horizontal ? o.width : o.height);
    for (const m of mine) {
      for (const t of theirs) {
        const d = t - m;
        if (Math.abs(d) < Math.abs(best)) {
          best = d;
          shift = d;
        }
      }
    }
  }
  if (Math.abs(best) > threshold) {
    best = Infinity;
    shift = 0;
    if (grid > 0) shift = Math.round(a / grid) * grid - a; // no neighbour close by: fall back to the grid
  }
  return { shift, snapped: best !== Infinity };
}

export function snapBox(moving: Box, others: Box[], threshold: number, grid = 0): { dx: number; dy: number; guides: Guide[] } {
  const near = others.filter(
    (o) => Math.abs(o.x + o.width / 2 - (moving.x + moving.width / 2)) < 2000 && Math.abs(o.y + o.height / 2 - (moving.y + moving.height / 2)) < 2000,
  );
  const sx = snapAxis(moving, near, true, threshold, grid);
  const sy = snapAxis(moving, near, false, threshold, grid);
  const box = { ...moving, x: moving.x + sx.shift, y: moving.y + sy.shift };
  const guides: Guide[] = [];
  const EPS = 0.5;
  for (const o of near) {
    if (sx.snapped) {
      for (const m of marks(box.x, box.width)) {
        for (const t of marks(o.x, o.width)) {
          if (Math.abs(m - t) < EPS) guides.push({ axis: "x", pos: t, from: Math.min(box.y, o.y), to: Math.max(box.y + box.height, o.y + o.height) });
        }
      }
    }
    if (sy.snapped) {
      for (const m of marks(box.y, box.height)) {
        for (const t of marks(o.y, o.height)) {
          if (Math.abs(m - t) < EPS) guides.push({ axis: "y", pos: t, from: Math.min(box.x, o.x), to: Math.max(box.x + box.width, o.x + o.width) });
        }
      }
    }
  }
  return { dx: sx.shift, dy: sy.shift, guides };
}
