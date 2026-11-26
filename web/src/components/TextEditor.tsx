import { isOverlay } from "../kinds";
import { useEffect, useRef } from "react";
import { useBoard } from "../store";
import { nextCell, setCell } from "../table";
import RichEditor from "./RichEditor";

// A plain HTML <textarea> placed exactly over the object (or table cell) being edited.
// (Konva has no built-in text input, so this is the standard approach.)
export default function TextEditor() {
  const editingId = useBoard((s) => s.editingId);
  const cell = useBoard((s) => s.editingCell);
  const obj = useBoard((s) => s.objects.find((o) => o.id === s.editingId));
  const viewport = useBoard((s) => s.viewport);
  const ref = useRef<HTMLTextAreaElement>(null);
  const skipBlur = useRef(false);
  const viaKey = useRef(false); // true when we got here by Tab/Enter from another cell

  useEffect(() => {
    if (!editingId) return;
    // Focus a moment later: the browser's own mousedown handling (which moves focus to the canvas)
    // runs right after our handler, and would otherwise steal focus and close the editor at once.
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [editingId, cell?.r, cell?.c]);

  if (!editingId || !obj || obj.type === "stroke" || obj.type === "connector" || obj.type === "image" || obj.type === "frame" || isOverlay(obj)) return null;

  // sticky notes, shapes and text boxes get the word-by-word editor; only table cells use the plain box below
  if (obj.type !== "table") return <RichEditor key={obj.id} obj={obj} />;

  const k = viewport.scale;
  const fontSize = (obj.fs || 15) * k;

  // the box to type in: the whole object, or just one table cell
  let box = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
  if (!cell || !obj.cells[cell.r]) return null;
  const rows = obj.cells.length, cols = obj.cells[0].length;
  box = { x: obj.x + (cell.c * obj.width) / cols, y: obj.y + (cell.r * obj.height) / rows, w: obj.width / cols, h: obj.height / rows };
  const value = obj.cells[cell.r][cell.c] ?? "";

  const finish = (text: string, next: { r: number; c: number } | null = null) => {
    const { updateObjects, setEditing, setEditingCell } = useBoard.getState();
    if (text !== value) updateObjects({ [obj.id]: { cells: setCell(obj.cells, cell.r, cell.c, text) } });
    viaKey.current = !!next;
    if (next) setEditingCell(obj.id, next.r, next.c);
    else setEditing(null);
  };

  const align = obj.align ?? "left";
  return (
    <textarea
      ref={ref}
      key={`${editingId}-${cell?.r}-${cell?.c}`}
      defaultValue={value}
      autoFocus={viaKey.current} // moving between cells must not lose keystrokes typed right after Tab
      onBlur={(e) => {
        if (skipBlur.current) return;
        finish(e.target.value);
      }}
      onKeyDown={(e) => {
        e.stopPropagation(); // keep shortcuts (V, N, Delete...) from firing while typing
        const el = e.target as HTMLTextAreaElement;
        if (e.key === "Escape") el.blur();
        else if ((e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
          e.preventDefault(); // Tab: next cell; Enter: cell below; Shift+Tab: previous
          const nxt = e.key === "Enter" ? (cell.r + 1 < obj.cells.length ? { r: cell.r + 1, c: cell.c } : null) : nextCell(obj.cells, cell.r, cell.c, e.shiftKey);
          skipBlur.current = true;
          finish(el.value, nxt);
          skipBlur.current = false;
        }
      }}
      className="absolute resize-none border-2 border-brand rounded-sm bg-transparent outline-none"
      style={{
        left: box.x * k + viewport.x,
        top: box.y * k + viewport.y,
        width: box.w * k,
        height: box.h * k,
        fontSize,
        padding: 6 * k,
        textAlign: align,
        fontWeight: obj.bold || (obj.header && cell?.r === 0) ? 700 : 400,
        fontStyle: obj.italic ? "italic" : "normal",
        textDecoration: obj.underline ? "underline" : "none",
        color: "#1F2937",
        background: "rgba(255,255,255,0.92)",
        fontFamily: "Inter, sans-serif",
        lineHeight: 1.25,
        zIndex: 10,
      }}
    />
  );
}
