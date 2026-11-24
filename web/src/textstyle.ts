import type { BoardObject } from "./types";

// Text formatting is stored on the object itself (bold, italic, underline, align, size, bullets), so it syncs
// like any other field. One style per object (not per word).
export type Align = "left" | "center" | "right";
type Styled = Pick<BoardObject, "bold" | "italic" | "underline" | "align" | "fs" | "bullets">;

export const fontStyleOf = (o: Styled) => `${o.italic ? "italic " : ""}${o.bold ? "bold" : ""}`.trim() || "normal";
export const decorationOf = (o: Styled) => (o.underline ? "underline" : "");
export const FONT_SIZES = [12, 14, 16, 18, 24, 32, 48];

// With "bullets" on, every non-empty line starts with a bullet (the stored text is not changed).
export const displayText = (o: Styled, text: string) => (o.bullets ? text.split("\n").map((l) => (l.trim() ? `• ${l}` : l)).join("\n") : text);

export const firstLink = (text: string): string | null => {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
};
