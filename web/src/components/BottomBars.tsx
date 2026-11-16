import { useBoard } from "../store";

export default function BottomBars() {
  const scale = useBoard((s) => s.viewport.scale);
  const zoomBy = useBoard((s) => s.zoomBy);
  const fit = useBoard((s) => s.fitToContent);
  const undo = useBoard((s) => s.undo);
  const redo = useBoard((s) => s.redo);
  const canUndo = useBoard((s) => s.past.length > 0);
  const canRedo = useBoard((s) => s.future.length > 0);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const btn = "flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  const bar = "absolute bottom-4 z-20 flex items-center gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-float";
  const ic = (d: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );

  return (
    <>
      <div className={`${bar} left-4`}>
        <button className={btn} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">{ic("M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3")}</button>
        <button className={btn} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">{ic("M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3")}</button>
      </div>
      <div className={`${bar} right-4`}>
        <button className={btn} onClick={() => zoomBy(1 / 1.2, cx, cy)} aria-label="Zoom out">{ic("M5 12h14")}</button>
        <button
          onClick={() => zoomBy(1 / scale, cx, cy)}
          title="Reset to 100%"
          data-testid="zoom"
          className="h-8 w-14 rounded-lg text-center text-xs font-medium tabular-nums text-ink hover:bg-sunken"
        >
          {Math.round(scale * 100)}%
        </button>
        <button className={btn} onClick={() => zoomBy(1.2, cx, cy)} aria-label="Zoom in">{ic("M12 5v14M5 12h14")}</button>
        <div className="mx-1 h-5 w-px bg-line" />
        <button className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted hover:bg-sunken hover:text-ink" onClick={() => fit(window.innerWidth, window.innerHeight)} title="Fit all (Shift+1)">
          Fit
        </button>
      </div>
    </>
  );
}
