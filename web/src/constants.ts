export const STICKY_COLORS = ["#FFD43B", "#FFA94D", "#F783AC", "#69DB7C", "#74C0FC", "#B197FC"];
export const SHAPE_FILLS = ["#FFFFFF", "#EEF2FF", "#FFF3BF", "#D3F9D8", "#FFE3E3", "#E5DBFF"];
export const INK_COLORS = ["#1F2937", "#E03131", "#2F9E44", "#1971C2", "#F08C00", "#7048E8"];
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;
export const BRAND = "#4F46E5";

// The default ink colour is near-black. On the dark canvas it would vanish, so we draw it light instead.
// (The stored value never changes — only what is painted.)
export const INK_DEFAULT = "#1F2937";
export const inkFor = (color: string, theme: "light" | "dark") =>
  theme === "dark" && color.toLowerCase() === INK_DEFAULT.toLowerCase() ? "#E8EAF3" : color;
