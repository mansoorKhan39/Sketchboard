import { useEffect, useState } from "react";
import { useBoard } from "../store";

// Other people's pointers, drawn over the canvas in their own colour with their name.
export default function PeerCursors() {
  const cursors = useBoard((s) => s.cursors);
  const peers = useBoard((s) => s.peers);
  const viewport = useBoard((s) => s.viewport);
  const [now, setNow] = useState(Date.now());

  // hide a cursor that has not moved for a while (someone idle or tabbed away)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
      {peers.map((p) => {
        const c = cursors[p.id];
        if (!c || now - c.at > 12_000) return null;
        return (
          <div
            key={p.id}
            data-testid="peer-cursor"
            className="absolute left-0 top-0 transition-transform duration-100 ease-linear"
            style={{ transform: `translate(${c.x * viewport.scale + viewport.x}px, ${c.y * viewport.scale + viewport.y}px)` }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={p.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M5 3l14 8-6 2-2 6z" />
            </svg>
            <span
              className="ml-3 -mt-1 inline-block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white"
              style={{ background: p.color }}
            >
              {p.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
