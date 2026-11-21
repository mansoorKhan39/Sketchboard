import { VoteButtons } from "./Extras";
import { voterId } from "../extras";
import { useAuth } from "../auth";
import { useBoard } from "../store";
import { INK_COLORS, SHAPE_FILLS, STICKY_COLORS } from "../constants";
import { lastShapeKind } from "./Canvas";
import type { BoardObject, ShapeKind } from "../types";
import { contentBounds } from "../geometry";

const SIZES = [
  { label: "S", px: 16 },
  { label: "M", px: 24 },
  { label: "L", px: 36 },
  { label: "XL", px: 52 },
];

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

// Floating bar that sits just above the selection (or just below it when there is no room above).
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
  const viewport = useBoard((s) => s.viewport);
  if (!selected.length || !canEdit) return null;

  // Where to float: centred over the selection's box, kept inside the window and clear of the top bar.
  const box = contentBounds(selected, 0);
  const W = window.innerWidth;
  let left = W / 2;
  let top = 84;
  let flip = false;
  if (box) {
    left = Math.min(W - 24, Math.max(24, (box.x + box.width / 2) * viewport.scale + viewport.x));
    const above = box.y * viewport.scale + viewport.y - 44; // leaves room for the rotate handle
    const below = (box.y + box.height) * viewport.scale + viewport.y + 14;
    if (above < 150) {
      flip = true;
      top = Math.min(window.innerHeight - 90, below);
    } else top = above;
  }

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
    <div className="pointer-events-none absolute z-20" style={{ left, top, transform: `translate(-50%, ${flip ? "0" : "-100%"})` }}>
    <div
      data-testid="context-bar"
      className="glass pop-in-center pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-3 overflow-x-auto whitespace-nowrap rounded-xl px-3 py-2"
    >
      <span className="whitespace-nowrap text-xs font-medium capitalize text-muted">{selected.length > 1 ? `${selected.length} selected` : first.type}</span>
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
        <>
          <div className="flex rounded-lg bg-sunken p-0.5" role="group" aria-label="Font size">
            {SIZES.map((z) => (
              <button
                key={z.label}
                data-testid={`size-${z.label}`}
                aria-pressed={first.fontSize === z.px}
                onClick={() => patchAll((o) => (o.type === "text" ? { fontSize: z.px, height: Math.round(z.px * 1.3) } : null))}
                className={`rounded-md px-2 py-1 text-xs font-medium ${first.fontSize === z.px ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {z.label}
              </button>
            ))}
          </div>
          <Swatches colors={INK_COLORS} value={first.color} onPick={(c) => patchAll((o) => (o.type === "text" ? { color: c } : null))} />
        </>
      )}
      {selected.length === 1 && first.type === "frame" && (
        <>
          <input
            value={first.text}
            maxLength={80}
            data-testid="frame-title"
            aria-label="Frame title"
            onChange={(e) => updateObjects({ [first.id]: { text: e.target.value } })}
            className="h-8 w-40 rounded-lg border border-line bg-canvas px-2 text-sm outline-none focus:border-brand"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Slide
            <input
              type="number"
              min={1}
              max={999}
              value={first.slide}
              data-testid="frame-slide"
              onChange={(e) => updateObjects({ [first.id]: { slide: Math.min(999, Math.max(1, Math.round(Number(e.target.value) || 1))) } })}
              className="h-8 w-16 rounded-lg border border-line bg-canvas px-2 text-sm text-ink outline-none focus:border-brand"
            />
          </label>
          <button
            onClick={() => useBoard.getState().startPresent(first.id)}
            data-testid="present-from"
            className="rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-strong"
          >
            Present from here
          </button>
        </>
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
      {selected.length === 1 && (first.type === "sticky" || first.type === "shape" || first.type === "text") && (
        <>
          <button
            data-testid="add-child"
            title="Add a linked note (Tab)"
            onClick={() => {
              const s = useBoard.getState();
              const id = s.addChildNode(first.id, voterId(useAuth.getState().user?.id));
              if (id) s.setEditing(id);
            }}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-sunken hover:text-ink"
          >
            Add child
          </button>
          {divider}
        </>
      )}
      {selected.some((o) => o.type !== "connector" && o.type !== "frame" && o.type !== "comment") && (
        <>
          {divider}
          <VoteButtons ids={selected.map((o) => o.id)} />
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
    </div>
  );
}
