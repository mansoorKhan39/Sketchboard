import type { Guide } from "./snapping";
import { create } from "zustand";

export type Theme = "light" | "dark";
export type View =
  | { name: "landing" }
  | { name: "dashboard" }
  | { name: "board"; id: string }
  | { name: "auth" }
  | { name: "shared"; token: string }
  | { name: "forgot" }
  | { name: "reset"; token: string }
  | { name: "profile" };

const THEME_KEY = "sketchboard.theme";
const NAV_KEY = "sketchboard.nav";

// Two small personal settings for moving around the board, remembered in this browser.
export type WheelMode = "zoom" | "scroll";
type Nav = { wheelMode: WheelMode; minimap: boolean; snap: boolean; grid: boolean };
function initialNav(): Nav {
  try {
    const n = JSON.parse(localStorage.getItem(NAV_KEY) ?? "{}");
    return { wheelMode: n.wheelMode === "scroll" ? "scroll" : "zoom", minimap: n.minimap !== false, snap: n.snap !== false, grid: n.grid === true };
  } catch {
    return { wheelMode: "zoom", minimap: true, snap: true, grid: false };
  }
}

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* storage blocked — fall through */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// A board opened inside someone else's page (an iframe) uses ...#/s/<token>?embed=1 and shows only the canvas.
export const isEmbed = () => /[?&]embed=1(&|$)/.test(window.location.hash);

// The address bar is the source of truth for which screen is open: #/board/<id> or nothing (dashboard).
// That makes refresh and the browser Back button work with no router library.
export function viewFromHash(): View {
  const m = window.location.hash.match(/^#\/board\/([\w-]+)/);
  if (m) return { name: "board", id: m[1] };
  const sh = window.location.hash.match(/^#\/s\/([\w-]+)/);
  if (sh) return { name: "shared", token: sh[1] };
  if (window.location.hash.startsWith("#/login")) return { name: "auth" };
  const rs = window.location.hash.match(/^#\/reset\/([\w-]+)/);
  if (rs) return { name: "reset", token: rs[1] };
  if (window.location.hash.startsWith("#/forgot")) return { name: "forgot" };
  if (window.location.hash.startsWith("#/profile")) return { name: "profile" };
  // an address with no hash at all is the front door; "#/" is the dashboard
  return window.location.hash === "" || window.location.hash === "#" ? { name: "landing" } : { name: "dashboard" };
}

interface UIState {
  theme: Theme;
  view: View;
  toast: { id: number; text: string } | null;
  showToast: (text: string) => void;
  toggleTheme: () => void;
  wheelMode: WheelMode; // what a mouse wheel does on the board
  minimap: boolean; // show the small overview map
  snap: boolean; // dragged objects snap to the others (smart guides)
  grid: boolean; // dragged objects snap to a grid when nothing else is close
  guides: Guide[]; // guide lines shown while dragging (not saved)
  setSnap: (on: boolean) => void;
  setGrid: (on: boolean) => void;
  setGuides: (g: Guide[]) => void;
  setWheelMode: (m: WheelMode) => void;
  setMinimap: (on: boolean) => void;
  go: (v: View) => void;
}

export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme(),
  view: viewFromHash(),
  ...initialNav(),
  guides: [],
  setSnap: (snap) => {
    set({ snap });
    saveNav(get());
  },
  setGrid: (grid) => {
    set({ grid });
    saveNav(get());
  },
  setGuides: (guides) => set({ guides }),
  setWheelMode: (wheelMode) => {
    set({ wheelMode });
    saveNav(get());
  },
  setMinimap: (minimap) => {
    set({ minimap });
    saveNav(get());
  },
  toast: null,
  // a short message at the bottom of the screen ("Link copied")
  showToast: (text) => {
    const id = Date.now();
    set({ toast: { id, text } });
    setTimeout(() => get().toast?.id === id && set({ toast: null }), 2200);
  },
  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    // fade the colours for a moment instead of snapping
    const root = document.documentElement;
    root.classList.add("theme-anim");
    setTimeout(() => root.classList.remove("theme-anim"), 320);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  go: (v) => {
    window.location.hash =
      v.name === "board" ? `#/board/${v.id}` : v.name === "auth" ? "#/login" : v.name === "forgot" ? "#/forgot" : v.name === "profile" ? "#/profile" : v.name === "reset" ? `#/reset/${v.token}` : v.name === "landing" ? "" : "#/";
  },
}));

function saveNav(s: Nav) {
  try {
    localStorage.setItem(NAV_KEY, JSON.stringify({ wheelMode: s.wheelMode, minimap: s.minimap, snap: s.snap, grid: s.grid }));
  } catch {
    /* ignore */
  }
}

window.addEventListener("hashchange", () => useUI.setState({ view: viewFromHash() }));
