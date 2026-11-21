import type { BoardObject, Viewport } from "./types";

// Talks to the server (/api/v1). Every request carries the custom X-Sketchboard header the server requires,
// and the browser attaches the session cookie by itself.

export interface User {
  id: string;
  name: string;
  email: string;
}
export interface CloudBoard {
  id: string;
  name: string;
  objects: BoardObject[];
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
}

export interface VersionInfo {
  id: string;
  at: number;
  label: string;
  count: number; // objects in that version
}

export interface JoinInfo {
  token: string; // pass for the board's live channels (made by the server, limited to what this person may do)
  clientId: string; // who we are on those channels
  role: "owner" | "editor" | "viewer";
  boardId: string;
  name: string; // the board's name
  you: string; // the name other people see for us
}
export interface ShareSettings {
  enabled: boolean;
  token: string;
  right: "viewer" | "editor";
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const text = body === undefined ? undefined : JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers: { "X-Sketchboard": "1", ...(text ? { "Content-Type": "application/json" } : {}) },
      body: text,
      credentials: "same-origin",
      keepalive: !!text && text.length < 60_000, // lets a last save finish even while the tab is closing
    });
  } catch {
    throw new ApiError(0, "network", "Can't reach the server. Check your connection.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "Something went wrong.");
  return data as T;
}

export const api = {
  me: () => call<{ user: User }>("GET", "/auth/me"),
  register: (name: string, email: string, password: string) => call<{ user: User }>("POST", "/auth/register", { name, email, password }),
  login: (email: string, password: string) => call<{ user: User }>("POST", "/auth/login", { email, password }),
  logout: () => call<void>("POST", "/auth/logout"),
  listBoards: () => call<{ boards: CloudBoard[] }>("GET", "/boards"),
  getBoard: (id: string) => call<{ board: CloudBoard }>("GET", `/boards/${id}`),
  createBoard: (name: string, objects: BoardObject[]) => call<{ board: CloudBoard }>("POST", "/boards", { name, objects }),
  saveBoard: (id: string, objects: BoardObject[], viewport: Viewport) => call<{ updatedAt: number }>("PUT", `/boards/${id}`, { objects, viewport }),
  renameBoard: (id: string, name: string) => call<{ name: string }>("PATCH", `/boards/${id}`, { name }),
  deleteBoard: (id: string) => call<void>("DELETE", `/boards/${id}`),
  joinBoard: (id: string) => call<JoinInfo>("POST", `/boards/${id}/join`),
  shareJoin: (token: string, name: string, guestId?: string) => call<JoinInfo>("POST", `/share/${token}/join`, { name, guestId }),
  getShareState: (token: string) => call<{ objects: BoardObject[] }>("GET", `/share/${token}/state`),
  saveShared: (token: string, objects: BoardObject[]) => call<{ ok: true }>("PUT", `/share/${token}/state`, { objects }),
  getShare: (id: string) => call<{ share: ShareSettings | null }>("GET", `/boards/${id}/share`),
  setShare: (id: string, body: { enabled: boolean; right?: "viewer" | "editor"; regenerate?: boolean }) =>
    call<{ share: ShareSettings }>("PUT", `/boards/${id}/share`, body),
  listVersions: (id: string) => call<{ versions: VersionInfo[] }>("GET", `/boards/${id}/versions`),
  saveVersion: (id: string, objects: BoardObject[], label: string) => call<{ versions: VersionInfo[] }>("POST", `/boards/${id}/versions`, { objects, label }),
  getVersion: (id: string, versionId: string) => call<{ objects: BoardObject[] }>("GET", `/boards/${id}/versions/${versionId}`),
  duplicateBoard: (id: string) => call<{ board: CloudBoard }>("POST", `/boards/${id}/duplicate`),
};
