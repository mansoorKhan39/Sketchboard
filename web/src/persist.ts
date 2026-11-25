import { nanoid } from "nanoid";
import type { BoardObject, Viewport } from "./types";

// Local storage layout (until the real backend exists):
//   sketchboard.boards.v2        -> list of boards (id, name, dates)
//   sketchboard.board.v2.<id>    -> { objects, viewport } of one board
const INDEX_KEY = "sketchboard.boards.v2";
const dataKey = (id: string) => `sketchboard.board.v2.${id}`;
const OLD_KEY = "sketchboard.board.v1"; // the single board from Stage 2

export interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  folder?: string;
  deletedAt?: number;
}
export interface BoardData {
  objects: BoardObject[];
  viewport: Viewport;
}

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

// localStorage can be blocked or hold broken data, so every access is wrapped.
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — the board still works, it just won't be saved */
  }
}

function saveIndex(list: BoardMeta[]) {
  write(INDEX_KEY, list);
}

export function listBoards(): BoardMeta[] {
  let list = read<BoardMeta[]>(INDEX_KEY);
  if (!Array.isArray(list)) {
    list = [];
    // bring the Stage 2 board along so nobody loses work
    const old = read<BoardData>(OLD_KEY);
    if (old && Array.isArray(old.objects) && old.objects.length) {
      const now = Date.now();
      const meta = { id: nanoid(8), name: "My first board", createdAt: now, updatedAt: now };
      write(dataKey(meta.id), { objects: old.objects, viewport: old.viewport ?? DEFAULT_VIEWPORT });
      list = [meta];
      saveIndex(list);
    }
  }
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getBoardMeta = (id: string) => listBoards().find((b) => b.id === id) ?? null;

export function loadBoardData(id: string): BoardData | null {
  if (!getBoardMeta(id)) return null;
  const d = read<BoardData>(dataKey(id));
  if (!d || !Array.isArray(d.objects)) return { objects: [], viewport: DEFAULT_VIEWPORT };
  const v = d.viewport;
  const ok = v && typeof v.x === "number" && typeof v.y === "number" && typeof v.scale === "number";
  return { objects: d.objects, viewport: ok ? v : DEFAULT_VIEWPORT };
}

export function saveBoardData(id: string, objects: BoardObject[], viewport: Viewport) {
  write(dataKey(id), { objects, viewport });
  const list = listBoards().map((b) => (b.id === id ? { ...b, updatedAt: Date.now() } : b));
  saveIndex(list);
}

export function createBoard(name: string, objects: BoardObject[] = []): BoardMeta {
  const now = Date.now();
  const meta: BoardMeta = { id: nanoid(8), name: name.trim() || "Untitled board", createdAt: now, updatedAt: now };
  write(dataKey(meta.id), { objects, viewport: DEFAULT_VIEWPORT });
  saveIndex([meta, ...listBoards()]);
  return meta;
}

export function renameBoard(id: string, name: string) {
  const clean = name.trim() || "Untitled board";
  saveIndex(listBoards().map((b) => (b.id === id ? { ...b, name: clean } : b)));
}

// favourite / folder / trash (trashed = true puts it in the trash, false brings it back)
export function updateBoardMeta(id: string, patch: { name?: string; favorite?: boolean; folder?: string; trashed?: boolean }) {
  saveIndex(
    listBoards().map((b) => {
      if (b.id !== id) return b;
      const n = { ...b };
      if (patch.name !== undefined) n.name = patch.name.trim() || "Untitled board";
      if (patch.favorite !== undefined) n.favorite = patch.favorite;
      if (patch.folder !== undefined) n.folder = patch.folder.trim().slice(0, 40);
      if (patch.trashed !== undefined) n.deletedAt = patch.trashed ? Date.now() : 0;
      return n;
    }),
  );
}

export function deleteBoard(id: string) {
  saveIndex(listBoards().filter((b) => b.id !== id));
  try {
    localStorage.removeItem(dataKey(id));
    localStorage.removeItem(versionsKey(id));
  } catch {
    /* ignore */
  }
}

// ---- version history (guest boards) ----
const MAX_VERSIONS = 5;
const versionsKey = (id: string) => `sketchboard.versions.v1.${id}`;
interface StoredVersion {
  id: string;
  at: number;
  label: string;
  objects: BoardObject[];
}
const info = (list: StoredVersion[]) => list.map((v) => ({ id: v.id, at: v.at, label: v.label, count: v.objects.length })).reverse();

export const listVersions = (id: string) => info(read<StoredVersion[]>(versionsKey(id)) ?? []);
export const getVersion = (id: string, versionId: string) =>
  (read<StoredVersion[]>(versionsKey(id)) ?? []).find((v) => v.id === versionId)?.objects ?? null;

export function saveVersion(id: string, objects: BoardObject[], label: string) {
  let list = [...(read<StoredVersion[]>(versionsKey(id)) ?? []), { id: nanoid(10), at: Date.now(), label, objects }];
  // browsers give about 5 MB to a site, so drop old versions until the new list fits
  for (;;) {
    while (list.length > MAX_VERSIONS) list.shift();
    try {
      localStorage.setItem(versionsKey(id), JSON.stringify(list));
      return info(list);
    } catch {
      if (list.length <= 1) throw new Error("This browser has no space left to keep a version of this board.");
      list = list.slice(1);
    }
  }
}

export function duplicateBoard(id: string): BoardMeta | null {
  const meta = getBoardMeta(id);
  const data = loadBoardData(id);
  if (!meta || !data) return null;
  return createBoard(`${meta.name} copy`, data.objects);
}
