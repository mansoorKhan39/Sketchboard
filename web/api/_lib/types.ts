// Shapes used by the API. (The browser app has its own copy in src/api.ts — the two sides only share JSON.)

export interface UserRec {
  id: string;
  email: string; // always lower-case
  name: string;
  passwordHash: string | null; // "scrypt$<salt>$<hash>"; null for an account that only signs in with Google
  googleId?: string; // Google's id for this person, set the first time they sign in with Google
  avatar?: string; // picture address (from Google)
  resetHash?: string; // sha-256 of the password-reset link's secret (the secret itself is only in the e-mail)
  resetExp?: number; // when that link stops working
  resetSentAt?: number; // when the last one was sent (so nobody can use us to flood an inbox)
  notifications?: NotificationRec[]; // newest first, at most 50
  createdAt: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ShareSettings {
  enabled: boolean;
  token: string; // secret part of the share link
  right: "viewer" | "editor";
}

export interface NotificationRec {
  id: string;
  at: number;
  text: string;
  boardId?: string; // the board to open when it is clicked
  read: boolean;
}
export interface MemberRec {
  userId: string;
  role: "editor" | "viewer";
  addedAt: number;
}
export interface InviteRec {
  email: string; // lower-case; becomes a member when someone signs up or in with this address
  role: "editor" | "viewer";
  at: number;
}
// A team (workspace): a group of people who share boards. "admin" has owner rights on the team's boards and manages people; "member" can edit them.
export type TeamRole = "admin" | "member";
export interface TeamRec {
  id: string;
  name: string;
  ownerId: string; // who created it
  members: { userId: string; role: TeamRole; addedAt: number }[];
  invites: { email: string; role: TeamRole; at: number }[];
  createdAt: number;
}
export interface ActivityRec {
  at: number;
  by: string; // the name of the person
  text: string;
}

export interface BoardRec {
  id: string;
  ownerId: string;
  name: string;
  objects: unknown[]; // validated on the way in, stored as-is
  viewport: Viewport;
  share?: ShareSettings;
  favorite?: boolean; // starred by the owner
  folder?: string; // name of the folder the owner put it in ("" or missing = no folder)
  teamId?: string; // the team this board belongs to ("" or missing = personal board)
  members?: MemberRec[];
  invites?: InviteRec[];
  activity?: ActivityRec[]; // newest first, at most 100 (member changes, renames, trash, saved versions)
  deletedAt?: number; // when it was moved to the trash (0 or missing = not in the trash)
  createdAt: number;
  updatedAt: number;
}

// A saved copy of a board's objects ("version history"). Kept apart from the board so loading a board stays light.
export interface VersionRec {
  id: string;
  at: number;
  label: string;
  objects: unknown[];
}

// A request/response pair that does not depend on any web framework,
// so the same code runs on Vercel, in the dev server, and in tests.
export interface ApiRequest {
  method: string;
  path: string; // everything after /api/v1, e.g. "/boards/abc123"
  headers: Record<string, string | undefined>; // lower-case names
  cookies: Record<string, string>;
  body: unknown; // already parsed JSON (or undefined)
  secure: boolean; // true when the request came in over HTTPS
}

export interface ApiResponse {
  status: number;
  headers?: Record<string, string | string[]>;
  body?: unknown;
}
