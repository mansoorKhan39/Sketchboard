// Shapes of the board data and of the messages between browsers.

export type ObjType = "sticky" | "shape" | "stroke" | "text" | "image" | "frame" | "comment" | "vote" | "timer" | "reaction" | "settings" | "connector" | "table";
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

// What travels over Ably. Edits go on the channel "board:<id>" under the message name "edit"; if one is too big for a
// single message it is cut into pieces named "chunk" (see chunks.ts). Pointers go on "cur:<id>" as "c".
export interface EditMsg {
  ops: Op[];
}
export interface ChunkMsg {
  eid: string; // which edit these pieces belong to
  i: number; // piece number, from 0
  n: number; // how many pieces in all
  s: string; // this piece of the JSON text
}
export interface CursorMsg {
  x: number;
  y: number;
}
// A stroke somebody is drawing right now: the new points since the last message (live drawing). The finished stroke
// arrives as a normal edit; `done` says the live copy can go.
export interface DraftMsg {
  id: string;
  p: number[];
  c?: string;
  w?: number;
  a?: number;
  done?: boolean;
}
// Where somebody is looking (for "follow"): the board point in the middle of their screen, and their zoom.
export interface ViewMsg {
  cx: number;
  cy: number;
  s: number;
}
// What each person publishes about themselves with "who is here" (Ably presence).
export interface PresenceData {
  name: string;
  color: string;
  role: Role;
}
