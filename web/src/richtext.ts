// Word-level text formatting. The plain `text` of an object stays the source of truth (search, export, links all use it);
// `spans` say which characters are bold / italic / underlined / coloured. A span covers characters [s, e).
export interface Span {
  s: number;
  e: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  c?: string; // "#RRGGBB"
}
export interface CharStyle {
  b: boolean;
  i: boolean;
  u: boolean;
  c: string; // "" = the default colour
}
export const MAX_SPANS = 300;
const HEX = /^#[0-9a-fA-F]{6}$/;
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

// For incoming data (other people's edits are never trusted).
export function validSpans(v: unknown): v is Span[] {
  if (!Array.isArray(v) || v.length > MAX_SPANS) return false;
  return v.every((x) => {
    if (typeof x !== "object" || x === null) return false;
    const r = x as Record<string, unknown>;
    return (
      isInt(r.s) && isInt(r.e) && r.s >= 0 && r.e > r.s && r.e <= 100_000 &&
      (["b", "i", "u"] as const).every((k) => r[k] === undefined || typeof r[k] === "boolean") &&
      (r.c === undefined || (typeof r.c === "string" && HEX.test(r.c)))
    );
  });
}

const plain = (): CharStyle => ({ b: false, i: false, u: false, c: "" });
const same = (a: CharStyle, b: CharStyle) => a.b === b.b && a.i === b.i && a.u === b.u && a.c === b.c;
const isPlain = (a: CharStyle) => !a.b && !a.i && !a.u && !a.c;

// One style per character. Later spans win over earlier ones; `base` (whole-object bold/italic/underline) is added on top.
export function charStyles(length: number, spans: Span[] | undefined, base?: { b?: boolean; i?: boolean; u?: boolean }): CharStyle[] {
  const out: CharStyle[] = Array.from({ length }, plain);
  for (const sp of spans ?? []) {
    for (let k = Math.max(0, sp.s); k < Math.min(length, sp.e); k++) {
      const c = out[k];
      if (sp.b !== undefined) c.b = sp.b;
      if (sp.i !== undefined) c.i = sp.i;
      if (sp.u !== undefined) c.u = sp.u;
      if (sp.c !== undefined) c.c = sp.c;
    }
  }
  if (base) for (const c of out) { c.b = c.b || !!base.b; c.i = c.i || !!base.i; c.u = c.u || !!base.u; }
  return out;
}

// The shortest list of spans for a style-per-character list. Plain stretches get no span.
export function spansFromStyles(styles: CharStyle[]): Span[] {
  const out: Span[] = [];
  let k = 0;
  while (k < styles.length) {
    let j = k + 1;
    while (j < styles.length && same(styles[j], styles[k])) j++;
    const st = styles[k];
    if (!isPlain(st)) {
      const sp: Span = { s: k, e: j };
      if (st.b) sp.b = true;
      if (st.i) sp.i = true;
      if (st.u) sp.u = true;
      if (st.c) sp.c = st.c;
      out.push(sp);
    }
    k = j;
  }
  return out.slice(0, MAX_SPANS);
}

export const sameSpans = (a: Span[] | undefined, b: Span[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

// ---------- laying text out ----------
export interface Seg {
  text: string;
  x: number;
  b: boolean;
  i: boolean;
  u: boolean;
  c: string;
}
export interface Line {
  y: number;
  w: number; // width of the text on this line
  segs: Seg[];
}
export type Measure = (text: string, style: { b: boolean; i: boolean }) => number;

export interface LayoutOptions {
  width: number; // room for text (box width minus padding on both sides)
  size: number;
  lineHeight?: number;
  align?: "left" | "center" | "right";
  bullets?: boolean;
  base?: { b?: boolean; i?: boolean; u?: boolean };
  measure: Measure;
}

// Cuts styled text into lines (words are never split unless one word is wider than the line) and positions every styled piece.
export function layoutRich(text: string, spans: Span[] | undefined, o: LayoutOptions): { lines: Line[]; height: number } {
  const styles = charStyles(text.length, spans, o.base);
  const lh = o.size * (o.lineHeight ?? 1.25);
  const maxW = Math.max(1, o.width);
  const lines: Line[] = [];

  // a run of characters [a, b) as pieces of equal style, with their widths
  const pieces = (a: number, b: number): { text: string; st: CharStyle; w: number }[] => {
    const out: { text: string; st: CharStyle; w: number }[] = [];
    let k = a;
    while (k < b) {
      let j = k + 1;
      while (j < b && same(styles[j], styles[k])) j++;
      const t = text.slice(k, j);
      out.push({ text: t, st: styles[k], w: o.measure(t, styles[k]) });
      k = j;
    }
    return out;
  };
  const widthOf = (a: number, b: number) => pieces(a, b).reduce((n, p) => n + p.w, 0);

  const push = (ranges: [number, number][], bullet: boolean) => {
    // ranges are [from, to) of the text; trailing spaces are dropped so centring and right-align look right
    const segs: Seg[] = [];
    let x = 0;
    if (bullet) {
      const w = o.measure("• ", { b: false, i: false });
      segs.push({ text: "• ", x: 0, b: false, i: false, u: false, c: "" });
      x = w;
    }
    ranges.forEach(([a, b0], idx) => {
      let b = b0;
      if (idx === ranges.length - 1) while (b > a && /\s/.test(text[b - 1])) b--; // only the end of the line loses its spaces
      for (const p of pieces(a, b)) {
        const last = segs[segs.length - 1];
        if (last && !(bullet && segs.length === 1) && last.b === p.st.b && last.i === p.st.i && last.u === p.st.u && last.c === p.st.c) last.text += p.text; // same style: one piece
        else segs.push({ text: p.text, x, b: p.st.b, i: p.st.i, u: p.st.u, c: p.st.c });
        x += p.w;
      }
    });
    const shift = o.align === "center" ? (maxW - x) / 2 : o.align === "right" ? maxW - x : 0;
    for (const s of segs) s.x += Math.max(0, shift);
    lines.push({ y: lines.length * lh, w: x, segs });
  };

  let offset = 0;
  for (const para of text.split("\n")) {
    const end = offset + para.length;
    const bullet = !!o.bullets && para.trim() !== "";
    const indent = bullet ? o.measure("• ", { b: false, i: false }) : 0;
    const room = Math.max(1, maxW - indent);
    if (para === "") {
      lines.push({ y: lines.length * lh, w: 0, segs: [] });
    } else {
      // words and the spaces between them
      const tokens: [number, number][] = [];
      for (const m of para.matchAll(/\s+|\S+/g)) tokens.push([offset + m.index!, offset + m.index! + m[0].length]);
      let row: [number, number][] = [];
      let rowW = 0;
      let first = true;
      const flush = () => {
        push(row, bullet && first);
        first = false;
        row = [];
        rowW = 0;
      };
      for (const [a, b] of tokens) {
        const isSpace = /\s/.test(text[a]);
        if (isSpace && row.length === 0 && !first) continue; // no spaces at the start of a wrapped line
        const w = widthOf(a, b);
        if (!isSpace && rowW + w > room && row.length > 0) flush();
        if (!isSpace && w > room) {
          // one very long word: break it by characters
          let from = a;
          while (from < b) {
            let to = from + 1;
            while (to < b && widthOf(from, to + 1) <= room) to++;
            row.push([from, to]);
            rowW = widthOf(from, to);
            from = to;
            if (from < b) flush();
          }
          continue;
        }
        row.push([a, b]);
        rowW += w;
      }
      if (row.length) flush();
    }
    offset = end + 1; // the "\n"
  }
  return { lines, height: lines.length * lh };
}
