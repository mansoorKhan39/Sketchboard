import { useBoard } from "../store";

// The dotted background. It moves and scales with the board, so panning and zooming feel physical.
// When zoomed far out the dots are thinned (every 2nd, 4th…) so they never turn into a grey haze.
export default function DotGrid() {
  const { x, y, scale } = useBoard((s) => s.viewport);
  let step = 24 * scale;
  while (step < 14) step *= 2;
  const r = Math.min(1.7, Math.max(0.9, scale * 1.25));
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `radial-gradient(var(--dot) ${r}px, transparent ${r + 0.4}px)`,
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${x - step / 2}px ${y - step / 2}px`,
      }}
    />
  );
}
