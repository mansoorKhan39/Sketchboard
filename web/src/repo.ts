import type { BoardObject, Viewport } from "./types";
import { api, type VersionInfo } from "./api";
export type { VersionInfo };
import { useAuth } from "./auth";
import * as local from "./persist";

// One interface, two places boards can live:
//  - "local": this browser (guests)
//  - "cloud": the server, under your account (signed-in users)
// The rest of the app only talks to a Repo and does not care which one it got.

export interface BoardSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  folder?: string;
  deletedAt?: number; // set while the board is in the trash
  teamId?: string; // the team it belongs to ("" = personal)
  teamName?: string;
  role?: "owner" | "editor" | "viewer"; // your right (missing = owner); boards shared with you have editor / viewer
  ownerName?: string; // for boards shared with you
  objects: BoardObject[]; // needed for the dashboard thumbnails
}
export type BoardPatch = { name?: string; favorite?: boolean; folder?: string; trashed?: boolean; teamId?: string };
export const TRASH_DAYS = 30;
export interface BoardFull extends BoardSummary {
  viewport: Viewport;
}

export interface Repo {
  kind: "local" | "cloud";
  saveDelay: number; // ms to wait after the last change before saving
  list(): Promise<BoardSummary[]>;
  get(id: string): Promise<BoardFull | null>;
  create(name: string, objects?: BoardObject[]): Promise<BoardSummary>;
  rename(id: string, name: string): Promise<void>;
  update(id: string, patch: BoardPatch): Promise<void>; // favourite, folder, trash

  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<BoardSummary | null>;
  save(id: string, objects: BoardObject[], viewport: Viewport): Promise<void>;
  // version history (the newest 5 saved copies of a board)
  listVersions(id: string): Promise<VersionInfo[]>; // newest first
  saveVersion(id: string, objects: BoardObject[], label: string): Promise<VersionInfo[]>;
  getVersion(id: string, versionId: string): Promise<BoardObject[] | null>;
}

export const localRepo: Repo = {
  kind: "local",
  saveDelay: 300,
  async list() {
    // boards left in the trash for 30 days are removed for good
    const limit = Date.now() - TRASH_DAYS * 86400_000;
    for (const m of local.listBoards()) if (m.deletedAt && m.deletedAt < limit) local.deleteBoard(m.id);
    return local.listBoards().map((m) => ({ ...m, objects: local.loadBoardData(m.id)?.objects ?? [] }));
  },
  async get(id) {
    const meta = local.getBoardMeta(id);
    const data = local.loadBoardData(id);
    return meta && data ? { ...meta, ...data } : null;
  },
  async create(name, objects = []) {
    const meta = local.createBoard(name, objects);
    return { ...meta, objects };
  },
  async rename(id, name) {
    local.renameBoard(id, name);
  },
  async update(id, patch) {
    local.updateBoardMeta(id, patch);
  },
  async remove(id) {
    local.deleteBoard(id);
  },
  async duplicate(id) {
    const meta = local.duplicateBoard(id);
    return meta ? { ...meta, objects: local.loadBoardData(meta.id)?.objects ?? [] } : null;
  },
  async save(id, objects, viewport) {
    local.saveBoardData(id, objects, viewport);
  },
  async listVersions(id) {
    return local.listVersions(id);
  },
  async saveVersion(id, objects, label) {
    return local.saveVersion(id, objects, label);
  },
  async getVersion(id, versionId) {
    return local.getVersion(id, versionId);
  },
};

const summary = (b: { id: string; name: string; createdAt: number; updatedAt: number; objects: BoardObject[]; favorite?: boolean; folder?: string; deletedAt?: number; role?: "owner" | "editor" | "viewer"; ownerName?: string; teamId?: string; teamName?: string }): BoardSummary => ({
  id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, objects: b.objects,
  favorite: !!b.favorite, folder: b.folder ?? "", deletedAt: b.deletedAt ?? 0, role: b.role ?? "owner", ownerName: b.ownerName, teamId: b.teamId ?? "", teamName: b.teamName,
});

export const cloudRepo: Repo = {
  kind: "cloud",
  saveDelay: 1200, // be kind to the server: one save per pause, not one per click
  async list() {
    const r = await api.listBoards();
    return [...r.boards.map(summary), ...(r.shared ?? []).map(summary)];
  },
  async get(id) {
    try {
      return (await api.getBoard(id)).board;
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  },
  async create(name, objects = []) {
    return summary((await api.createBoard(name, objects)).board);
  },
  async rename(id, name) {
    await api.renameBoard(id, name);
  },
  async update(id, patch) {
    await api.updateBoard(id, patch);
  },
  async remove(id) {
    await api.deleteBoard(id);
  },
  async duplicate(id) {
    return summary((await api.duplicateBoard(id)).board);
  },
  async save(id, objects, viewport) {
    await api.saveBoard(id, objects, viewport);
  },
  async listVersions(id) {
    return (await api.listVersions(id)).versions;
  },
  async saveVersion(id, objects, label) {
    return (await api.saveVersion(id, objects, label)).versions;
  },
  async getVersion(id, versionId) {
    return (await api.getVersion(id, versionId)).objects;
  },
};

export const getRepo = (): Repo => (useAuth.getState().user ? cloudRepo : localRepo);
