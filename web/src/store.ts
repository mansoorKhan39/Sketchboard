import { create } from "zustand";
import { nanoid } from "nanoid";
import type { BoardObject, Tool, Viewport } from "./types";
import { getRepo } from "./repo";
import { useUI } from "./ui";
import { api, ApiError } from "./api";
import { applyOps, diffOps } from "./realtime/ops";
import { isActive, sendOps, startRealtime, stopRealtime } from "./realtime/connection";
import type { Op, Peer, Role } from "./realtime/protocol";
import { MAX_SCALE, MIN_SCALE } from "./constants";

export type Connection = "off" | "connecting" | "live" | "offline";

interface BoardState {
  boardId: string | null; // which saved board is open (null = dashboard)
  mode: "owned" | "shared"; // "shared" = opened through someone's share link
  sharedToken: string | null;
  loaded: boolean; // the board's content is on screen (for share links: the room has sent it)
  // --- live collaboration ---
  connection: Connection; // "off" = working alone (normal saving), "live" = connected to the room
  role: Role | "solo"; // what this screen is allowed to do; "viewer" cannot edit
  me: Peer | null;
  peers: Peer[]; // the other people on the board
  cursors: Record<string, { x: number; y: number; at: number }>; // by peer id, in board coordinates
  notice: string; // a short message about the connection ("Slow down a little.")
  boardName: string;
  saveStatus: "saved" | "saving" | "error";
  objects: BoardObject[]; // array order = z-order (last is on top)
  selectedIds: string[];
  tool: Tool;
  viewport: Viewport;
  editingId: string | null;
  past: BoardObject[][];
  future: BoardObject[][];
  clipboard: BoardObject[];

  openBoard: (id: string) => Promise<"ok" | "missing" | "stale">;
  openShared: (token: string) => Promise<"ok" | "missing" | "unavailable" | "stale">;
  loadSnapshot: (objects: BoardObject[], pendingOps: Op[]) => void;
  applyRemoteOps: (ops: Op[]) => void;
  closeBoard: () => void;
  renameBoard: (name: string) => void;
  setTool: (t: Tool) => void;
  setViewport: (v: Viewport) => void;
  zoomBy: (factor: number, cx: number, cy: number) => void;
  select: (ids: string[]) => void;
  setEditing: (id: string | null) => void;

  addObject: (o: BoardObject) => void;
  updateObjects: (patches: Record<string, Partial<BoardObject>>) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  copy: () => void;
  paste: () => void;
  undo: () => void;
  redo: () => void;
  fitToContent: (w: number, h: number) => void;
}

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
const HISTORY_LIMIT = 100;

// Every change that should be undoable goes through this helper:
// it saves the current objects in `past` and clears `future`.
const withHistory = (s: BoardState, objects: BoardObject[]) => ({
  objects,
  past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.objects],
  future: [] as BoardObject[][],
});

const cloneWithOffset = (o: BoardObject): BoardObject => ({ ...o, id: nanoid(10), x: o.x + 24, y: o.y + 24 });

// While this is above 0, changes come from other people (or the room), so they must NOT be sent back out.
let remoteDepth = 0;
const asRemote = (fn: () => void) => {
  remoteDepth++;
  try {
    fn();
  } finally {
    remoteDepth--;
  }
};
const canEditNow = (s: { role: Role | "solo" }) => s.role !== "viewer";

const guestName = () => {
  try {
    return localStorage.getItem("sketchboard.guestName") || "Guest";
  } catch {
    return "Guest";
  }
};

