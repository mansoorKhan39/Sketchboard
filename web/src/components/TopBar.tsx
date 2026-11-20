import { useEffect, useRef, useState } from "react";
import { useUI } from "../ui";
import { flushSave, useBoard } from "../store";
import ThemeToggle from "./ThemeToggle";
import ShareDialog from "./ShareDialog";
import Logo from "./Logo";
import { exportPng } from "../exportPng";
import HistoryPanel from "./HistoryPanel";

export default function TopBar() {
  const go = useUI((s) => s.go);
  const storedName = useBoard((s) => s.boardName);
  const saveStatus = useBoard((s) => s.saveStatus);
  const connection = useBoard((s) => s.connection);
  const role = useBoard((s) => s.role);
  const mode = useBoard((s) => s.mode);
  const peers = useBoard((s) => s.peers);
  const notice = useBoard((s) => s.notice);
  const hasFrames = useBoard((s) => s.objects.some((o) => o.type === "frame"));
  const canRename = mode === "owned" && role !== "viewer";
  const [name, setName] = useState(storedName);
  const [share, setShare] = useState(false);
  const [history, setHistory] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!share) return;
    const close = (e: MouseEvent) => {
      if (!shareRef.current?.contains(e.target as Node)) setShare(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [share]);

  const card = "pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-float";

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-30 flex items-start justify-between">
      {notice && (
        <div role="status" data-testid="notice" className="pointer-events-auto absolute left-1/2 top-16 -translate-x-1/2 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-canvas shadow-float">
          {notice}
        </div>
      )}
      <div className={card}>
        <button
          onClick={() => {
            flushSave();
            go({ name: "dashboard" });
          }}
          aria-label="Back to all boards"
          title="All boards"
          data-testid="back"
          className="flex h-9 items-center gap-2 rounded-lg pl-1.5 pr-2 hover:bg-sunken"
        >
          <Logo size={26} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            useBoard.getState().renameBoard(name);
            setName(useBoard.getState().boardName);
          }}
          onKeyDown={(e) => {
            e.stopPropagation(); // typing a name must not trigger tool shortcuts
            if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          aria-label="Board name"
          data-testid="board-name"
          readOnly={!canRename}
          className="h-9 w-48 rounded-lg bg-transparent px-2 text-sm font-medium outline-none hover:bg-sunken focus:bg-sunken"
        />
        <span
          data-testid="save-status"
          className={`mr-2 flex items-center gap-1.5 whitespace-nowrap text-xs ${
            saveStatus === "error" && connection === "off" ? "text-red-500" : "text-muted"
          }`}
        >
          {connection !== "off" && (
            <span
              className={`h-1.5 w-1.5 rounded-full ${connection === "live" ? "bg-green-500" : "bg-amber-500"}`}
              aria-hidden
            />
          )}
          {connection === "live"
            ? "Live"
            : connection === "connecting"
              ? "Connecting…"
              : connection === "offline"
                ? "Reconnecting… your changes are kept"
                : saveStatus === "saving"
                  ? "Saving…"
                  : saveStatus === "error"
                    ? "Not saved. Retrying…"
                    : "Saved"}
        </span>
      </div>

      <div className={card} ref={shareRef}>
        {peers.length > 0 && (
          <div className="mr-1 flex -space-x-2 pl-1" data-testid="peers">
            {peers.slice(0, 4).map((p) => (
              <span
                key={p.id}
                title={p.name}
                data-testid="peer-avatar"
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface text-xs font-semibold text-white"
                style={{ background: p.color }}
              >
                {p.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
            ))}
            {peers.length > 4 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-sunken text-[11px] font-semibold">
                +{peers.length - 4}
              </span>
            )}
          </div>
        )}
        {mode === "owned" && role !== "viewer" && (
          <button
            onClick={() => {
              setShare(false);
              setHistory((h) => !h);
            }}
            data-testid="history"
            title="Save and restore earlier versions of this board"
            className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:border-brand hover:bg-brand-soft"
          >
            History
          </button>
        )}
        {hasFrames && (
          <button
            onClick={() => useBoard.getState().startPresent()}
            data-testid="present"
            title="Show the frames one by one"
            className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:border-brand hover:bg-brand-soft"
          >
            Present
          </button>
        )}
        <button
          onClick={() => {
            const err = exportPng(name || "board");
            if (err) {
              useBoard.setState({ notice: err });
              setTimeout(() => useBoard.getState().notice === err && useBoard.setState({ notice: "" }), 4000);
            }
          }}
          data-testid="export-png"
          title="Save the board as a PNG picture"
          className="h-9 rounded-lg border border-line px-3 text-sm font-medium hover:border-brand hover:bg-brand-soft"
        >
          Export PNG
        </button>
        <ThemeToggle />
        {role === "viewer" && <span data-testid="viewer-badge" className="rounded-lg bg-sunken px-2.5 py-1 text-xs font-medium text-muted">View only</span>}
        {mode === "owned" && (
          <button
            onClick={() => { setHistory(false); setShare((s) => !s); }}
            data-testid="share"
            className="h-9 rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Share
          </button>
        )}
        {history && <HistoryPanel onClose={() => setHistory(false)} />}
        {share && (
          <div className="absolute right-0 top-14 w-80 rounded-xl border border-line bg-surface p-4 shadow-float" data-testid="share-panel">
            <ShareDialog />
          </div>
        )}
      </div>
    </div>
  );
}
