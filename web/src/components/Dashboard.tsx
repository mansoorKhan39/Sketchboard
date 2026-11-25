import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../ui";
import { useAuth } from "../auth";
import { cloudRepo, getRepo, localRepo, TRASH_DAYS, type BoardPatch, type BoardSummary } from "../repo";
import { parseBoardFile } from "../boardFile";
import { TEMPLATES, type Template } from "../templates";
import BoardThumb from "./BoardThumb";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";
import Logo from "./Logo";
import Bell from "./Bell";
import { api } from "../api";
import Landing from "./Landing";

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

function BoardCard({ board, folders, onOpen, onChange }: { board: BoardSummary; folders: string[]; onOpen: () => void; onChange: () => void }) {
  const objects = board.objects;
  const trashed = !!board.deletedAt;
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const me = useAuth((s) => s.user);
  const shared = !!board.role && board.role !== "owner";
  const ref = useRef<HTMLDivElement>(null);

  // close the menu when clicking anywhere else
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setMenu(false);
        setConfirmDelete(false);
        setMoving(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const update = async (patch: BoardPatch) => {
    setMenu(false);
    setMoving(false);
    await getRepo().update(board.id, patch).catch(() => {});
    onChange();
  };
  const item = "block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-sunken";

  return (
    <div ref={ref} className="group relative" data-testid="board-card">
      <button onClick={trashed ? undefined : onOpen} className={`block w-full text-left ${trashed ? "cursor-default opacity-60" : ""}`} aria-label={trashed ? board.name : `Open ${board.name}`}>
        <div className="h-44 overflow-hidden rounded-xl border border-line bg-surface p-4 transition group-hover:border-brand group-hover:shadow-float">
          <BoardThumb objects={objects} />
        </div>
      </button>
      {!trashed && !shared && (
        <button
          onClick={() => update({ favorite: !board.favorite })}
          aria-label={board.favorite ? `Remove ${board.name} from favourites` : `Add ${board.name} to favourites`}
          aria-pressed={!!board.favorite}
          data-testid="board-star"
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-surface/90 shadow-sm transition ${board.favorite ? "text-amber-500" : "text-muted opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={board.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.500l6.1-.9z" /></svg>
        </button>
      )}
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {renaming && !shared ? (
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
          <div className="truncate text-xs text-muted">
            {shared
              ? `Shared by ${board.ownerName ?? "someone"} · ${board.role === "editor" ? "can edit" : "can view"}`
              : trashed ? `In trash since ${timeAgo(board.deletedAt!)}` : `Edited ${timeAgo(board.updatedAt)}`}
            {!shared && board.folder ? ` · ${board.folder}` : ""}
          </div>
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
        <div className="absolute right-0 top-[calc(100%-1.5rem)] z-30 w-52 rounded-xl border border-line bg-surface p-1 shadow-float">
          {shared ? (
            <button
              className={`${item} text-red-600`}
              data-testid="board-leave"
              onClick={async () => {
                setMenu(false);
                if (me) await api.removeMember(board.id, me.id).catch(() => {});
                onChange();
              }}
            >
              Leave board
            </button>
          ) : trashed ? (
            <>
              <button className={item} data-testid="board-restore" onClick={() => update({ trashed: false })}>Restore</button>
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
                {confirmDelete ? "Click again to delete" : "Delete forever"}
              </button>
            </>
          ) : moving ? (
            <form
              className="p-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void update({ folder: (new FormData(e.currentTarget).get("folder") as string) ?? "" });
              }}
            >
              <label className="text-xs text-muted" htmlFor={`f-${board.id}`}>Folder name (empty = no folder)</label>
              <input id={`f-${board.id}`} name="folder" list={`folders-${board.id}`} autoFocus defaultValue={board.folder ?? ""} maxLength={40} data-testid="folder-input" className="mt-1 w-full rounded-md border border-line bg-canvas px-2 py-1 text-sm outline-none focus:border-brand" />
              <datalist id={`folders-${board.id}`}>{folders.map((f) => <option key={f} value={f} />)}</datalist>
              <button className="mt-1.5 h-7 w-full rounded-md bg-brand text-xs font-medium text-white hover:bg-brand-strong">Save</button>
            </form>
          ) : (
            <>
              <button className={item} onClick={() => { setRenaming(true); setMenu(false); }}>Rename</button>
              <button className={item} data-testid="board-folder" onClick={() => setMoving(true)}>Move to folder…</button>
              <button className={item} onClick={async () => { setMenu(false); await getRepo().duplicate(board.id).catch(() => {}); onChange(); }}>Duplicate</button>
              <button data-testid="board-trash" className={`${item} text-red-600`} onClick={() => update({ trashed: true })}>Move to trash</button>
            </>
          )}
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
  const [filter, setFilter] = useState<string>("all"); // "all", "favorites", "trash" or "folder:<name>"
  const [note, setNote] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

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

  // Import a board saved with Export > Board file
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { name, objects, skipped } = parseBoardFile(await file.text());
      await create(name, objects);
      if (skipped) setNote(`${skipped} damaged ${skipped === 1 ? "item was" : "items were"} left out.`);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not import this file.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const isShared = (b: BoardSummary) => !!b.role && b.role !== "owner";
  const live = boards.filter((b) => !b.deletedAt);
  const mine = live.filter((b) => !isShared(b));
  const sharedWithMe = live.filter(isShared);
  const trash = boards.filter((b) => !!b.deletedAt && !isShared(b));
  const folders = [...new Set(mine.map((b) => b.folder).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
  const q = query.trim().toLowerCase();
  const inView = (b: BoardSummary) =>
    filter === "trash"
      ? !!b.deletedAt && !isShared(b)
      : !b.deletedAt &&
        (filter === "all" || (filter === "shared" ? isShared(b) : !isShared(b) && (filter === "favorites" ? !!b.favorite : b.folder === filter.slice(7))));
  const shown = boards.filter((b) => inView(b) && (!q || b.name.toLowerCase().includes(q) || (b.folder ?? "").toLowerCase().includes(q)));
  // a folder that became empty (or a trash that was emptied) falls back to "All"
  useEffect(() => {
    if (filter.startsWith("folder:") && !folders.includes(filter.slice(7))) setFilter("all");
    if (filter === "trash" && !trash.length) setFilter("all");
    if (filter === "shared" && !sharedWithMe.length) setFilter("all");
  }, [boards]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = (id: string, label: string, count?: number) => (
    <button
      key={id}
      data-testid={`filter-${id}`}
      aria-pressed={filter === id}
      onClick={() => setFilter(id)}
      className={`h-8 whitespace-nowrap rounded-full border px-3 text-sm transition ${filter === id ? "border-brand bg-brand-soft font-medium text-brand" : "border-line text-muted hover:border-brand hover:text-ink"}`}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 text-xs opacity-70">{count}</span>}
    </button>
  );

  return (
    <div className="scroll-page">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">Sketchboard</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void create("Untitled board", [])}
            data-testid="new-board-top"
            className="mr-1 hidden h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-sm font-medium text-white shadow-[0_1px_2px_rgb(79_70_229/0.4),0_6px_14px_-6px_rgb(79_70_229/0.6)] hover:bg-brand-strong sm:flex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New board
          </button>
          <Bell />
          <ThemeToggle />
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        {!user && boards.length === 0 && !loading && (
          <Landing onStart={() => void create("Untitled board", [])} onLogin={() => go({ name: "auth" })} />
        )}
        <section className="pt-10">
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
            <div className="flex items-center gap-2">
            <button
              onClick={() => importRef.current?.click()}
              data-testid="import-board"
              className="h-8 rounded-lg border border-line px-3 text-sm text-muted hover:border-brand hover:text-ink"
            >
              Import
            </button>
            <input ref={importRef} type="file" accept=".json,application/json" hidden data-testid="import-file" onChange={(e) => void importFile(e.target.files?.[0])} />
            {boards.length > 0 && (
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search boards"
                aria-label="Search boards"
                className="w-56 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-muted focus:border-brand"
              />
            )}
            </div>
          </div>

          {boards.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Show boards">
              {chip("all", "All", live.length)}
              {chip("favorites", "Favourites", mine.filter((b) => b.favorite).length)}
              {sharedWithMe.length > 0 && chip("shared", "Shared with me", sharedWithMe.length)}
              {folders.map((f) => chip(`folder:${f}`, f, mine.filter((b) => b.folder === f).length))}
              {trash.length > 0 && chip("trash", "Trash", trash.length)}
            </div>
          )}
          {filter === "trash" && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3" data-testid="trash-banner">
              <p className="text-sm">Boards in the trash are deleted for good after {TRASH_DAYS} days.</p>
              <button
                data-testid="empty-trash"
                onClick={async () => {
                  if (!window.confirm(`Delete ${trash.length} ${trash.length === 1 ? "board" : "boards"} forever?`)) return;
                  for (const b of trash) await getRepo().remove(b.id).catch(() => {});
                  await refresh();
                }}
                className="h-8 rounded-lg border border-red-500/40 px-3 text-sm font-medium text-red-600 hover:bg-red-500/10"
              >
                Empty trash
              </button>
            </div>
          )}
          {note && <p role="status" className="mt-3 text-sm text-muted">{note}</p>}

          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-8">
            {filter !== "trash" && (
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
            )}
            {shown.map((b) => (
              <BoardCard key={b.id} board={b} folders={folders} onOpen={() => open(b.id)} onChange={refresh} />
            ))}
          </div>
          {loading && <p className="mt-8 text-sm text-muted">Loading your boards…</p>}
          {loadError && (
            <p role="alert" className="mt-8 text-sm text-red-600">
              {loadError}{" "}
              <button className="font-medium underline" onClick={() => void refresh()}>Try again</button>
            </p>
          )}
          {!loading && !loadError && !live.length && !trash.length && (
            <p className="mt-8 text-sm text-muted">No boards yet. Start from a template above or add a new board.</p>
          )}
          {boards.length > 0 && !shown.length && (
            <p className="mt-8 text-sm text-muted">
              {q ? `No board matches "${query}".` : filter === "favorites" ? "No favourites yet. Click the star on a board." : "Nothing here."}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
