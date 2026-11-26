import { useBoard } from "../store";
import { useUI } from "../ui";
import { PEN_COLORS, PEN_WIDTHS } from "../pen";

// The pen's options (appear while the Pen or Eraser tool is active): pen or highlighter, colour, thickness.
export default function PenBar() {
  const tool = useBoard((s) => s.tool);
  const canEdit = useBoard((s) => s.role !== "viewer");
  const pen = useUI((s) => s.pen);
  const setPen = useUI((s) => s.setPen);
  const setTool = useBoard((s) => s.setTool);
  if (!canEdit || (tool !== "pen" && tool !== "eraser")) return null;
  const btn = (on: boolean) => `h-8 rounded-md px-2.5 text-xs font-medium transition ${on ? "bg-brand text-white" : "text-muted hover:bg-sunken hover:text-ink"}`;
  return (
    <div className="absolute bottom-20 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 shadow-float" role="toolbar" aria-label="Pen options" data-testid="pen-bar">
      <div className="flex gap-0.5">
        <button data-testid="pen-mode-pen" aria-pressed={tool === "pen" && pen.mode === "pen"} onClick={() => { setTool("pen"); setPen({ mode: "pen" }); }} className={btn(tool === "pen" && pen.mode === "pen")}>Pen</button>
        <button data-testid="pen-mode-highlighter" aria-pressed={tool === "pen" && pen.mode === "highlighter"} onClick={() => { setTool("pen"); setPen({ mode: "highlighter" }); }} className={btn(tool === "pen" && pen.mode === "highlighter")}>Highlighter</button>
        <button data-testid="pen-mode-eraser" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={btn(tool === "eraser")}>Eraser</button>
      </div>
      {tool === "pen" && (
        <>
          <div className="h-6 w-px bg-line" />
          <div className="flex items-center gap-1.5" role="group" aria-label="Pen colour">
            {PEN_COLORS.map((c) => (
              <button key={c} data-testid={`pen-color-${c}`} onClick={() => setPen({ color: c })} aria-label={`Pen colour ${c}`} aria-pressed={pen.color === c} className={`h-6 w-6 rounded-full border border-black/10 transition hover:scale-110 ${pen.color === c ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""}`} style={{ background: c }} />
            ))}
          </div>
          <div className="h-6 w-px bg-line" />
          <div className="flex items-center gap-1" role="group" aria-label="Line thickness">
            {PEN_WIDTHS.map((w) => (
              <button key={w} data-testid={`pen-width-${w}`} onClick={() => setPen({ width: w })} aria-label={`Thickness ${w}`} aria-pressed={pen.width === w} className={`flex h-8 w-8 items-center justify-center rounded-md ${pen.width === w ? "bg-brand-soft" : "hover:bg-sunken"}`}>
                <span className="rounded-full" style={{ width: Math.min(20, w + 2), height: Math.min(20, w + 2), background: pen.color }} />
              </button>
            ))}
          </div>
        </>
      )}
      {tool === "eraser" && <span className="text-xs text-muted">Drag over a drawing to remove it. Undo brings it back.</span>}
    </div>
  );
}