export const useBoard = create<BoardState>((set, get) => ({
  boardId: null,
  mode: "owned",
  sharedToken: null,
  loaded: false,
  connection: "off",
  role: "solo",
  me: null,
  peers: [],
  cursors: {},
  notice: "",
  boardName: "",
  saveStatus: "saved",
  objects: [],
  selectedIds: [],
  tool: "select",
  viewport: { x: 0, y: 0, scale: 1 },
  editingId: null,
  past: [],
  future: [],
  clipboard: [],

  openBoard: async (id) => {
    let data = null;
    try {
      data = await getRepo().get(id);
    } catch {
      /* server unreachable: treat like "not found" and go back to the dashboard */
    }
    const v = useUI.getState().view;
    if (v.name !== "board" || v.id !== id) return "stale"; // the user already went somewhere else
    if (!data) return "missing";
    stopRealtime();
    set({
      boardId: id,
      mode: "owned",
      sharedToken: null,
      loaded: true,
      role: "solo",
      boardName: data.name,
      saveStatus: "saved",
      objects: data.objects,
      viewport: data.viewport,
      selectedIds: [],
      tool: "select",
      editingId: null,
      past: [],
      future: [],
    });
    // Signed-in users' boards open a live room (so others can join). If that is not possible the board simply works alone.
    if (getRepo().kind === "cloud") startRealtime(id, () => api.joinBoard(id));
    return "ok";
  },

  openShared: async (token) => {
    const name = guestName();
    let info;
    try {
      info = await api.shareJoin(token, name);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return "missing";
      return "unavailable";
    }
    const v = useUI.getState().view;
    if (v.name !== "shared" || v.token !== token) return "stale";
    stopRealtime();
    set({
      boardId: info.boardId,
      mode: "shared",
      sharedToken: token,
      loaded: false, // the room sends the content
      role: info.role,
      boardName: info.name,
      saveStatus: "saved",
      objects: [],
      viewport: { x: 0, y: 0, scale: 1 },
      selectedIds: [],
      tool: "select",
      editingId: null,
      past: [],
      future: [],
    });
    startRealtime(info.boardId, () => api.shareJoin(token, name));
    return "ok";
  },

  // The room sent the true board (first connect, reconnect, or after it refused one of our edits).
  // Our own not-yet-confirmed edits are laid on top so they are not lost.
  loadSnapshot: (objects, pendingOps) =>
    asRemote(() =>
      set((s) => {
        const next = applyOps(objects, pendingOps);
        return {
          objects: next,
          loaded: true,
          selectedIds: s.selectedIds.filter((id) => next.some((o) => o.id === id)),
          editingId: s.editingId && next.some((o) => o.id === s.editingId) ? s.editingId : null,
        };
      }),
    ),

  // Someone else changed the board. The same changes are also applied to our undo history, so pressing undo
  // reverts only OUR last action and never silently removes or brings back other people's work.
  applyRemoteOps: (ops) =>
    asRemote(() =>
      set((s) => {
        const objects = applyOps(s.objects, ops);
        return {
          objects,
          past: s.past.map((p) => applyOps(p, ops)),
          future: s.future.map((f) => applyOps(f, ops)),
          selectedIds: s.selectedIds.filter((id) => objects.some((o) => o.id === id)),
          editingId: s.editingId && objects.some((o) => o.id === s.editingId) ? s.editingId : null,
        };
      }),
    ),

  closeBoard: () => {
    void flushSave();
    stopRealtime();
    set({ boardId: null, mode: "owned", sharedToken: null, loaded: false, role: "solo", objects: [], selectedIds: [], editingId: null, past: [], future: [], notice: "" });
  },

  renameBoard: (name) => {
    const { boardId } = get();
    if (!boardId) return;
    const clean = name.trim() || "Untitled board";
    set({ boardName: clean });
    getRepo()
      .rename(boardId, clean)
      .catch(() => set({ saveStatus: "error" }));
  },

  setTool: (tool) => set((s) => (canEditNow(s) || tool === "select" ? { tool, editingId: null } : s)),
  setViewport: (viewport) => set({ viewport }),
  zoomBy: (factor, cx, cy) =>
    set((s) => {
      const scale = clampScale(s.viewport.scale * factor);
      const k = scale / s.viewport.scale;
      // keep the world point under (cx, cy) fixed on screen
      return { viewport: { scale, x: cx - (cx - s.viewport.x) * k, y: cy - (cy - s.viewport.y) * k } };
    }),
  select: (selectedIds) => set({ selectedIds }),
  setEditing: (editingId) => set((s) => (canEditNow(s) ? { editingId } : s)),

  addObject: (o) => set((s) => (canEditNow(s) ? { ...withHistory(s, [...s.objects, o]), selectedIds: [o.id] } : s)),

  updateObjects: (patches) =>
    set((s) => {
      if (!canEditNow(s)) return s;
      let changed = false;
      const next = s.objects.map((o) => {
        const p = patches[o.id];
        if (!p) return o;
        // skip no-op patches (e.g. the same drop reported twice) so undo history stays clean
        if ((Object.keys(p) as (keyof BoardObject)[]).every((k) => o[k] === (p as BoardObject)[k])) return o;
        changed = true;
        return { ...o, ...p } as BoardObject;
      });
      return changed ? withHistory(s, next) : s;
    }),

  removeSelected: () =>
    set((s) => {
      if (!s.selectedIds.length || !canEditNow(s)) return s;
      const gone = new Set(s.selectedIds);
      // a connector disappears together with either of the objects it joins
      const keep = s.objects.filter(
        (o) => !gone.has(o.id) && !(o.type === "connector" && (gone.has(o.fromId) || gone.has(o.toId))),
      );
      return { ...withHistory(s, keep), selectedIds: [] };
    }),

  duplicateSelected: () =>
    set((s) => {
      if (!canEditNow(s)) return s;
      const copies = s.objects.filter((o) => s.selectedIds.includes(o.id) && o.type !== "connector").map(cloneWithOffset);
      if (!copies.length) return s;
      return { ...withHistory(s, [...s.objects, ...copies]), selectedIds: copies.map((c) => c.id) };
    }),

  copy: () =>
    set((s) => ({ clipboard: s.objects.filter((o) => s.selectedIds.includes(o.id) && o.type !== "connector") })),

  paste: () =>
    set((s) => {
      if (!s.clipboard.length || !canEditNow(s)) return s;
      const copies = s.clipboard.map(cloneWithOffset);
      return {
        ...withHistory(s, [...s.objects, ...copies]),
        selectedIds: copies.map((c) => c.id),
        clipboard: copies, // next paste lands a bit further away
      };
    }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev || !canEditNow(s)) return s;
      return {
        objects: prev,
        past: s.past.slice(0, -1),
        future: [s.objects, ...s.future],
        selectedIds: s.selectedIds.filter((id) => prev.some((o) => o.id === id)),
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !canEditNow(s)) return s;
      return { objects: next, future: s.future.slice(1), past: [...s.past, s.objects] };
    }),

  fitToContent: (w, h) => {
    const objects = get().objects.filter((o) => o.type !== "connector");
    if (!objects.length) return set({ viewport: { x: 0, y: 0, scale: 1 } });
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of objects) {
      minX = Math.min(minX, o.x);
      minY = Math.min(minY, o.y);
      maxX = Math.max(maxX, o.x + o.width);
      maxY = Math.max(maxY, o.y + o.height);
    }
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const scale = clampScale(Math.min(w / bw, h / bh) * 0.85);
    set({
      viewport: {
        scale,
        x: (w - bw * scale) / 2 - minX * scale,
        y: (h - bh * scale) / 2 - minY * scale,
      },
    });
  },
}));

