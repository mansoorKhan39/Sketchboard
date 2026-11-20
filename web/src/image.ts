import { newId, useBoard } from "./store";
import type { ImageObj } from "./types";
import { fitInside } from "./geometry";

// Pictures are shrunk in the browser and stored inside the board as a small data URL.
// (A free setup has no file storage, so the picture has to travel inside the board document.)
export const MAX_IMAGE_CHARS = 150_000; // the room accepts up to 200,000 characters per picture
export const MAX_SOURCE_BYTES = 15_000_000; // the file the user picks
const MAX_SIDE = 800; // longest side after shrinking, in pixels
const SHOW_WIDTH = 360; // how wide a new picture appears on the board

function encode(bmp: ImageBitmap, w: number, h: number, quality: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  let url = c.toDataURL("image/webp", quality); // keeps transparency and is small
  if (!url.startsWith("data:image/webp")) {
    // this browser cannot write webp: use jpeg on a white background
    g.globalCompositeOperation = "destination-over";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, w, h);
    url = c.toDataURL("image/jpeg", quality);
  }
  return url;
}

// Turn a picture file into a board object centred on (cx, cy). Throws a short message for the user.
export async function fileToImage(file: File, cx: number, cy: number): Promise<ImageObj> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not a picture.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That picture is larger than 15 MB.");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("Could not read that picture. Try a PNG, JPG or WebP file.");
  }
  let src = "";
  for (const side of [MAX_SIDE, 640, 480, 360, 240]) {
    const { w, h } = fitInside(bmp.width, bmp.height, side);
    for (const q of [0.82, 0.65, 0.5]) {
      src = encode(bmp, w, h, q);
      if (src.length <= MAX_IMAGE_CHARS) break;
    }
    if (src.length <= MAX_IMAGE_CHARS) break;
  }
  const naturalWidth = bmp.width; // read these before close(): a closed bitmap reports 0
  const ratio = bmp.height / bmp.width;
  bmp.close();
  if (src.length > MAX_IMAGE_CHARS) throw new Error("That picture is too detailed to store. Try a smaller one.");
  const width = Math.min(SHOW_WIDTH, naturalWidth);
  const height = Math.max(20, Math.round(width * ratio));
  return {
    id: newId(), type: "image", x: cx - width / 2, y: cy - height / 2, width, height, rotation: 0,
    src, name: file.name.slice(0, 60),
  };
}

function tell(message: string) {
  useBoard.setState({ notice: message });
  setTimeout(() => {
    if (useBoard.getState().notice === message) useBoard.setState({ notice: "" });
  }, 4000);
}

// Add picture files to the board around the world point (cx, cy). Several files are fanned out a little.
export async function placeImages(files: File[], cx: number, cy: number): Promise<void> {
  const s = useBoard.getState();
  if (s.role === "viewer") return;
  let i = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    try {
      const o = await fileToImage(f, cx + i * 30, cy + i * 30);
      useBoard.getState().addObject(o);
      i++;
    } catch (e) {
      tell(e instanceof Error ? e.message : "Could not add that picture.");
    }
  }
}

// The point of the board that is in the middle of the screen.
export function viewCenter(): { x: number; y: number } {
  const { viewport: v } = useBoard.getState();
  return { x: (window.innerWidth / 2 - v.x) / v.scale, y: (window.innerHeight / 2 - v.y) / v.scale };
}

// Screen point to board point.
export function toWorld(clientX: number, clientY: number): { x: number; y: number } {
  const { viewport: v } = useBoard.getState();
  return { x: (clientX - v.x) / v.scale, y: (clientY - v.y) / v.scale };
}
