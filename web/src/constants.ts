export const STICKY_COLORS = ["#FFD43B", "#FFA94D", "#F783AC", "#69DB7C", "#74C0FC", "#B197FC"];
export const SHAPE_FILLS = ["#FFFFFF", "#EEF2FF", "#FFF3BF", "#D3F9D8", "#FFE3E3", "#E5DBFF"];
export const INK_COLORS = ["#1F2937", "#E03131", "#2F9E44", "#1971C2", "#F08C00", "#7048E8"];
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;
export const BRAND = "#4F46E5";

// The default ink colour is near-black. On the dark canvas it would vanish, so we draw it light instead.
// (The stored value never changes — only what is painted.)
export const INK_DEFAULT = "#1F2937";
export const inkFor = (color: string, theme: "light" | "dark") =>
  theme === "dark" && color.toLowerCase() === INK_DEFAULT.toLowerCase() ? "#E8EAF3" : color;

// Mix a #rrggbb colour towards another one (t = 0 keeps `a`, t = 1 gives `b`). Used for paper shading.
export const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(a.length === 7 ? a : "#FFD43B");
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
};
