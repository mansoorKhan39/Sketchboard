import { isOverlay } from "../kinds";
import { useEffect, useRef } from "react";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { inkFor } from "../constants";

// A plain HTML <textarea> placed exactly over the object being edited.
// (Konva has no built-in text input, so this is the standard approach.)
export default function TextEditor() {
  const editingId = useBoard((s) => s.editingId);
  const obj = useBoard((s) => s.objects.find((o) => o.id === s.editingId));
  const viewport = useBoard((s) => s.viewport);
  const theme = useUI((s) => s.theme);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editingId) return;
    // Focus a moment later: the browser's own mousedown handling (which moves focus to the canvas)
    // runs right after our handler, and would otherwise steal focus and close the editor at once.
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [editingId]);

  if (!editingId || !obj || obj.type === "stroke" || obj.type === "connector" || obj.type === "image" || obj.type === "frame" || isOverlay(obj)) return null;

  const k = viewport.scale;
  const isText = obj.type === "text";
  const fontSize = (obj.type === "sticky" ? 18 : obj.type === "shape" ? 16 : obj.fontSize) * k;

  const finish = (value: string) => {
    const { updateObjects, setEditing, removeSelected, select } = useBoard.getState();
    if (isText && value.trim() === "") {
      select([obj.id]);
      removeSelected(); // empty text boxes disappear
    } else if (value !== obj.text) {
      updateObjects({ [obj.id]: { text: value } });
    }
    setEditing(null);
  };

  return (
    <textarea
      ref={ref}
      key={editingId}
      defaultValue={obj.text}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation(); // keep shortcuts (V, N, Delete...) from firing while typing
        if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
      }}
      className="absolute resize-none border-2 border-brand rounded-sm bg-transparent outline-none"
      style={{
        left: obj.x * k + viewport.x,
        top: obj.y * k + viewport.y,
        width: obj.width * k,
        height: obj.height * k,
        fontSize,
        padding: obj.type === "sticky" ? 14 * k : obj.type === "shape" ? 10 * k : 0,
        textAlign: obj.type === "shape" ? "center" : "left",
        color: obj.type === "text" ? inkFor(obj.color, theme) : "#1F2937",
        fontFamily: "Inter, sans-serif",
        lineHeight: 1.25,
        zIndex: 10,
      }}
    />
  );
}
