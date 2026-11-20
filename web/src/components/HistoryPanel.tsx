import { useCallback, useEffect, useState } from "react";
import { useBoard } from "../store";
import { getRepo, type VersionInfo } from "../repo";

// Version history: save a copy of the board, see the last 5, bring one back.
export default function HistoryPanel({ onClose }: { onClose: () => void }) {
  const boardId = useBoard((s) => s.boardId);
  const [list, setList] = useState<VersionInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const run = useCallback(async (job: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await job();
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (boardId) void run(async () => setList(await getRepo().listVersions(boardId)));
  }, [boardId, run]);

  if (!boardId) return null;
  const repo = getRepo();

  const save = (label: string) => run(async () => setList(await repo.saveVersion(boardId, useBoard.getState().objects, label)));

  const restore = (v: VersionInfo) =>
    run(async () => {
      const objects = await repo.getVersion(boardId, v.id);
      if (!objects) throw new Error("That version does not exist any more.");
      // keep the current board too, so a restore never loses work. Ctrl+Z also takes it back.
      setList(await repo.saveVersion(boardId, useBoard.getState().objects, "Before restore"));
      useBoard.getState().restoreObjects(objects);
      setConfirm(null);
      onClose();
    });

  return (
    <div data-testid="history-panel" className="absolute right-0 top-14 w-80 rounded-xl border border-line bg-surface p-4 shadow-float">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Version history</h2>
        <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">✕</button>
      </div>
      <p className="mt-1 text-xs text-muted">The last 5 saved versions are kept.</p>
      <button
        data-testid="save-version"
        disabled={busy}
        onClick={() => save("Saved version")}
        className="mt-3 h-9 w-full rounded-lg bg-brand text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
      >
        Save a version now
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      <ul className="mt-3 max-h-64 space-y-1.5 overflow-auto">
        {list?.length === 0 && <li className="text-sm text-muted">No versions yet.</li>}
        {list?.map((v) => (
          <li key={v.id} data-testid="version-row" className="flex items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2">
            <div className="min-w-0 text-xs">
              <div className="truncate font-medium">{v.label}</div>
              <div className="text-muted">
                {new Date(v.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · {v.count} objects
              </div>
            </div>
            {confirm === v.id ? (
              <button data-testid="version-confirm" disabled={busy} onClick={() => restore(v)} className="shrink-0 rounded-lg bg-brand px-2.5 py-1 text-xs font-medium text-white">
                Replace board?
              </button>
            ) : (
              <button data-testid="version-restore" onClick={() => setConfirm(v.id)} className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft">
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