export const newId = () => nanoid(10);

// Saving: a moment after the last change, send the board to wherever it lives (this browser or the server).
// Saves are queued one after another, so an older save can never arrive after a newer one.
let timer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<void> = Promise.resolve();

export function flushSave(): Promise<void> {
  clearTimeout(timer);
  const s = useBoard.getState();
  // While connected to a room (or opened by share link) the ROOM saves the board, never this screen.
  if (!s.boardId || s.mode === "shared" || s.connection !== "off") return queue;
  const { boardId, objects, viewport } = s; // snapshot now; the user may keep editing while we wait
  queue = queue.then(async () => {
    try {
      await getRepo().save(boardId, objects, viewport);
      const now = useBoard.getState();
      if (now.boardId === boardId && now.objects === objects) useBoard.setState({ saveStatus: "saved" });
    } catch {
      if (useBoard.getState().boardId === boardId) {
        useBoard.setState({ saveStatus: "error" });
        timer = setTimeout(() => void flushSave(), 5000); // try again soon
      }
    }
  });
  return queue;
}

useBoard.subscribe((s, prev) => {
  if (!s.boardId || s.boardId !== prev.boardId) return; // just opened/closed a board — nothing new to save
  // a change made on this screen: tell the room (it will pass it on to everyone else)
  if (remoteDepth === 0 && s.objects !== prev.objects && isActive()) sendOps(diffOps(prev.objects, s.objects));
  if (s.mode === "shared" || s.connection !== "off") return;
  if (s.objects === prev.objects && s.viewport === prev.viewport) return;
  if (s.saveStatus !== "saving") useBoard.setState({ saveStatus: "saving" });
  clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), getRepo().saveDelay);
});
window.addEventListener("pagehide", () => void flushSave());
