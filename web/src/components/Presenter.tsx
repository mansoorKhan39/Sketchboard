import { useEffect, useMemo, useRef } from "react";
import { useBoard } from "../store";
import { frameFit, sortedFrames } from "../geometry";

// Presentation mode: a see-through layer on top of the board that stops all editing,
// glides the view from frame to frame, and shows a small control bar at the bottom.
export default function Presenter() {
  const present = useBoard((s) => s.present);
  const objects = useBoard((s) => s.objects);
  const step = useBoard((s) => s.stepPresent);
  const stop = useBoard((s) => s.stopPresent);
  const frames = useMemo(() => sortedFrames(objects), [objects]);
  const raf = useRef(0);

  const index = present?.index ?? 0;
  const frame = frames[index];

  // fly to the current frame (0.45 s ease-out)
  useEffect(() => {
    if (!present || !frame) return;
    const from = useBoard.getState().viewport;
    const to = frameFit(frame, window.innerWidth, window.innerHeight);
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 450);
      const e = 1 - (1 - k) ** 3;
      useBoard.getState().setViewport({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        scale: from.scale + (to.scale - from.scale) * e,
      });
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // only when the slide changes (or the frame itself is moved by someone else)
  }, [present !== null, index, frame?.id, frame?.x, frame?.y, frame?.width, frame?.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // frames deleted while presenting: leave quietly when none are left
  useEffect(() => {
    if (present && frames.length === 0) stop();
    else if (present && present.index > frames.length - 1) step(frames.length - 1 - present.index);
  }, [present, frames.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!present || !frame) return null;
  const btn = "flex h-9 w-9 items-center justify-center rounded-lg text-ink transition hover:bg-sunken disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <div data-testid="presenter" className="absolute inset-0 z-50" onWheel={(e) => e.preventDefault()}>
      <div className="absolute inset-x-0 bottom-5 flex justify-center">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-float">
          <button className={btn} disabled={index === 0} onClick={() => step(-1)} aria-label="Previous frame" data-testid="present-prev">
            ←
          </button>
          <span className="min-w-28 px-2 text-center text-sm font-medium" data-testid="present-count">
            {index + 1} / {frames.length}
            <span className="ml-2 text-muted">{frame.text}</span>
          </span>
          <button className={btn} disabled={index === frames.length - 1} onClick={() => step(1)} aria-label="Next frame" data-testid="present-next">
            →
          </button>
          <button onClick={stop} data-testid="present-exit" className="ml-1 h-9 rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand-strong">
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
