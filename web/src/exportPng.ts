import type Konva from "konva";
import { useBoard } from "./store";
import { useUI } from "./ui";
import { contentBounds } from "./geometry";

// The canvas registers its Konva stage here so the Export button can take a picture of the board.
let stage: Konva.Stage | null = null;
let transformer: Konva.Transformer | null = null;
export function registerStage(s: Konva.Stage | null, t: Konva.Transformer | null) {
  stage = s;
  transformer = t;
}

const MAX_PIXELS = 8000; // longest side of the picture

// Save the whole board as a PNG file. Returns an error text, or null when it worked.
export function exportPng(fileName: string): string | null {
  if (!stage) return "The board is not ready yet.";
  const box = contentBounds(useBoard.getState().objects);
  if (!box) return "This board is empty. Add something before exporting.";

  const saved = { x: stage.x(), y: stage.y(), sx: stage.scaleX(), sy: stage.scaleY() };
  const hadHandles = transformer?.visible() ?? false;
  try {
    transformer?.visible(false);
    // look at the board at 100% with its top-left corner at the top-left of the picture
    stage.position({ x: -box.x, y: -box.y });
    stage.scale({ x: 1, y: 1 });
    const pixelRatio = Math.min(2, MAX_PIXELS / Math.max(box.width, box.height));
    const art = stage.toCanvas({ x: 0, y: 0, width: box.width, height: box.height, pixelRatio });

    // paint the page colour behind it, so dark mode and light mode both look right
    const out = document.createElement("canvas");
    out.width = art.width;
    out.height = art.height;
    const g = out.getContext("2d")!;
    g.fillStyle = useUI.getState().theme === "dark" ? "#0e111f" : "#f3f5f9";
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(art, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (fileName.trim().replace(/[\\/:*?"<>|]+/g, "-") || "board") + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
    return null;
  } catch {
    return "Could not export this board.";
  } finally {
    stage.position({ x: saved.x, y: saved.y });
    stage.scale({ x: saved.sx, y: saved.sy });
    transformer?.visible(hadHandles);
    stage.batchDraw();
  }
}
