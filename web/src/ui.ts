import { create } from "zustand";

export type Theme = "light" | "dark";
export type View = { name: "dashboard" } | { name: "board"; id: string } | { name: "auth" } | { name: "shared"; token: string };

const THEME_KEY = "sketchboard.theme";

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* storage blocked — fall through */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// The address bar is the source of truth for which screen is open: #/board/<id> or nothing (dashboard).
// That makes refresh and the browser Back button work with no router library.
export function viewFromHash(): View {
  const m = window.location.hash.match(/^#\/board\/([\w-]+)/);
  if (m) return { name: "board", id: m[1] };
  const sh = window.location.hash.match(/^#\/s\/([\w-]+)/);
  if (sh) return { name: "shared", token: sh[1] };
  return window.location.hash.startsWith("#/login") ? { name: "auth" } : { name: "dashboard" };
}

interface UIState {
  theme: Theme;
  view: View;
  toggleTheme: () => void;
  go: (v: View) => void;
}

export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme(),
  view: viewFromHash(),
  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  go: (v) => {
    window.location.hash = v.name === "board" ? `#/board/${v.id}` : v.name === "auth" ? "#/login" : "#/";
  },
}));

window.addEventListener("hashchange", () => useUI.setState({ view: viewFromHash() }));
