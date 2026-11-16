import { useBoard } from "../store";
import { INK_COLORS, SHAPE_FILLS, STICKY_COLORS } from "../constants";
import { lastShapeKind } from "./Canvas";
import type { BoardObject, ShapeKind } from "../types";

function Swatches({ colors, value, onPick }: { colors: string[]; value?: string; onPick: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onPick(c)}
          aria-label={`Colour ${c}`}
          aria-pressed={value === c}
          className={`h-6 w-6 rounded-full border border-black/10 transition hover:scale-110 ${
            value === c ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function Segment<T extends string>({ options, value, onPick }: { options: T[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onPick(o)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
            value === o ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const divider = <div className="h-6 w-px bg-line" />;

// Floating bar under the top bar, shown when something is selected.
export default function PropertiesPanel() {
  // Select the raw state, then filter. (Filtering inside the selector returns a new array every time,
  // which makes zustand v5 re-render forever.)
  const objects = useBoard((s) => s.objects);
  const selectedIds = useBoard((s) => s.selectedIds);
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const updateObjects = useBoard((s) => s.updateObjects);
  const removeSelected = useBoard((s) => s.removeSelected);
  const duplicateSelected = useBoard((s) => s.duplicateSelected);

  const canEdit = useBoard((s) => s.role !== "viewer");
  if (!selected.length || !canEdit) return null;

  const patchAll = (make: (o: BoardObject) => Partial<BoardObject> | null) => {
    const patches: Record<string, Partial<BoardObject>> = {};
    for (const o of selected) {
      const p = make(o);
      if (p) patches[o.id] = p;
    }
    updateObjects(patches);
  };

  const first = selected[0];
  const allType = selected.every((o) => o.type === first.type);
  const canDuplicate = selected.some((o) => o.type !== "connector");

  return (
    <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 shadow-float">
      <span className="text-xs font-medium text-muted">{selected.length > 1 ? `${selected.length} selected` : first.type}</span>
      {divider}
      {allType && first.type === "sticky" && (
        <Swatches colors={STICKY_COLORS} value={first.color} onPick={(c) => patchAll((o) => (o.type === "sticky" ? { color: c } : null))} />
      )}
      {allType && first.type === "shape" && (
        <>
          <Segment
            options={["rect", "ellipse", "diamond"] as ShapeKind[]}
            value={first.kind}
            onPick={(k) => {
              lastShapeKind.current = k;
              patchAll((o) => (o.type === "shape" ? { kind: k } : null));
            }}
          />
          <Swatches colors={SHAPE_FILLS} value={first.fill} onPick={(c) => patchAll((o) => (o.type === "shape" ? { fill: c } : null))} />
        </>
      )}
      {allType && first.type === "stroke" && (
        <Swatches colors={INK_COLORS} value={first.color} onPick={(c) => patchAll((o) => (o.type === "stroke" ? { color: c } : null))} />
      )}
      {allType && first.type === "text" && (
        <Swatches colors={INK_COLORS} value={first.color} onPick={(c) => patchAll((o) => (o.type === "text" ? { color: c } : null))} />
      )}
      {allType && first.type === "connector" && (
        <>
          <Segment
            options={["straight", "elbow"] as const}
            value={first.lineStyle}
            onPick={(k) => patchAll((o) => (o.type === "connector" ? { lineStyle: k } : null))}
          />
          <button
            onClick={() => patchAll((o) => (o.type === "connector" ? { endArrow: !o.endArrow } : null))}
            aria-pressed={first.endArrow}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${first.endArrow ? "bg-brand text-white" : "bg-sunken text-muted hover:text-ink"}`}
          >
            Arrow
          </button>
          <Swatches colors={INK_COLORS} value={first.color} onPick={(c) => patchAll((o) => (o.type === "connector" ? { color: c } : null))} />
        </>
      )}
      {divider}
      <div className="flex gap-1">
        {canDuplicate && (
          <button onClick={duplicateSelected} className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-sunken hover:text-ink">
            Duplicate
          </button>
        )}
        <button onClick={removeSelected} data-testid="delete" className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10">
          Delete
        </button>
      </div>
    </div>
  );
}
