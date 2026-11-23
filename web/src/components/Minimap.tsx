import { useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { contentBounds } from "../geometry";
import { isOverlay } from "../kinds";
import { centreOn } from "../navigation";
import { miniMapFrame } from "../viewport";

const W = 176;
const H = 116;
const MAX_DRAWN = 600; // a huge board only draws the first part: the map is a hint, not a copy

// A small overview of the whole board with a frame that shows what is on screen. Click or drag on it to jump there.
export default function Minimap() {
  const on = useUI((s) => s.minimap);
  const objects = useBoard((s) => s.objects);
  const viewport = useBoard((s) => s.viewport);
  const present = useBoard((s) => s.present);
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef(false);

  useEffect(() => {
    const f = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const shown = useMemo(() => objects.filter((o) => o.type !== "connector" && !isOverlay(o)).slice(0, MAX_DRAWN), [objects]);

  if (!on || present || win.w < 900 || !shown.length) return null;

  // the map covers the board AND the part you are looking at, so the frame never leaves the map
  const view = { x: -viewport.x / viewport.scale, y: -viewport.y / viewport.scale, width: win.w / viewport.scale, height: win.h / viewport.scale };
  const all = contentBounds([...shown, { type: "view", ...view }], 0)!;
  const pad = Math.max(all.width, all.height) * 0.06;
  const frame = miniMapFrame({ x: all.x - pad, y: all.y - pad, width: all.width + 2 * pad, height: all.height + 2 * pad }, { w: W, h: H });

  const jump = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const p = frame.toWorld(e.clientX - r.left, e.clientY - r.top);
    centreOn(p.x, p.y);
  };
  const vTL = frame.toMini(view.x, view.y);

  return (
    <div className="glass absolute bottom-[4.25rem] right-4 z-10 overflow-hidden rounded-xl p-1" data-testid="minimap" aria-label="Board overview">
      <svg
        ref={svg}
        width={W}
        height={H}
        className="block cursor-pointer touch-none rounded-lg bg-sunken"
        onPointerDown={(e) => {
          drag.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => drag.current && jump(e)}
        onPointerUp={() => (drag.current = false)}
        onPointerCancel={() => (drag.current = false)}
      >
        {shown.map((o) => {
          const p = frame.toMini(o.x, o.y);
          const fill = o.type === "sticky" ? o.color : o.type === "shape" ? o.fill : undefined;
          return o.type === "frame" ? (
            <rect key={o.id} x={p.x} y={p.y} width={Math.max(1.5, o.width * frame.s)} height={Math.max(1.5, o.height * frame.s)} fill="none" stroke="currentColor" strokeOpacity={0.35} className="text-muted" />
          ) : (
            <rect key={o.id} x={p.x} y={p.y} width={Math.max(1.5, o.width * frame.s)} height={Math.max(1.5, o.height * frame.s)} rx={1} fill={fill && fill !== "transparent" ? fill : "currentColor"} fillOpacity={fill && fill !== "transparent" ? 0.9 : 0.45} className="text-muted" />
          );
        })}
        <rect x={vTL.x} y={vTL.y} width={view.width * frame.s} height={view.height * frame.s} fill="#4F46E5" fillOpacity={0.1} stroke="#4F46E5" strokeWidth={1.5} rx={2} />
      </svg>
    </div>
  );
}
