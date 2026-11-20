import { useEffect, useState } from "react";
import { useBoard } from "./store";
import type { Tool } from "./types";
import { voterId } from "./extras";
import { useAuth } from "./auth";
import { placeImages, viewCenter } from "./image";

const KEY_TO_TOOL: Record<string, Tool> = { v: "select", n: "sticky", s: "shape", p: "pen", t: "text", l: "connector", f: "frame", c: "comment" };

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

      if (s.present) {
        // presentation mode has its own few keys
        if (e.key === "Escape") s.stopPresent();
        else if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) s.stepPresent(1);
        else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) s.stepPresent(-1);
        else return;
        e.preventDefault();
        return;
      }

      if ((e.key === "Tab" || e.key === "Enter") && !mod && s.selectedIds.length === 1 && s.role !== "viewer") {
        // mind map: Tab adds a child note, Enter adds a sibling (next to the selected one)
        const sel = s.objects.find((o) => o.id === s.selectedIds[0]);
        if (sel && (sel.type === "sticky" || sel.type === "shape" || sel.type === "text")) {
          e.preventDefault();
          const me = voterId(useAuth.getState().user?.id);
          const id = e.key === "Tab" ? s.addChildNode(sel.id, me) : s.addSiblingNode(sel.id, me);
          if (id) useBoard.getState().setEditing(id);
          return;
        }
      }
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

    // Ctrl+V with a picture on the clipboard (a screenshot, a copied image) adds it to the board.
    const paste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      const c = viewCenter();
      void placeImages(files, c.x, c.y);
    };

    window.addEventListener("keydown", down);
    window.addEventListener("paste", paste);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("paste", paste);
    };
  }, []);

  return spaceDown;
}
