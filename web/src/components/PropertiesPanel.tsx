import { VoteButtons } from "./Extras";
import { voterId } from "../extras";
import { useAuth } from "../auth";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { richColor, richCommand, richState, RICH_TYPES } from "../richdom";
import { SHAPE_KINDS } from "../shapes";
import { addCol, addRow, removeCol, removeRow } from "../table";
import { FONT_SIZES, firstLink } from "../textstyle";
import type { AlignMode } from "../arrange";
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
function ArrangeMenu({ count, grouped, locked, below }: { count: number; grouped: boolean; locked: boolean; below: boolean }) {
  const [open, setOpen] = useState(false);
  const s = useBoard.getState();
  const b = "rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  const lab = "px-1 text-[11px] text-muted";
  const align: [AlignMode, string][] = [["left", "Left"], ["hcenter", "Centre"], ["right", "Right"], ["top", "Top"], ["vcenter", "Middle"], ["bottom", "Bottom"]];
  return (
    <>
      <button
        data-testid="arrange"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${open ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"}`}
      >
        Arrange
      </button>
      {open && (
        <div data-testid="arrange-panel" className={`glass pointer-events-auto absolute left-1/2 z-30 w-72 ${below ? "top-full mt-2" : "bottom-full mb-2"} -translate-x-1/2 space-y-1.5 rounded-xl p-2.5`}>
          <div className={lab}>Layer</div>
          <div className="flex flex-wrap gap-0.5">
            <button className={b} data-testid="layer-front" onClick={() => s.moveLayer("front")}>To front</button>
            <button className={b} data-testid="layer-forward" onClick={() => s.moveLayer("forward")}>Forward</button>
            <button className={b} data-testid="layer-backward" onClick={() => s.moveLayer("backward")}>Backward</button>
            <button className={b} data-testid="layer-back" onClick={() => s.moveLayer("back")}>To back</button>
          </div>
          <div className={lab}>Align {count < 2 && "(pick 2 or more)"}</div>
          <div className="flex flex-wrap gap-0.5">
            {align.map(([m, t]) => (
              <button key={m} className={b} disabled={count < 2} data-testid={`align-${m}`} onClick={() => s.alignSelected(m)}>{t}</button>
            ))}
          </div>
          <div className={lab}>Spread out {count < 3 && "(pick 3 or more)"}</div>
          <div className="flex gap-0.5">
            <button className={b} disabled={count < 3} data-testid="spread-h" onClick={() => s.distributeSelected("h")}>Sideways</button>
            <button className={b} disabled={count < 3} data-testid="spread-v" onClick={() => s.distributeSelected("v")}>Up and down</button>
          </div>
          <div className="flex gap-0.5 border-t border-line pt-1.5">
            <button className={b} disabled={count < 2} data-testid="group" onClick={() => s.groupSelected()}>Group</button>
            <button className={b} disabled={!grouped} data-testid="ungroup" onClick={() => s.ungroupSelected()}>Ungroup</button>
            <button className={b} data-testid="lock" onClick={() => s.lockSelected(!locked)}>{locked ? "Unlock" : "Lock"}</button>
          </div>
        </div>
      )}
    </>
  );
}

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
  const editingId = useBoard((s) => s.editingId);
  // while words are being edited (sticky, shape, text box), the B / I / U buttons and colours act on the selected words
  const richEditing = !!editingId && selected.length === 1 && selected[0].id === editingId && (RICH_TYPES as readonly string[]).includes(selected[0].type);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!richEditing) return;
    const on = () => bump((n) => n + 1);
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, [richEditing]);
  const viewport = useBoard((s) => s.viewport);
  // The bar's real width, so it can be kept inside the window (it is wider for text and tables).
  const barRef = useRef<HTMLDivElement>(null);
  const [barW, setBarW] = useState(0);
  useLayoutEffect(() => {
    const w = barRef.current?.offsetWidth ?? 0;
    if (w !== barW) setBarW(w);
  });

  if (!selected.length || !canEdit) return null;

  // Where to float: centred over the selection's box, kept inside the window and clear of the top bar.
  const box = contentBounds(selected, 0);
  const W = window.innerWidth;
  let left = W / 2;
  let top = 84;
  let flip = false;
  if (box) {
    const half = barW / 2 + 8;
    const mid = (box.x + box.width / 2) * viewport.scale + viewport.x;
    left = half * 2 >= W ? W / 2 : Math.min(W - half, Math.max(half, mid));
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
  const things = selected.filter((o) => o.type !== "connector" && o.type !== "comment");
  const anyGroup = things.some((o) => o.group);
  const allLocked = things.length > 0 && things.every((o) => o.locked);
  const allType = selected.every((o) => o.type === first.type);
  const canDuplicate = selected.some((o) => o.type !== "connector");

  return (
    <div className="pointer-events-none absolute z-20" style={{ left, top, transform: `translate(-50%, ${flip ? "0" : "-100%"})` }}>
    <div
      ref={barRef}
      data-testid="context-bar"
      className="glass pop-in-center pointer-events-auto flex max-w-[min(760px,calc(100vw-2rem))] flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl px-3 py-2"
    >
      <span className="whitespace-nowrap text-xs font-medium capitalize text-muted">{selected.length > 1 ? `${selected.length} selected` : first.type}</span>
      {divider}
      {allType && first.type === "sticky" && (
        <Swatches colors={STICKY_COLORS} value={first.color} onPick={(c) => patchAll((o) => (o.type === "sticky" ? { color: c } : null))} />
      )}
      {allType && first.type === "shape" && (
        <>
          <select
            aria-label="Shape"
            data-testid="shape-kind"
            value={first.kind}
            onChange={(e) => {
              const k = e.target.value as ShapeKind;
              lastShapeKind.current = k;
              patchAll((o) => (o.type === "shape" ? { kind: k } : null));
            }}
            className="h-8 rounded-lg border border-line bg-canvas px-2 text-xs text-ink outline-none focus:border-brand"
          >
            {SHAPE_KINDS.map((s) => (
              <option key={s.kind} value={s.kind}>{s.label}</option>
            ))}
          </select>
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
      {selected.every((o) => o.type === "sticky" || o.type === "shape" || o.type === "text" || o.type === "table") && (
        <>
          <div className="flex gap-0.5" role="group" aria-label="Text style">
            {([["bold", "B", "font-bold"], ["italic", "I", "italic"], ["underline", "U", "underline"], ["bullets", "•", ""]] as const).map(([k, t, cls]) => (
              <button
                key={k}
                data-testid={`fmt-${k}`}
                aria-label={k}
                aria-pressed={richEditing && k !== "bullets" ? richState(k) : !!first[k]}
                onMouseDown={(e) => e.preventDefault()} // keep the selected words selected
                onClick={() => {
                  if (richEditing && k !== "bullets") return richCommand(k);
                  const on = !selected.every((o) => o[k]);
                  patchAll(() => ({ [k]: on }));
                }}
                className={`h-7 w-7 rounded-md text-xs ${cls} ${(richEditing && k !== "bullets" ? richState(k) : selected.every((o) => o[k])) ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>
          {richEditing && (
            <div className="flex items-center gap-1" role="group" aria-label="Word colour" data-testid="word-colours">
              {INK_COLORS.map((c) => (
                <button key={c} onMouseDown={(e) => e.preventDefault()} onClick={() => richColor(c)} aria-label={`Word colour ${c}`} className="h-5 w-5 rounded-full border border-black/10 hover:scale-110" style={{ background: c }} />
              ))}
            </div>
          )}
          <div className="flex gap-0.5" role="group" aria-label="Alignment">
            {(["left", "center", "right"] as const).map((a) => (
              <button
                key={a}
                data-testid={`fmt-${a}`}
                aria-label={`Align ${a}`}
                aria-pressed={first.align === a}
                onClick={() => patchAll(() => ({ align: a }))}
                className={`h-7 rounded-md px-1.5 text-[11px] ${first.align === a ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"}`}
              >
                {a === "left" ? "⇤" : a === "center" ? "↔" : "⇥"}
              </button>
            ))}
          </div>
          {!(allType && first.type === "text") && (
            <select
              aria-label="Font size"
              data-testid="fmt-size"
              value={first.fs || ""}
              onChange={(e) => patchAll(() => ({ fs: e.target.value ? Number(e.target.value) : 0 }))}
              className="h-7 rounded-md border border-line bg-canvas px-1 text-xs text-ink outline-none focus:border-brand"
            >
              <option value="">Size</option>
              {FONT_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
          {selected.length === 1 && first.type !== "table" && ("text" in first && firstLink(first.text)) && (
            <a
              data-testid="open-link"
              href={"text" in first ? firstLink(first.text)! : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg px-2 py-1 text-xs font-medium text-brand hover:bg-sunken"
            >
              Open link
            </a>
          )}
          {divider}
        </>
      )}
      {selected.length === 1 && first.type === "table" && (
        <>
          {(
            [
              ["add-row", "+ Row", () => updateObjects({ [first.id]: { cells: addRow(first.cells, first.cells.length), height: (first.height * (first.cells.length + 1)) / first.cells.length } }), first.cells.length >= 30],
              ["del-row", "− Row", () => updateObjects({ [first.id]: { cells: removeRow(first.cells, first.cells.length - 1), height: (first.height * (first.cells.length - 1)) / first.cells.length } }), first.cells.length <= 1],
              ["add-col", "+ Col", () => updateObjects({ [first.id]: { cells: addCol(first.cells, first.cells[0].length), width: (first.width * (first.cells[0].length + 1)) / first.cells[0].length } }), first.cells[0].length >= 12],
              ["del-col", "− Col", () => updateObjects({ [first.id]: { cells: removeCol(first.cells, first.cells[0].length - 1), width: (first.width * (first.cells[0].length - 1)) / first.cells[0].length } }), first.cells[0].length <= 1],
            ] as const
          ).map(([id, label, run, off]) => (
            <button key={id} data-testid={id} disabled={off} onClick={run} className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-sunken hover:text-ink disabled:opacity-30">
              {label}
            </button>
          ))}
          <button
            data-testid="table-header"
            aria-pressed={first.header}
            onClick={() => updateObjects({ [first.id]: { header: !first.header } })}
            className={`rounded-md px-2 py-1 text-xs font-medium ${first.header ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"}`}
          >
            Header row
          </button>
          {divider}
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
          <Segment
            options={["solid", "dashed", "dotted"] as const}
            value={first.dash ?? "solid"}
            onPick={(k) => patchAll((o) => (o.type === "connector" ? { dash: k } : null))}
          />
          <button
            onClick={() => patchAll((o) => (o.type === "connector" ? { startArrow: !o.startArrow } : null))}
            aria-pressed={!!first.startArrow}
            data-testid="start-arrow"
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${first.startArrow ? "bg-brand text-white" : "bg-sunken text-muted hover:text-ink"}`}
          >
            Start arrow
          </button>
          <button
            onClick={() => patchAll((o) => (o.type === "connector" ? { endArrow: !o.endArrow } : null))}
            aria-pressed={first.endArrow}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${first.endArrow ? "bg-brand text-white" : "bg-sunken text-muted hover:text-ink"}`}
          >
            End arrow
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
      {things.length > 0 && <ArrangeMenu count={things.length} grouped={anyGroup} locked={allLocked} below={(flip ? top : top - 42) < 270} />}
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
