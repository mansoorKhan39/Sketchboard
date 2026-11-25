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
  findUserByResetHash(hash: string): Promise<UserRec | null>;
  /** Changes some fields; a value of `undefined` removes the field. */
  updateUser(id: string, patch: Partial<Omit<UserRec, "id">>): Promise<void>;
  /** Removes the person and everything they own (boards and their saved versions). */
  deleteUser(id: string): Promise<void>;
  listBoards(ownerId: string): Promise<BoardRec[]>;
  listSharedBoards(userId: string): Promise<BoardRec[]>; // boards where this person is a member
  findBoardsByInvite(email: string): Promise<BoardRec[]>; // boards with a pending invitation for this address
  findUsersByIds(ids: string[]): Promise<UserRec[]>;
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
  async findUserByResetHash(hash: string) {
    return this.users.find((u) => u.resetHash === hash) ?? null;
  }
  async updateUser(id: string, patch: Partial<Omit<UserRec, "id">>) {
    const i = this.users.findIndex((u) => u.id === id);
    if (i < 0) return;
    const next: Record<string, unknown> = { ...this.users[i], ...patch };
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    this.users[i] = next as unknown as UserRec;
    this.changed();
  }
  async deleteUser(id: string) {
    for (const b of this.boards.filter((b) => b.ownerId === id)) delete this.versions[b.id];
    this.boards = this.boards.filter((b) => b.ownerId !== id);
    this.users = this.users.filter((u) => u.id !== id);
    this.changed();
  }
  async listBoards(ownerId: string) {
    return this.boards.filter((b) => b.ownerId === ownerId).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async listSharedBoards(userId: string) {
    return this.boards.filter((b) => b.members?.some((m) => m.userId === userId)).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async findBoardsByInvite(email: string) {
    return this.boards.filter((b) => b.invites?.some((i) => i.email === email));
  }
  async findUsersByIds(ids: string[]) {
    return this.users.filter((u) => ids.includes(u.id));
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
