import { useBoard } from "../store";

const HINTS = [
  ["N", "Sticky note"],
  ["S", "Shape"],
  ["P", "Pen"],
  ["T", "Text"],
] as const;

// Shown only while the board is empty. It disappears as soon as anything is added.
export default function EmptyHint() {
  const empty = useBoard((s) => s.objects.length === 0 && s.loaded && s.role !== "viewer");
  if (!empty) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="max-w-sm rounded-2xl border border-line bg-surface/90 p-6 text-center shadow-float backdrop-blur">
        <div className="text-base font-semibold">This board is empty</div>
        <p className="mt-1 text-sm text-muted">Pick a tool on the left or press a key, then click on the canvas.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {HINTS.map(([k, name]) => (
            <span key={k} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm">
              {name}
              <kbd className="rounded bg-sunken px-1.5 py-0.5 text-[10px] text-muted">{k}</kbd>
            </span>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Hold Space and drag to move around. Scroll to zoom.</p>
      </div>
    </div>
  );
}
