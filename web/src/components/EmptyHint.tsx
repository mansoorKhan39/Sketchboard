import { isOverlay } from "../kinds";
import { useBoard } from "../store";
import type { Tool } from "../types";

const HINTS: { key: string; name: string; tool: Tool }[] = [
  { key: "N", name: "Sticky note", tool: "sticky" },
  { key: "S", name: "Shape", tool: "shape" },
  { key: "P", name: "Pen", tool: "pen" },
  { key: "T", name: "Text", tool: "text" },
];

// Shown only while the board is empty. It disappears as soon as anything is added.
// The four pills are real buttons: one click picks the tool and the card goes away.
export default function EmptyHint() {
  const empty = useBoard((s) => !s.objects.some((o) => !isOverlay(o)) && s.loaded && s.role !== "viewer");
  const setTool = useBoard((s) => s.setTool);
  const tool = useBoard((s) => s.tool);
  // Once a tool is picked (by key or by a pill) the card steps aside, so the next click lands on the canvas.
  if (!empty || tool !== "select") return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="glass pop-in-center max-w-sm rounded-2xl p-6 text-center">
        <div className="text-base font-semibold">This board is empty</div>
        <p className="mt-1 text-sm text-muted">Pick a tool on the left or press a key, then click on the canvas.</p>
        <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-2">
          {HINTS.map((h) => (
            <button
              key={h.key}
              onClick={() => setTool(h.tool)}
              aria-pressed={tool === h.tool}
              data-testid={`hint-${h.tool}`}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:border-brand hover:bg-brand-soft ${
                tool === h.tool ? "border-brand bg-brand-soft" : "border-line"
              }`}
            >
              {h.name}
              <kbd className="rounded bg-sunken px-1.5 py-0.5 font-sans text-[10px] text-muted">{h.key}</kbd>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Hold Space and drag to move around. Scroll to zoom.</p>
      </div>
    </div>
  );
}
