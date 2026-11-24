import { create } from "zustand";
import { nanoid } from "nanoid";
import type { BoardObject, Connector, Placeable, Sticky, Tool, Viewport } from "./types";
import { getRepo } from "./repo";
import { useUI } from "./ui";
import { api, ApiError } from "./api";
import { applyOps, diffOps } from "./realtime/ops";
import { isActive, sendOps, startRealtime, stopRealtime } from "./realtime/connection";
import type { Op, Peer, Role } from "./realtime/protocol";
import { MAX_SCALE, MIN_SCALE } from "./constants";
import { sortedFrames } from "./geometry";
import { isOverlay, withLiveParts } from "./kinds";
import { MAX_VOTES, newVote } from "./extras";
import { alignPatches, distributePatches, groupPatches, layerPatches, nextZ, placeable } from "./arrange";
import type { AlignMode, LayerMove } from "./arrange";

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
  commentId: string | null; // comment whose thread is open
  present: { index: number; back: Viewport } | null; // presentation mode: which frame is on screen, and the view to return to

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
  alignSelected: (mode: AlignMode) => void;
  distributeSelected: (axis: "h" | "v") => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  lockSelected: (on: boolean) => void;
  moveLayer: (move: LayerMove) => void;
  duplicateSelected: () => void;
  copy: () => void;
  paste: () => void;
  restoreObjects: (objects: BoardObject[]) => void;
  addChildNode: (parentId: string, voter: string) => string | null; // mind map: a new note linked to this one
  addSiblingNode: (id: string, voter: string) => string | null;
  liveEdit: (change: (objects: BoardObject[]) => BoardObject[]) => void; // a change that is not part of undo history (timer, reactions)
  castVotes: (ids: string[], voter: string) => void;
  withdrawVotes: (ids: string[], voter: string) => void;
  undo: () => void;
  redo: () => void;
  fitToContent: (w: number, h: number) => void;
  setCommentId: (id: string | null) => void;
  startPresent: (fromId?: string) => void;
  stepPresent: (delta: number) => void;
  stopPresent: () => void;
}

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)); // (same rule as viewport.ts)
const HISTORY_LIMIT = 100;

// Every change that should be undoable goes through this helper:
// it saves the current objects in `past` and clears `future`.
const withHistory = (s: BoardState, objects: BoardObject[]) => ({
  objects,
  past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.objects],
  future: [] as BoardObject[][],
});

