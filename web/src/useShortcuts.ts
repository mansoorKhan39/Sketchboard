import { useEffect, useState } from "react";
import { useBoard } from "./store";
import type { Tool } from "./types";

const KEY_TO_TOOL: Record<string, Tool> = { v: "select", n: "sticky", s: "shape", p: "pen", t: "text", l: "connector" };

// Registers all keyboard shortcuts from the UI/UX document. Returns whether Space is held (for panning).
export function useShortcuts() {
  const [spaceDown, setSpaceDown] = useState(false);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      return el.tagName === "TEXTAREA" || el.tagName === "INPUT";
    };

    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const s = useBoard.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      } else if (mod && k === "z") {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        s.redo();
      } else if (mod && k === "c") s.copy();
      else if (mod && k === "v") s.paste();
      else if (mod && k === "d") {
        e.preventDefault();
        s.duplicateSelected();
      } else if (e.key === "Delete" || e.key === "Backspace") s.removeSelected();
      else if (e.key === "Escape") {
        s.select([]);
        s.setTool("select");
      } else if (e.shiftKey && e.code === "Digit1") s.fitToContent(window.innerWidth, window.innerHeight);
      else if (!mod && KEY_TO_TOOL[k]) s.setTool(KEY_TO_TOOL[k]);
    };

    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return spaceDown;
}
