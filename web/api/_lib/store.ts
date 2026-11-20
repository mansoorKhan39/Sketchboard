import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BoardRec, UserRec, VersionRec } from "./types.js";

// The database is hidden behind this small interface. Production uses MongoDB (mongo-store.ts);
// tests use MemoryStore; local development uses FileStore (a JSON file), so no database is needed to try things out.
export interface Store {
  /** Returns false when the e-mail is already used. */
  createUser(user: UserRec): Promise<boolean>;
  findUserByEmail(email: string): Promise<UserRec | null>;
  findUserById(id: string): Promise<UserRec | null>;
  listBoards(ownerId: string): Promise<BoardRec[]>;
  getBoard(id: string): Promise<BoardRec | null>;
  findBoardByShareToken(token: string): Promise<BoardRec | null>;
  insertBoard(board: BoardRec): Promise<void>;
  updateBoard(id: string, patch: Partial<Omit<BoardRec, "id" | "ownerId">>): Promise<void>;
  deleteBoard(id: string): Promise<void>;
  getVersions(boardId: string): Promise<VersionRec[]>; // oldest first
  setVersions(boardId: string, versions: VersionRec[]): Promise<void>;
}

export class MemoryStore implements Store {
  protected users: UserRec[] = [];
  protected boards: BoardRec[] = [];
  protected versions: Record<string, VersionRec[]> = {};

  protected changed() {
    /* FileStore overrides this to write to disk */
  }

  async createUser(user: UserRec) {
    if (this.users.some((u) => u.email === user.email)) return false;
    this.users.push(user);
    this.changed();
    return true;
  }
  async findUserByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async findUserById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async listBoards(ownerId: string) {
    return this.boards.filter((b) => b.ownerId === ownerId).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async getBoard(id: string) {
    return this.boards.find((b) => b.id === id) ?? null;
  }
  async findBoardByShareToken(token: string) {
    return this.boards.find((b) => b.share?.token === token) ?? null;
  }
  async insertBoard(board: BoardRec) {
    this.boards.push(board);
    this.changed();
  }
  async updateBoard(id: string, patch: Partial<Omit<BoardRec, "id" | "ownerId">>) {
    const i = this.boards.findIndex((b) => b.id === id);
    if (i >= 0) this.boards[i] = { ...this.boards[i], ...patch };
    this.changed();
  }
  async deleteBoard(id: string) {
    this.boards = this.boards.filter((b) => b.id !== id);
    delete this.versions[id];
    this.changed();
  }
  async getVersions(boardId: string) {
    return this.versions[boardId] ?? [];
  }
  async setVersions(boardId: string, versions: VersionRec[]) {
    this.versions[boardId] = versions;
    this.changed();
  }
}

// Development only: same as MemoryStore, but remembers everything in a JSON file between restarts.
export class FileStore extends MemoryStore {
  constructor(private file: string) {
    super();
    if (existsSync(file)) {
      try {
        const d = JSON.parse(readFileSync(file, "utf8"));
        this.users = d.users ?? [];
        this.boards = d.boards ?? [];
        this.versions = d.versions ?? {};
      } catch {
        /* broken file — start empty */
      }
    }
  }
  protected changed() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ users: this.users, boards: this.boards, versions: this.versions }));
  }
}
