import { useEffect, useRef, useState } from "react";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { zoomStep, zoomToFit, zoomToScale, zoomToSelection } from "../navigation";
import Minimap from "./Minimap";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";

export default function BottomBars() {
  const scale = useBoard((s) => s.viewport.scale);
  const undo = useBoard((s) => s.undo);
  const redo = useBoard((s) => s.redo);
  const canUndo = useBoard((s) => s.past.length > 0);
  const canRedo = useBoard((s) => s.future.length > 0);

  const btn = "flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  const bar = "glass absolute bottom-4 z-20 flex items-center gap-0.5 rounded-xl p-1";
  const ic = (d: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );

  return (
    <>
      <div className={`${bar} left-4`}>
        <button className={btn} disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">{ic("M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3")}</button>
        <button className={btn} disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">{ic("M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3")}</button>
      </div>
      <Minimap />
      <div className={`${bar} right-4`}>
        <button className={btn} onClick={() => zoomStep(1 / 1.25)} title={`Zoom out (${MOD}-)`} aria-label="Zoom out">{ic("M5 12h14")}</button>
        <ZoomMenu scale={scale} />
        <button className={btn} onClick={() => zoomStep(1.25)} title={`Zoom in (${MOD}+)`} aria-label="Zoom in">{ic("M12 5v14M5 12h14")}</button>
        <div className="mx-1 h-5 w-px bg-line" />
        <button className={btn} onClick={zoomToFit} title="Fit to screen (Shift+1)" aria-label="Fit to screen" data-testid="fit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V5a1 1 0 011-1h4M15 4h4a1 1 0 011 1v4M20 15v4a1 1 0 01-1 1h-4M9 20H5a1 1 0 01-1-1v-4" /></svg>
        </button>
      </div>
    </>
  );
}

// The zoom percentage is a button: it opens the menu every design tool has (presets, fit, selection) plus two
// personal settings for how to move around.
function ZoomMenu({ scale }: { scale: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hasSelection = useBoard((s) => s.selectedIds.length > 0);
  const wheelMode = useUI((s) => s.wheelMode);
  const minimap = useUI((s) => s.minimap);
  const { setWheelMode, setMinimap } = useUI.getState();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const run = (f: () => void) => () => {
    f();
    setOpen(false);
  };
  const item = "flex w-full items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-left text-sm text-ink transition hover:bg-sunken disabled:opacity-40 disabled:hover:bg-transparent";
  const key = "text-xs text-muted";
  const seg = (on: boolean) => `flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${on ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`;

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Zoom options"
        data-testid="zoom"
        className="h-8 w-14 rounded-lg text-center text-xs font-medium tabular-nums text-ink hover:bg-sunken"
      >
        {Math.round(scale * 100)}%
      </button>
      {open && (
        <div role="menu" data-testid="zoom-menu" className="pop-in absolute bottom-11 right-0 z-30 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <button role="menuitem" className={item} onClick={run(() => zoomStep(1.25))}>Zoom in <span className={key}>{MOD}+</span></button>
          <button role="menuitem" className={item} onClick={run(() => zoomStep(1 / 1.25))}>Zoom out <span className={key}>{MOD}−</span></button>
          <button role="menuitem" className={item} onClick={run(zoomToFit)}>Zoom to fit <span className={key}>Shift+1</span></button>
          <button role="menuitem" className={item} disabled={!hasSelection} onClick={run(zoomToSelection)}>Zoom to selection <span className={key}>Shift+2</span></button>
          <div className="my-1 h-px bg-line" />
          {[0.25, 0.5, 1, 2].map((p) => (
            <button key={p} role="menuitem" className={item} onClick={run(() => zoomToScale(p))}>
              {p * 100}%{p === 1 && <span className={key}>{MOD}0</span>}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <div className="px-2.5 pb-1 pt-1 text-xs text-muted">Mouse wheel</div>
          <div className="mx-1 mb-1.5 flex gap-0.5 rounded-lg bg-sunken p-0.5" role="group" aria-label="Mouse wheel">
            <button className={seg(wheelMode === "zoom")} aria-pressed={wheelMode === "zoom"} data-testid="wheel-zoom" onClick={() => setWheelMode("zoom")}>Zooms</button>
            <button className={seg(wheelMode === "scroll")} aria-pressed={wheelMode === "scroll"} data-testid="wheel-scroll" onClick={() => setWheelMode("scroll")}>Scrolls</button>
          </div>
          <label className={`${item} cursor-pointer`}>
            Show minimap
            <input type="checkbox" checked={minimap} data-testid="minimap-toggle" onChange={(e) => setMinimap(e.target.checked)} className="h-4 w-4 accent-[#4F46E5]" />
          </label>
        </div>
      )}
    </div>
  );
}
