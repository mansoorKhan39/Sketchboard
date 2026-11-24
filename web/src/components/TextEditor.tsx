import { isOverlay } from "../kinds";
import { useEffect, useRef } from "react";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { inkFor } from "../constants";
import { nextCell, setCell } from "../table";

// A plain HTML <textarea> placed exactly over the object (or table cell) being edited.
// (Konva has no built-in text input, so this is the standard approach.)
export default function TextEditor() {
  const editingId = useBoard((s) => s.editingId);
  const cell = useBoard((s) => s.editingCell);
  const obj = useBoard((s) => s.objects.find((o) => o.id === s.editingId));
  const viewport = useBoard((s) => s.viewport);
  const theme = useUI((s) => s.theme);
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

  const k = viewport.scale;
  const isText = obj.type === "text";
  const isTable = obj.type === "table";
  const baseSize = obj.type === "sticky" ? 18 : obj.type === "shape" ? 16 : obj.type === "table" ? 15 : obj.fontSize;
  const fontSize = (obj.type === "text" ? obj.fontSize : (obj.fs || baseSize)) * k;

  // the box to type in: the whole object, or just one table cell
  let box = { x: obj.x, y: obj.y, w: obj.width, h: obj.height };
  let value = isTable ? "" : (obj as { text: string }).text;
  if (obj.type === "table") {
    if (!cell || !obj.cells[cell.r]) return null;
    const rows = obj.cells.length, cols = obj.cells[0].length;
    box = { x: obj.x + (cell.c * obj.width) / cols, y: obj.y + (cell.r * obj.height) / rows, w: obj.width / cols, h: obj.height / rows };
    value = obj.cells[cell.r][cell.c] ?? "";
  }

  const finish = (text: string, next: { r: number; c: number } | null = null) => {
    const { updateObjects, setEditing, setEditingCell, removeSelected, select } = useBoard.getState();
    if (obj.type === "table" && cell) {
      if (text !== value) updateObjects({ [obj.id]: { cells: setCell(obj.cells, cell.r, cell.c, text) } });
      viaKey.current = !!next;
      if (next) setEditingCell(obj.id, next.r, next.c);
      else setEditing(null);
      return;
    }
    if (isText && text.trim() === "") {
      select([obj.id]);
      removeSelected(); // empty text boxes disappear
    } else if (text !== value) {
      updateObjects({ [obj.id]: { text } });
    }
    setEditing(null);
  };

  const align = obj.align ?? (obj.type === "shape" ? "center" : "left");
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
        else if (isTable && cell && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
          e.preventDefault(); // Tab: next cell; Enter: cell below; Shift+Tab: previous
          const t = obj as typeof obj & { cells: string[][] };
          const nxt = e.key === "Enter" ? (cell.r + 1 < t.cells.length ? { r: cell.r + 1, c: cell.c } : null) : nextCell(t.cells, cell.r, cell.c, e.shiftKey);
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
        padding: obj.type === "sticky" ? 14 * k : obj.type === "shape" ? 10 * k : isTable ? 6 * k : 0,
        textAlign: align,
        fontWeight: obj.bold || (isTable && obj.header && cell?.r === 0) ? 700 : 400,
        fontStyle: obj.italic ? "italic" : "normal",
        textDecoration: obj.underline ? "underline" : "none",
        color: obj.type === "text" ? inkFor(obj.color, theme) : "#1F2937",
        background: isTable ? "rgba(255,255,255,0.92)" : "transparent",
        fontFamily: "Inter, sans-serif",
        lineHeight: 1.25,
        zIndex: 10,
      }}
    />
  );
}
