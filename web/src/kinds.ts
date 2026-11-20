import type { BoardObject, CommentObj, ReactionObj, SettingsObj, TimerObj, VoteObj } from "./types";

// Some board objects are not drawn on the canvas: comments, votes, the timer and reactions are HTML on top of it.
// They sync like every other object, but they have no size, cannot be selected with a box, exported, or copied.
export type Overlay = CommentObj | VoteObj | TimerObj | ReactionObj | SettingsObj;
const OVERLAY = new Set(["comment", "vote", "timer", "reaction", "settings"]);
export function isOverlay(o: BoardObject): o is Overlay;
export function isOverlay(o: { type: string }): boolean;
export function isOverlay(o: { type: string }): boolean {
  return OVERLAY.has(o.type);
}

// The timer and reactions belong to "now", not to the drawing: undo, redo and restoring a version leave them alone.
export const isTransient = (o: { type: string }) => o.type === "timer" || o.type === "reaction";
export const withLiveParts = (older: BoardObject[], current: BoardObject[]): BoardObject[] => [
  ...older.filter((o) => !isTransient(o)),
  ...current.filter(isTransient),
];
