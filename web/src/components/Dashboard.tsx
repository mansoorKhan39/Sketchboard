import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../ui";
import { useAuth } from "../auth";
import { cloudRepo, getRepo, localRepo, type BoardSummary } from "../repo";
import { TEMPLATES, type Template } from "../templates";
import BoardThumb from "./BoardThumb";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";
import Logo from "./Logo";

const timeAgo = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

function TemplateCard({ t, onUse }: { t: Template; onUse: () => void }) {
  const objects = useMemo(() => t.build(), [t]);
  return (
    <button
      onClick={onUse}
      data-testid={`template-${t.id}`}
      className="group w-52 shrink-0 text-left"
    >
      <div className="h-32 overflow-hidden rounded-xl border border-line bg-surface p-3 transition group-hover:border-brand group-hover:shadow-float">
        <BoardThumb objects={objects} />
      </div>
      <div className="mt-2 text-sm font-medium">{t.name}</div>
      <div className="text-xs text-muted">{t.description}</div>
    </button>
  );
}

function BoardCard({ board, onOpen, onChange }: { board: BoardSummary; onOpen: () => void; onChange: () => void }) {
  const objects = board.objects;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close the menu when clicking anywhere else
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setMenu(false);
        setConfirmDelete(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const item = "block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-sunken";

  return (
    <div ref={ref} className="group relative" data-testid="board-card">
      <button onClick={onOpen} className="block w-full text-left" aria-label={`Open ${board.name}`}>
        <div className="h-44 overflow-hidden rounded-xl border border-line bg-surface p-4 transition group-hover:border-brand group-hover:shadow-float">
          <BoardThumb objects={objects} />
        </div>
      </button>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {renaming ? (
            <input
              autoFocus
              defaultValue={board.name}
              aria-label="Board name"
              className="w-full rounded border border-brand bg-surface px-1 text-sm font-medium outline-none"
              onBlur={async (e) => {
                setRenaming(false);
                await getRepo().rename(board.id, e.target.value.trim() || "Untitled board").catch(() => {});
                onChange();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <div className="truncate text-sm font-medium">{board.name}</div>
          )}
          <div className="text-xs text-muted">Edited {timeAgo(board.updatedAt)}</div>
        </div>
        <button
          onClick={() => setMenu((m) => !m)}
          aria-label={`Options for ${board.name}`}
          data-testid="board-menu"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </div>
      {menu && (
        <div className="absolute right-0 top-[calc(100%-1.5rem)] z-30 w-44 rounded-xl border border-line bg-surface p-1 shadow-float">
          <button className={item} onClick={() => { setRenaming(true); setMenu(false); }}>Rename</button>
          <button className={item} onClick={async () => { setMenu(false); await getRepo().duplicate(board.id).catch(() => {}); onChange(); }}>Duplicate</button>
          <button
            data-testid="board-delete"
            className={`${item} ${confirmDelete ? "bg-red-500/10 text-red-600" : "text-red-600"}`}
            onClick={async () => {
              if (!confirmDelete) return setConfirmDelete(true);
              setMenu(false);
              await getRepo().remove(board.id).catch(() => {});
              onChange();
            }}
          >
            {confirmDelete ? "Click again to delete" : "Delete"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const go = useUI((s) => s.go);
  const user = useAuth((s) => s.user);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [localCount, setLocalCount] = useState(0);
  const [moving, setMoving] = useState(false);

  const refresh = async () => {
    try {
      setBoards(await getRepo().list());
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load your boards.");
    } finally {
      setLoading(false);
    }
  };

  // reload whenever we switch between guest and signed-in
  useEffect(() => {
    setLoading(true);
    void refresh();
    if (user) void localRepo.list().then((l) => setLocalCount(l.length));
    else setLocalCount(0);
  }, [user?.id]);

  // Move boards that only exist in this browser into the signed-in account.
  const moveLocalBoards = async () => {
    setMoving(true);
    try {
      for (const b of await localRepo.list()) {
        await cloudRepo.create(b.name, b.objects);
        await localRepo.remove(b.id);
      }
      setLocalCount(0);
    } catch {
      setLoadError("Could not move all boards. Nothing was lost — try again.");
    } finally {
      setMoving(false);
      await refresh();
    }
  };

  const open = (id: string) => go({ name: "board", id });
  const create = async (name: string, objects: BoardSummary["objects"]) => {
    try {
      open((await getRepo().create(name, objects)).id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not create the board.");
    }
  };
  const startFrom = (t: Template) => create(t.id === "blank" ? "Untitled board" : t.name, t.build());

  const shown = boards.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="scroll-page">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">Sketchboard</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="pt-6">
          <h1 className="text-3xl font-semibold tracking-tight">Start a board</h1>
          <p className="mt-1 max-w-xl text-[15px] text-muted">
            Pick a template or begin with a blank canvas.{" "}
            {user ? "Boards are saved to your account." : "Boards are saved in this browser. Sign in to keep them in your account."}
          </p>
          <div className="-mx-6 mt-6 flex gap-5 overflow-x-auto px-6 pb-3">
            {TEMPLATES.map((t) => (
              <TemplateCard key={t.id} t={t} onUse={() => startFrom(t)} />
            ))}
          </div>
        </section>

        {user && localCount > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3" data-testid="move-banner">
            <p className="text-sm">
              {localCount} {localCount === 1 ? "board is" : "boards are"} saved only in this browser.
            </p>
            <button
              onClick={moveLocalBoards}
              disabled={moving}
              data-testid="move-local"
              className="h-8 rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60"
            >
              {moving ? "Moving…" : "Move to my account"}
            </button>
          </div>
        )}

        <section className="pt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Your boards</h2>
            {boards.length > 3 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search boards"
                aria-label="Search boards"
                className="w-56 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-brand"
              />
            )}
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-8">
            <button
              onClick={() => create("Untitled board", [])}
              data-testid="new-board"
              className="group text-left"
            >
              {/* the one playful element: the "new board" tile is a sticky note */}
              <div className="flex h-44 -rotate-1 flex-col justify-between rounded-md bg-[#FFD43B] p-4 text-[#3b3000] shadow-[0_6px_16px_-4px_rgb(120_90_0/0.45)] transition group-hover:-translate-y-1 group-hover:rotate-0">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                <span className="text-lg font-semibold leading-tight">New board</span>
              </div>
            </button>
            {shown.map((b) => (
              <BoardCard key={b.id} board={b} onOpen={() => open(b.id)} onChange={refresh} />
            ))}
          </div>
          {loading && <p className="mt-8 text-sm text-muted">Loading your boards…</p>}
          {loadError && (
            <p role="alert" className="mt-8 text-sm text-red-600">
              {loadError}{" "}
              <button className="font-medium underline" onClick={() => void refresh()}>Try again</button>
            </p>
          )}
          {!loading && !loadError && !boards.length && (
            <p className="mt-8 text-sm text-muted">No boards yet. Start from a template above or add a new board.</p>
          )}
          {boards.length > 0 && !shown.length && <p className="mt-8 text-sm text-muted">No board matches "{query}".</p>}
        </section>
      </main>
    </div>
  );
}
