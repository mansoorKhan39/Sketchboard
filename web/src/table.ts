// Tables: a grid of text cells. All of these return new arrays (nothing is changed in place), so edits are undoable.
export const MIN_ROW_HEIGHT = 32;
export const MAX_ROWS = 30;
export const MAX_COLS = 12;

export const makeCells = (rows: number, cols: number): string[][] => Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));

export function addRow(cells: string[][], at: number): string[][] {
  if (cells.length >= MAX_ROWS) return cells;
  const i = Math.max(0, Math.min(cells.length, at));
  return [...cells.slice(0, i), Array.from({ length: cells[0]?.length ?? 1 }, () => ""), ...cells.slice(i)];
}
export function removeRow(cells: string[][], at: number): string[][] {
  return cells.length <= 1 ? cells : cells.filter((_, i) => i !== at);
}
export function addCol(cells: string[][], at: number): string[][] {
  if ((cells[0]?.length ?? 0) >= MAX_COLS) return cells;
  return cells.map((r) => [...r.slice(0, at), "", ...r.slice(at)]);
}
export function removeCol(cells: string[][], at: number): string[][] {
  return (cells[0]?.length ?? 0) <= 1 ? cells : cells.map((r) => r.filter((_, i) => i !== at));
}
export function setCell(cells: string[][], r: number, c: number, value: string): string[][] {
  return cells.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row));
}

// Which cell is under a point (given relative to the table's top-left corner)? Null when outside.
export function cellAt(cells: string[][], width: number, height: number, px: number, py: number): { r: number; c: number } | null {
  if (px < 0 || py < 0 || px >= width || py >= height) return null;
  const rows = cells.length, cols = cells[0]?.length ?? 0;
  return { r: Math.min(rows - 1, Math.floor((py / height) * rows)), c: Math.min(cols - 1, Math.floor((px / width) * cols)) };
}

// Next cell for the Tab key (wraps to the next row; null after the last cell).
export function nextCell(cells: string[][], r: number, c: number, back = false): { r: number; c: number } | null {
  const cols = cells[0]?.length ?? 0;
  const n = r * cols + c + (back ? -1 : 1);
  if (n < 0 || n >= cells.length * cols) return null;
  return { r: Math.floor(n / cols), c: n % cols };
}

// A valid table coming from another person or an old file? (sizes and text are limited)
export const validCells = (v: unknown): v is string[][] =>
  Array.isArray(v) && v.length >= 1 && v.length <= MAX_ROWS && v.every((r) => Array.isArray(r) && r.length === v[0].length && r.length >= 1 && r.length <= MAX_COLS && r.every((t) => typeof t === "string" && t.length <= 2000));
