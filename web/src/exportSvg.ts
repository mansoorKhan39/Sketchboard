import type { BoardObject, Placeable } from "./types";
import { connectorPoints, contentBounds } from "./geometry";
import { isOverlay } from "./kinds";
import { curvePath, polygonPoints } from "./shapes";
import { decorationOf, displayText } from "./textstyle";
import { layoutRich } from "./richtext";
import { inkFor } from "./constants";

// The board as one SVG picture (it stays sharp at any size, and opens in browsers, Figma, Inkscape ...).
// Text is cut into lines by a simple rule (about 0.55 x font size per letter) because an SVG file cannot measure text.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n: number) => String(Math.round(n * 100) / 100);

export function wrapLines(text: string, width: number, fontSize: number): string[] {
  const perLine = Math.max(1, Math.floor(width / (fontSize * 0.55)));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if (word.length > perLine) {
        if (line) out.push(line);
        for (let i = 0; i < word.length; i += perLine) out.push(word.slice(i, i + perLine));
        line = "";
      } else if (!line) line = word;
      else if ((line + " " + word).length <= perLine) line += " " + word;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

type TextBox = { spans?: BoardObject["spans"]; raw?: string; x: number; y: number; w: number; h: number; text: string; size: number; pad: number; align: "left" | "center" | "right"; middle?: boolean; color: string; style?: BoardObject };
// Same layout as on the board, with a rough width per letter (an SVG file cannot measure text). Each styled piece is a <tspan>.
function richSvg(t: TextBox): string {
  const s = t.style;
  const { lines, height } = layoutRich(t.raw ?? "", t.spans, {
    width: t.w - 2 * t.pad, size: t.size, align: t.align, bullets: s?.bullets, base: { b: s?.bold, i: s?.italic, u: s?.underline },
    measure: (txt, st) => txt.length * t.size * (st.b ? 0.6 : 0.55),
  });
  const startY = t.middle ? t.y + t.h / 2 - height / 2 : t.y + t.pad;
  return lines
    .map((l) =>
      l.segs.length === 0 ? "" :
      `<text y="${num(startY + l.y + t.size * 1.0)}" font-size="${t.size}" fill="${t.color}" xml:space="preserve">` +
      l.segs.map((g) => `<tspan x="${num(t.x + t.pad + g.x)}"${g.b ? ' font-weight="700"' : ""}${g.i ? ' font-style="italic"' : ""}${g.u ? ' text-decoration="underline"' : ""}${g.c ? ` fill="${g.c}"` : ""}>${esc(g.text)}</tspan>`).join("") +
      "</text>",
    )
    .join("");
}

function textSvg(t: TextBox): string {
  if (t.spans?.length && t.raw !== undefined) return richSvg(t);
  if (!t.text.trim()) return "";
  const lines = wrapLines(t.text, t.w - 2 * t.pad, t.size);
  const lh = t.size * 1.25;
  const startY = t.middle ? t.y + t.h / 2 - (lines.length * lh) / 2 : t.y + t.pad;
  const anchor = t.align === "center" ? "middle" : t.align === "right" ? "end" : "start";
  const ax = t.align === "center" ? t.x + t.w / 2 : t.align === "right" ? t.x + t.w - t.pad : t.x + t.pad;
  const s = t.style;
  const attrs = `${s?.bold ? ' font-weight="700"' : ""}${s?.italic ? ' font-style="italic"' : ""}${s && decorationOf(s) ? ' text-decoration="underline"' : ""}`;
  return lines
    .map((l, i) => `<text x="${num(ax)}" y="${num(startY + lh * (i + 0.8))}" font-size="${t.size}" text-anchor="${anchor}" fill="${t.color}"${attrs}>${esc(l)}</text>`)
    .join("");
}

export function objectsToSvg(objects: BoardObject[], theme: "light" | "dark" = "light"): string | null {
  const box = contentBounds(objects);
  if (!box) return null;
  const ink = (c: string) => inkFor(c, theme);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const parts: string[] = [];
  const sorted = [...objects].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  // frames first (they are the background), connectors last
  const order = [...sorted.filter((o) => o.type === "frame"), ...sorted.filter((o) => o.type !== "frame" && o.type !== "connector"), ...sorted.filter((o) => o.type === "connector")];
  for (const o of order) {
    if (isOverlay(o)) continue;
    const g = (inner: string) => `<g transform="translate(${num(o.x)} ${num(o.y)})${o.rotation ? ` rotate(${num(o.rotation)} ${num(o.width / 2)} ${num(o.height / 2)})` : ""}">${inner}</g>`;
    const label = (t: Omit<TextBox, "x" | "y" | "w" | "h" | "style">) => textSvg({ ...t, x: 0, y: 0, w: o.width, h: o.height, style: o });
    if (o.type === "sticky") {
      parts.push(g(`<rect width="${num(o.width)}" height="${num(o.height)}" rx="4" fill="${esc(o.color)}"/>` + label({ spans: o.spans, raw: o.text, text: displayText(o, o.text), size: o.fs || 18, pad: 14, align: o.align ?? "left", color: "#1F2937" })));
    } else if (o.type === "shape") {
      const fill = `fill="${esc(o.fill)}" stroke="${esc(o.stroke)}" stroke-width="${o.strokeWidth}" stroke-linejoin="round"`;
      const poly = polygonPoints(o.kind, o.width, o.height);
      const curve = curvePath(o.kind);
      let body: string;
      if (o.kind === "rect") body = `<rect width="${num(o.width)}" height="${num(o.height)}" rx="6" ${fill}/>`;
      else if (o.kind === "ellipse") body = `<ellipse cx="${num(o.width / 2)}" cy="${num(o.height / 2)}" rx="${num(o.width / 2)}" ry="${num(o.height / 2)}" ${fill}/>`;
      else if (poly) body = `<polygon points="${poly.map(num).join(" ")}" ${fill}/>`;
      else if (curve)
        body = `<g transform="scale(${num(o.width / 100)} ${num(o.height / 100)})"><path d="${curve.body}" ${fill} vector-effect="non-scaling-stroke"/>${curve.detail ? `<path d="${curve.detail}" fill="none" stroke="${esc(o.stroke)}" stroke-width="${o.strokeWidth}" vector-effect="non-scaling-stroke"/>` : ""}</g>`;
      else body = `<rect width="${num(o.width)}" height="${num(o.height)}" ${fill}/>`;
      parts.push(g(body + label({ spans: o.spans, raw: o.text, text: displayText(o, o.text), size: o.fs || 16, pad: 10, align: o.align ?? "center", middle: true, color: "#1F2937" })));
    } else if (o.type === "text") {
      parts.push(g(label({ spans: o.spans, raw: o.text, text: displayText(o, o.text), size: o.fontSize, pad: 0, align: o.align ?? "left", color: ink(o.color) })));
    } else if (o.type === "stroke") {
      const pts: string[] = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) pts.push(`${num(o.points[i])},${num(o.points[i + 1])}`);
      parts.push(g(`<polyline points="${pts.join(" ")}" fill="none" stroke="${ink(o.color)}" stroke-width="${o.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`));
    } else if (o.type === "frame") {
      parts.push(g(`<rect width="${num(o.width)}" height="${num(o.height)}" rx="6" fill="${theme === "dark" ? "#ffffff0d" : "#ffffff99"}" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="6 4"/><text x="0" y="-8" font-size="14" fill="#64748B">${esc(o.text || "Frame")}</text>`));
    } else if (o.type === "table") {
      const rows = o.cells.length, cols = o.cells[0].length, cw = o.width / cols, ch = o.height / rows;
      let s = `<rect width="${num(o.width)}" height="${num(o.height)}" rx="4" fill="#FFFFFF" stroke="#94A3B8" stroke-width="1.5"/>`;
      if (o.header) s += `<rect width="${num(o.width)}" height="${num(ch)}" fill="#EEF2FF"/>`;
      for (let i = 1; i < rows; i++) s += `<line x1="0" y1="${num(i * ch)}" x2="${num(o.width)}" y2="${num(i * ch)}" stroke="#CBD5E1"/>`;
      for (let i = 1; i < cols; i++) s += `<line x1="${num(i * cw)}" y1="0" x2="${num(i * cw)}" y2="${num(o.height)}" stroke="#CBD5E1"/>`;
      o.cells.forEach((row, r) =>
        row.forEach((t, c) => {
          s += textSvg({ x: c * cw, y: r * ch, w: cw, h: ch, text: displayText(o, t), size: o.fs || 15, pad: 6, align: o.align ?? "left", middle: true, color: "#1F2937", style: { ...o, bold: o.bold || (o.header && r === 0) } as BoardObject });
        }),
      );
      parts.push(g(s));
    } else if (o.type === "image") {
      if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(o.src)) parts.push(g(`<image href="${o.src}" width="${num(o.width)}" height="${num(o.height)}" preserveAspectRatio="none"/>`));
    } else if (o.type === "connector") {
      const from = byId.get(o.fromId) as Placeable | undefined, to = byId.get(o.toId) as Placeable | undefined;
      if (!from || !to) continue;
      const p = connectorPoints(o, from, to);
      const dash = o.dash === "dashed" ? ' stroke-dasharray="10 7"' : o.dash === "dotted" ? ' stroke-dasharray="2 6" stroke-linecap="round"' : "";
      const c = ink(o.color);
      parts.push(`<polyline points="${p.map(num).join(" ")}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"${dash}/>`);
      const head = (x: number, y: number, fx: number, fy: number) => {
        const a = Math.atan2(y - fy, x - fx);
        const pt = (d: number, side: number) => `${num(x - 12 * Math.cos(a) + side * 5 * Math.cos(a + d))},${num(y - 12 * Math.sin(a) + side * 5 * Math.sin(a + d))}`;
        return `<polygon points="${num(x)},${num(y)} ${pt(Math.PI / 2, 1)} ${pt(Math.PI / 2, -1)}" fill="${c}"/>`;
      };
      const n = p.length;
      if (o.endArrow) parts.push(head(p[n - 2], p[n - 1], p[n - 4], p[n - 3]));
      if (o.startArrow) parts.push(head(p[0], p[1], p[2], p[3]));
    }
  }
  const bg = theme === "dark" ? "#0e111f" : "#f3f5f9";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(box.x)} ${num(box.y)} ${num(box.width)} ${num(box.height)}" width="${num(box.width)}" height="${num(box.height)}" font-family="Inter, Arial, sans-serif"><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.width)}" height="${num(box.height)}" fill="${bg}"/>${parts.join("")}</svg>`;
}
