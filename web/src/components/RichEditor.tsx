import { useLayoutEffect, useRef } from "react";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { inkFor } from "../constants";
import { domToRich, richToHtml } from "../richdom";
import { sameSpans } from "../richtext";
import type { Shape, Sticky, TextObj } from "../types";

// Editing text on a sticky note, shape or text box. It is an HTML "contentEditable" box placed over the object, so single
// words can be bold, italic, underlined or coloured (select words, then use Ctrl+B / I / U or the format bar).
// Whole-object formatting that was set before is moved into the words while editing (so nothing looks different).
export default function RichEditor({ obj }: { obj: Sticky | Shape | TextObj }) {
  const viewport = useBoard((s) => s.viewport);
  const theme = useUI((s) => s.theme);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const base = { b: obj.bold, i: obj.italic, u: obj.underline };
  const initial = useRef({ text: obj.text, html: richToHtml(obj.text, obj.spans, base) });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initial.current.html;
    document.execCommand("styleWithCSS", false, "true"); // formatting becomes style="..." (easy to read back)
    const t = setTimeout(() => {
      // focus a moment later: the browser's own mousedown handling would otherwise steal it (same as the plain editor)
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }, 30);
    return () => clearTimeout(t);
  }, []);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const el = ref.current;
    const { updateObjects, setEditing, removeSelected, select } = useBoard.getState();
    const cur = useBoard.getState().objects.find((o) => o.id === obj.id) as Sticky | Shape | TextObj | undefined;
    if (!el || !cur) return setEditing(null);
    const { text: raw, spans } = domToRich(el);
    const text = raw.slice(0, 5000);
    const was = richToHtml(cur.text, cur.spans, { b: cur.bold, i: cur.italic, u: cur.underline });
    if (obj.type === "text" && text.trim() === "") {
      select([obj.id]);
      removeSelected(); // empty text boxes disappear
    } else if (text !== cur.text || was !== richToHtml(text, spans)) {
      const unchanged = text === cur.text && sameSpans(spans, cur.spans) && !cur.bold && !cur.italic && !cur.underline;
      if (!unchanged) updateObjects({ [obj.id]: { text, spans: spans.filter((s) => s.e <= text.length), bold: false, italic: false, underline: false } });
    }
    setEditing(null);
  };

  const k = viewport.scale;
  const size = (obj.type === "text" ? obj.fontSize : obj.fs || (obj.type === "sticky" ? 18 : 16)) * k;
  const align = obj.align ?? (obj.type === "shape" ? "center" : "left");
  const pad = obj.type === "sticky" ? 14 * k : obj.type === "shape" ? 10 * k : 0;
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Edit text"
      data-testid="rich-editor"
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation(); // keep shortcuts (V, N, Delete...) from firing while typing
        if (e.key === "Escape") ref.current?.blur();
        else if (e.key === "Enter") {
          e.preventDefault();
          document.execCommand("insertLineBreak");
        }
      }}
      onPaste={(e) => {
        e.preventDefault(); // only the words come in, not the other page's styles
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain").replace(/\r/g, ""));
      }}
      className="absolute overflow-auto rounded-sm border-2 border-brand bg-transparent outline-none"
      style={{
        left: obj.x * k + viewport.x,
        top: obj.y * k + viewport.y,
        width: obj.width * k,
        height: obj.height * k,
        fontSize: size,
        padding: pad,
        textAlign: align,
        color: obj.type === "text" ? inkFor(obj.color, theme) : "#1F2937",
        fontFamily: "Inter, sans-serif",
        lineHeight: 1.25,
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        zIndex: 10,
        boxSizing: "border-box",
      }}
    />
  );
}
