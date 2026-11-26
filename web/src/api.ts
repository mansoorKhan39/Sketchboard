import type { BoardObject, Viewport } from "./types";

// Talks to the server (/api/v1). Every request carries the custom X-Sketchboard header the server requires,
// and the browser attaches the session cookie by itself.

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string; // picture address (from Google)
  hasPassword: boolean; // false for an account that only signs in with Google
  google: boolean; // linked to a Google account
}
export interface AuthConfig {
  google: string | null; // Google client id when "Continue with Google" is available
  resetEmail: boolean; // true when "Forgot password" can send e-mail
}
export type BoardRole = "owner" | "editor" | "viewer";
export interface Person {
  userId: string;
  name: string;
  email?: string; // only the owner sees these
  role: "editor" | "viewer";
}
export interface People {
  you: BoardRole;
  owner: { id: string; name: string };
  team?: { id: string; name: string } | null; // the team the board belongs to: everyone in it can open the board
  members: Person[];
  invites: { email: string; role: "editor" | "viewer" }[]; // only the owner sees these
  emailed?: boolean; // after an invitation: did an e-mail go out?
}
export interface ActivityItem {
  at: number;
  by: string;
  text: string;
}
export interface NotificationItem {
  id: string;
  at: number;
  text: string;
  boardId?: string;
  read: boolean;
}

export interface TeamSummary {
  id: string;
  name: string;
  you: "admin" | "member";
  count: number;
}
export interface TeamDetail {
  id: string;
  name: string;
  you: "admin" | "member";
  members: { userId: string; name: string; email?: string; role: "admin" | "member" }[];
  invites: { email: string; role: "admin" | "member" }[]; // only admins see these
}

export interface CloudBoard {
  id: string;
  name: string;
  objects: BoardObject[];
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  folder?: string;
  deletedAt?: number; // moved to the trash at this time (0 = not in the trash)
  role?: BoardRole; // your right on this board (missing = owner)
  ownerName?: string; // only on boards shared with you
  teamId?: string; // "" = personal board
  teamName?: string;
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
  authConfig: () => call<AuthConfig>("GET", "/auth/config"),
  google: (credential: string) => call<{ user: User }>("POST", "/auth/google", { credential }),
  forgot: (email: string) => call<{ ok: true }>("POST", "/auth/forgot", { email }),
  reset: (token: string, password: string) => call<{ user: User }>("POST", "/auth/reset", { token, password }),
  updateProfile: (name: string) => call<{ user: User }>("PATCH", "/auth/me", { name }),
  changePassword: (current: string | undefined, password: string) => call<{ user: User }>("POST", "/auth/password", { current, password }),
  deleteAccount: (confirm: string) => call<void>("DELETE", "/auth/me", { confirm }),
  listBoards: () => call<{ boards: CloudBoard[]; shared: CloudBoard[]; teams?: TeamSummary[] }>("GET", "/boards"),
  teams: () => call<{ teams: TeamSummary[] }>("GET", "/teams"),
  createTeam: (name: string) => call<{ team: TeamDetail }>("POST", "/teams", { name }),
  getTeam: (id: string) => call<{ team: TeamDetail }>("GET", `/teams/${id}`),
  renameTeam: (id: string, name: string) => call<{ team: TeamDetail }>("PATCH", `/teams/${id}`, { name }),
  deleteTeam: (id: string) => call<void>("DELETE", `/teams/${id}`),
  inviteToTeam: (id: string, email: string, role: "admin" | "member") => call<{ team: TeamDetail; emailed?: boolean }>("PUT", `/teams/${id}/members`, { email, role }),
  removeTeamMember: (id: string, userId: string) => call<{ team: TeamDetail | null }>("DELETE", `/teams/${id}/members/${userId}`),
  cancelTeamInvite: (id: string, email: string) => call<{ team: TeamDetail }>("DELETE", `/teams/${id}/invites/${encodeURIComponent(email)}`),
  getPeople: (id: string) => call<People>("GET", `/boards/${id}/members`),
  invite: (id: string, email: string, role: "editor" | "viewer") => call<People>("PUT", `/boards/${id}/members`, { email, role }),
  removeMember: (id: string, userId: string) => call<People>("DELETE", `/boards/${id}/members/${userId}`),
  cancelInvite: (id: string, email: string) => call<People>("DELETE", `/boards/${id}/invites/${encodeURIComponent(email)}`),
  getActivity: (id: string) => call<{ activity: ActivityItem[] }>("GET", `/boards/${id}/activity`),
  mention: (id: string, handles: string[], text: string) => call<{ notified: number }>("POST", `/boards/${id}/mentions`, { handles, text }),
  notifications: () => call<{ notifications: NotificationItem[]; unread: number }>("GET", "/notifications"),
  markNotificationsRead: () => call<{ ok: true }>("POST", "/notifications/read"),
  getBoard: (id: string) => call<{ board: CloudBoard }>("GET", `/boards/${id}`),
  createBoard: (name: string, objects: BoardObject[]) => call<{ board: CloudBoard }>("POST", "/boards", { name, objects }),
  saveBoard: (id: string, objects: BoardObject[], viewport: Viewport) => call<{ updatedAt: number }>("PUT", `/boards/${id}`, { objects, viewport }),
  renameBoard: (id: string, name: string) => call<{ name: string }>("PATCH", `/boards/${id}`, { name }),
  updateBoard: (id: string, patch: { name?: string; favorite?: boolean; folder?: string; trashed?: boolean; teamId?: string }) => call<unknown>("PATCH", `/boards/${id}`, patch),
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
