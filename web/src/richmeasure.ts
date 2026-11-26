import type { Measure } from "./richtext";

// Measures text in the same font the board draws with (Inter), using an off-screen canvas.
let ctx: CanvasRenderingContext2D | null | undefined;
export const measureFor = (size: number): Measure => (text, s) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * size * 0.55;
  ctx.font = `${s.i ? "italic " : ""}${s.b ? "700" : "400"} ${size}px Inter, sans-serif`;
  return ctx.measureText(text).width;
};
