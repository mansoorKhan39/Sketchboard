import { isOverlay } from "../kinds";
import type { BoardObject, Placeable } from "../types";
import { INK_DEFAULT } from "../constants";

// A small, static SVG drawing of a board. Used on dashboard cards, so no canvas is needed per card.
// Ink-coloured things use currentColor, so they follow light / dark mode.
const paint = (c: string) => (c.toLowerCase() === INK_DEFAULT.toLowerCase() ? "currentColor" : c);

export default function BoardThumb({ objects }: { objects: BoardObject[] }) {
  const items = objects.filter((o): o is Placeable => o.type !== "connector" && !isOverlay(o));
  if (!items.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-muted">Empty board</div>
    );
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of items) {
    minX = Math.min(minX, o.x); minY = Math.min(minY, o.y);
    maxX = Math.max(maxX, o.x + o.width); maxY = Math.max(maxY, o.y + o.height);
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08 + 20;
  const byId = new Map(items.map((o) => [o.id, o]));

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full text-ink"
      aria-hidden
    >
      {objects.map((o) => {
        if (o.type === "connector") {
          const a = byId.get(o.fromId), b = byId.get(o.toId);
          if (!a || !b) return null;
          return (
            <line key={o.id} x1={a.x + a.width / 2} y1={a.y + a.height / 2} x2={b.x + b.width / 2} y2={b.y + b.height / 2}
              stroke={paint(o.color)} strokeWidth={Math.max(3, pad / 14)} opacity={0.7} />
          );
        }
        return null;
      })}
      {items.map((o) => {
        const sw = Math.max(3, pad / 16);
        if (o.type === "sticky") return <rect key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} rx={6} fill={o.color} />;
        if (o.type === "shape") {
          const common = { fill: o.fill, stroke: "currentColor", strokeWidth: sw, opacity: 0.95 };
          if (o.kind === "ellipse")
            return <ellipse key={o.id} cx={o.x + o.width / 2} cy={o.y + o.height / 2} rx={o.width / 2} ry={o.height / 2} {...common} />;
          if (o.kind === "diamond") {
            const { x, y, width: w, height: h } = o;
            return <polygon key={o.id} points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} {...common} />;
          }
          return <rect key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} rx={8} {...common} />;
        }
        if (o.type === "stroke") {
          const pts = o.points.map((v, i) => (i % 2 === 0 ? v + o.x : v + o.y));
          const d = pts.reduce((acc, v, i) => (i % 2 === 0 ? `${acc}${i ? "L" : "M"}${v},` : `${acc}${v}`), "");
          return <path key={o.id} d={d} fill="none" stroke={paint(o.color)} strokeWidth={Math.max(o.lineWidth, sw)} strokeLinecap="round" strokeLinejoin="round" />;
        }
        // picture: a soft grey block (the real picture is too heavy for a thumbnail)
        if (o.type === "frame") return <rect key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} rx={6} fill="none" stroke="currentColor" strokeWidth={4} opacity={0.3} />;
        if (o.type === "image") return <rect key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} rx={6} fill="currentColor" opacity={0.18} />;
        // text: a thin bar is enough to suggest a line of writing
        return <rect key={o.id} x={o.x} y={o.y + o.height * 0.3} width={Math.min(o.width, o.text.length * o.fontSize * 0.55 + 20)} height={o.fontSize * 0.5} rx={4} fill={paint(o.color)} opacity={0.75} />;
      })}
    </svg>
  );
}