// Copies get new ids, and a copied group becomes a NEW group (it must not join the original).
const cloneAll = (list: BoardObject[]): BoardObject[] => {
  const groups = new Map<string, string>();
  return list.map((o) => {
    const copy = { ...o, id: nanoid(10), x: o.x + 24, y: o.y + 24 } as BoardObject;
    if (o.group) {
      if (!groups.has(o.group)) groups.set(o.group, nanoid(8));
      copy.group = groups.get(o.group);
    }
    return copy;
  });
};

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
  commentId: null,
  present: null,

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
    // a board that was never panned or zoomed (a fresh template, say) opens fitted to its content
    const vp0 = data.viewport;
    if (vp0.x === 0 && vp0.y === 0 && vp0.scale === 1 && data.objects.some((o) => !isOverlay(o))) {
      get().fitToContent(window.innerWidth, window.innerHeight);
    }
    // Signed-in users' boards open a live room (so others can join). If that is not possible the board simply works alone.
    if (getRepo().kind === "cloud") startRealtime(id, () => api.joinBoard(id), async () => (await api.getBoard(id)).board.objects);
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
    startRealtime(info.boardId, (prev) => api.shareJoin(token, name, prev), async () => (await api.getShareState(token)).objects);
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
    set({ boardId: null, mode: "owned", sharedToken: null, loaded: false, role: "solo", objects: [], selectedIds: [], editingId: null, past: [], future: [], notice: "", present: null, commentId: null });
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

  setTool: (tool) => set((s) => (canEditNow(s) || tool === "select" || tool === "hand" ? { tool, editingId: null } : s)),
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

  addObject: (o) =>
    set((s) => {
      if (!canEditNow(s)) return s;
      const z = nextZ(s.objects); // on top, once layers are in use
      return { ...withHistory(s, [...s.objects, z === undefined || o.z !== undefined ? o : ({ ...o, z } as BoardObject)]), selectedIds: [o.id] };
    }),

  updateObjects: (patches) =>
    set((s) => {
      if (!canEditNow(s)) return s;
      let changed = false;
      const next = s.objects.map((o) => {
        const p = patches[o.id];
        if (!p) return o;
        if (o.locked && !("locked" in p)) return o; // a locked object ignores every change except unlocking
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
      const gone = new Set(s.selectedIds.filter((id) => !s.objects.find((o) => o.id === id)?.locked)); // locked things stay
      if (!gone.size) return s;
      // a connector disappears together with either of the objects it joins
      const keep = s.objects.filter(
        (o) =>
          !gone.has(o.id) &&
          !(o.type === "connector" && (gone.has(o.fromId) || gone.has(o.toId))) &&
          !(o.type === "vote" && gone.has(o.targetId)),
      );
      return { ...withHistory(s, keep), selectedIds: [] };
    }),

  // ---- arranging (all of these are ordinary undoable edits that sync like any other) ----
  alignSelected: (mode) => {
    const s = get();
    const items = s.objects.filter((o) => s.selectedIds.includes(o.id) && placeable(o) && !o.locked);
    s.updateObjects(alignPatches(items, mode));
  },
  distributeSelected: (axis) => {
    const s = get();
    const items = s.objects.filter((o) => s.selectedIds.includes(o.id) && placeable(o) && !o.locked);
    s.updateObjects(distributePatches(items, axis));
  },
  groupSelected: () => {
    const s = get();
    const ids = s.objects.filter((o) => s.selectedIds.includes(o.id) && placeable(o) && !o.locked).map((o) => o.id);
    if (ids.length < 2) return;
    s.updateObjects(groupPatches(ids, nanoid(8)));
  },
  ungroupSelected: () => {
    const s = get();
    const ids = s.objects.filter((o) => s.selectedIds.includes(o.id) && o.group).map((o) => o.id);
    if (ids.length) s.updateObjects(groupPatches(ids, ""));
  },
  lockSelected: (on) => {
    const s = get();
    const ids = s.selectedIds.filter((id) => s.objects.some((o) => o.id === id && placeable(o)));
    s.updateObjects(Object.fromEntries(ids.map((id) => [id, { locked: on }])));
  },
  moveLayer: (move) => {
    const s = get();
    const ids = s.objects.filter((o) => s.selectedIds.includes(o.id) && !o.locked).map((o) => o.id);
    s.updateObjects(layerPatches(s.objects, ids, move));
  },

  duplicateSelected: () =>
    set((s) => {
      if (!canEditNow(s)) return s;
      const picked = s.objects.filter((o) => s.selectedIds.includes(o.id) && o.type !== "connector" && !isOverlay(o));
      const copies = cloneAll(picked);
      if (!copies.length) return s;
      return { ...withHistory(s, [...s.objects, ...copies]), selectedIds: copies.map((c) => c.id) };
    }),

  copy: () =>
    set((s) => ({ clipboard: s.objects.filter((o) => s.selectedIds.includes(o.id) && o.type !== "connector" && !isOverlay(o)) })),

  paste: () =>
    set((s) => {
      if (!s.clipboard.length || !canEditNow(s)) return s;
      const copies = cloneAll(s.clipboard);
      return {
        ...withHistory(s, [...s.objects, ...copies]),
        selectedIds: copies.map((c) => c.id),
        clipboard: copies, // next paste lands a bit further away
      };
    }),

  // Version history: put an older copy of the board on screen. It is a normal, undoable edit,
  // so everyone live on the board sees it too and Ctrl+Z brings the current board back.
  restoreObjects: (objects) =>
    set((s) => (canEditNow(s) ? { ...withHistory(s, withLiveParts(objects, s.objects)), selectedIds: [], editingId: null, commentId: null } : s)),

  addChildNode: (parentId, voter) => {
    const s = get();
    if (!canEditNow(s)) return null;
    const parent = s.objects.find((o) => o.id === parentId);
    if (!parent || parent.type === "connector" || isOverlay(parent) || parent.type === "frame") return null;
    const kids = s.objects
      .filter((o): o is Connector => o.type === "connector" && o.fromId === parentId)
      .map((c) => s.objects.find((o) => o.id === c.toId))
      .filter((o): o is Placeable => !!o && o.type !== "connector" && !isOverlay(o));
    const h = 110;
    const y = kids.length ? Math.max(...kids.map((k) => k.y + k.height)) + 24 : parent.y + (parent.height - h) / 2;
    const node: Sticky = {
      id: nanoid(10), type: "sticky", x: parent.x + parent.width + 100, y, width: 180, height: h, rotation: 0, text: "",
      color: parent.type === "sticky" ? parent.color : "#FFD43B", by: voter,
    };
    const link: Connector = {
      id: nanoid(10), type: "connector", x: 0, y: 0, width: 0, height: 0, rotation: 0,
      fromId: parentId, toId: node.id, lineStyle: "straight", endArrow: false, color: "#1F2937",
    };
    set((st) => ({ ...withHistory(st, [...st.objects, node, link]), selectedIds: [node.id] }));
    return node.id;
  },
  addSiblingNode: (id, voter) => {
    const up = get().objects.find((o): o is Connector => o.type === "connector" && o.toId === id);
    return up ? get().addChildNode(up.fromId, voter) : null;
  },

  liveEdit: (change) => set((s) => (canEditNow(s) ? { objects: change(s.objects) } : s)),

  castVotes: (ids, voter) =>
    set((s) => {
      if (!canEditNow(s)) return s;
      const left = MAX_VOTES - s.objects.filter((o) => o.type === "vote" && o.voter === voter).length;
      const targets = s.objects.filter((o) => ids.includes(o.id) && !isOverlay(o) && o.type !== "connector" && o.type !== "frame").slice(0, Math.max(0, left));
      if (!targets.length) return s;
      return withHistory(s, [...s.objects, ...targets.map((t) => newVote(t.id, voter))]);
    }),

  // takes back one of my votes from each selected object
  withdrawVotes: (ids, voter) =>
    set((s) => {
      if (!canEditNow(s)) return s;
      const drop = new Set<string>();
      for (const id of ids) {
        const mine = s.objects.filter((o) => o.type === "vote" && o.targetId === id && o.voter === voter);
        if (mine.length) drop.add(mine[mine.length - 1].id);
      }
      return drop.size ? withHistory(s, s.objects.filter((o) => !drop.has(o.id))) : s;
    }),

  undo: () =>
    set((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev || !canEditNow(s)) return s;
      return {
        objects: withLiveParts(prev, s.objects),
        past: s.past.slice(0, -1),
        future: [s.objects, ...s.future],
        selectedIds: s.selectedIds.filter((id) => prev.some((o) => o.id === id)),
      };
    }),

  redo: () =>
    set((s) => {
      const next = s.future[0];
      if (!next || !canEditNow(s)) return s;
      return { objects: withLiveParts(next, s.objects), future: s.future.slice(1), past: [...s.past, s.objects] };
    }),

  setCommentId: (commentId) => set({ commentId }),
  startPresent: (fromId) =>
    set((s) => {
      const frames = sortedFrames(s.objects);
      if (!frames.length) return s;
      const at = fromId ? frames.findIndex((f) => f.id === fromId) : 0;
      return { present: { index: Math.max(0, at), back: s.viewport }, selectedIds: [], editingId: null, tool: "select" };
    }),
  stepPresent: (delta) =>
    set((s) => {
      if (!s.present) return s;
      const n = sortedFrames(s.objects).length;
      const index = Math.min(n - 1, Math.max(0, s.present.index + delta));
      return { present: { ...s.present, index } };
    }),
  stopPresent: () => set((s) => (s.present ? { viewport: s.present.back, present: null } : s)),

  fitToContent: (w, h) => {
    const objects = get().objects.filter((o) => o.type !== "connector" && !isOverlay(o));
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
  // Whoever edits saves the board (live editing only carries changes between screens; the server keeps the copy).
  // A viewer has nothing to save.
  if (!s.boardId || s.role === "viewer") return queue;
  const { boardId, objects, viewport, mode, sharedToken } = s; // snapshot now; the user may keep editing while we wait
  queue = queue.then(async () => {
    try {
      if (mode === "shared" && sharedToken) await api.saveShared(sharedToken, objects);
      else await getRepo().save(boardId, objects, viewport);
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
  if (s.role === "viewer" || remoteDepth > 0) return; // changes that came from someone else are saved by that person
  if (s.objects === prev.objects && s.viewport === prev.viewport) return;
  if (s.saveStatus !== "saving") useBoard.setState({ saveStatus: "saving" });
  clearTimeout(timer);
  timer = setTimeout(() => void flushSave(), getRepo().saveDelay);
});
window.addEventListener("pagehide", () => void flushSave());
