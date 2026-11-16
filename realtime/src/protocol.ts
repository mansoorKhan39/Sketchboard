// Messages between the browser and the room. (The browser has a matching copy in web/src/realtime/protocol.ts.)

export type ObjType = "sticky" | "shape" | "stroke" | "text" | "connector";
export interface Obj {
  id: string;
  type: ObjType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  [field: string]: unknown;
}

// An edit is a list of small operations:
//  add    — a new object (goes on top)
//  set    — change some fields of an object (other fields are untouched, so two people changing different
//           fields of the same object do not overwrite each other; the same field: the last one to reach the room wins)
//  remove — delete an object
export type Op = { op: "add"; obj: Obj } | { op: "set"; id: string; fields: Record<string, unknown> } | { op: "remove"; id: string };

export type Role = "owner" | "editor" | "viewer";

export interface Peer {
  id: string; // one per connection
  name: string;
  color: string;
  role: Role;
}

export type ClientMsg =
  | { t: "edit"; editId: string; ops: Op[] }
  | { t: "cursor"; x: number; y: number };

export type ServerMsg =
  | { t: "welcome"; you: Peer; seq: number; objects: Obj[]; peers: Peer[] }
  | { t: "ack"; editId: string; seq: number }
  | { t: "edit"; seq: number; from: string; ops: Op[] }
  | { t: "reject"; editId: string; reason: string; message: string }
  | { t: "presence"; peers: Peer[] }
  | { t: "cursor"; from: string; x: number; y: number };

// WebSocket close codes we use
export const CLOSE = {
  BAD_TOKEN: 4001,
  FORBIDDEN: 4003,
  NOT_FOUND: 4004,
  RATE_LIMIT: 4008,
  TOKEN_EXPIRED: 4010,
} as const;
