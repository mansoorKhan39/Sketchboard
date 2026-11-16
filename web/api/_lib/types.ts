// Shapes used by the API. (The browser app has its own copy in src/api.ts — the two sides only share JSON.)

export interface UserRec {
  id: string;
  email: string; // always lower-case
  name: string;
  passwordHash: string; // "scrypt$<salt>$<hash>"
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

export interface BoardRec {
  id: string;
  ownerId: string;
  name: string;
  objects: unknown[]; // validated on the way in, stored as-is
  viewport: Viewport;
  share?: ShareSettings;
  createdAt: number;
  updatedAt: number;
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
