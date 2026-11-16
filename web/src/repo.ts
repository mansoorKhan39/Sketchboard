import type { BoardObject, Viewport } from "./types";
import { api } from "./api";
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
  objects: BoardObject[]; // needed for the dashboard thumbnails
}
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
  remove(id: string): Promise<void>;
  duplicate(id: string): Promise<BoardSummary | null>;
  save(id: string, objects: BoardObject[], viewport: Viewport): Promise<void>;
}

export const localRepo: Repo = {
  kind: "local",
  saveDelay: 300,
  async list() {
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
};

const summary = (b: { id: string; name: string; createdAt: number; updatedAt: number; objects: BoardObject[] }): BoardSummary => ({
  id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: b.updatedAt, objects: b.objects,
});

export const cloudRepo: Repo = {
  kind: "cloud",
  saveDelay: 1200, // be kind to the server: one save per pause, not one per click
  async list() {
    return (await api.listBoards()).boards.map(summary);
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
  async remove(id) {
    await api.deleteBoard(id);
  },
  async duplicate(id) {
    return summary((await api.duplicateBoard(id)).board);
  },
  async save(id, objects, viewport) {
    await api.saveBoard(id, objects, viewport);
  },
};

export const getRepo = (): Repo => (useAuth.getState().user ? cloudRepo : localRepo);
