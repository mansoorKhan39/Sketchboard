import { charStyles, spansFromStyles, type CharStyle, type Span } from "./richtext";

// The browser side of word-level formatting: turn (text + spans) into editable HTML, and read the HTML back after typing.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function richToHtml(text: string, spans: Span[] | undefined, base?: { b?: boolean; i?: boolean; u?: boolean }): string {
  const st = charStyles(text.length, spans, base);
  let html = "";
  let k = 0;
  while (k < text.length) {
    let j = k + 1;
    while (j < text.length && st[j].b === st[k].b && st[j].i === st[k].i && st[j].u === st[k].u && st[j].c === st[k].c) j++;
    const s = st[k];
    const css = `${s.b ? "font-weight:700;" : ""}${s.i ? "font-style:italic;" : ""}${s.u ? "text-decoration:underline;" : ""}${s.c ? `color:${s.c};` : ""}`;
    const inner = esc(text.slice(k, j)).replace(/\n/g, "<br>");
    html += css ? `<span style="${css}">${inner}</span>` : inner;
    k = j;
  }
  return text.endsWith("\n") ? html + "<br>" : html; // a final empty line needs a <br> to be visible
}

const hex = (rgb: string): string => {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("") : "";
};

// Reads what is typed in the editor: the plain text and the style of every character.
export function domToRich(root: HTMLElement): { text: string; spans: Span[] } {
  const baseColor = hex(getComputedStyle(root).color);
  let text = "";
  const styles: CharStyle[] = [];
  const add = (s: string, st: CharStyle) => {
    for (const ch of s) {
      for (let n = 0; n < ch.length; n++) styles.push({ ...st });
      text += ch;
    }
  };
  const plain: CharStyle = { b: false, i: false, u: false, c: "" };
  const styleOf = (el: Element | null): CharStyle => {
    if (!el) return plain;
    const cs = getComputedStyle(el);
    let u = false;
    for (let p: Element | null = el; p && p !== root.parentElement; p = p.parentElement) {
      if (getComputedStyle(p).textDecorationLine.includes("underline")) u = true;
      if (p === root) break;
    }
    const w = cs.fontWeight;
    const c = hex(cs.color);
    return { b: w === "bold" || Number(w) >= 600, i: cs.fontStyle === "italic", u, c: c && c !== baseColor ? c : "" };
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === Node.TEXT_NODE) add((ch as Text).data.replace(/\r/g, ""), styleOf(ch.parentElement));
      else if (ch.nodeName === "BR") add("\n", plain);
      else if (ch.nodeType === Node.ELEMENT_NODE) {
        const blockish = ch.nodeName === "DIV" || ch.nodeName === "P";
        if (blockish && text.length > 0 && !text.endsWith("\n")) add("\n", plain);
        walk(ch);
      }
    });
  };
  walk(root);
  // the placeholder <br> the browser keeps at the very end is not a real line break
  if (root.lastChild?.nodeName === "BR" && text.endsWith("\n")) {
    text = text.slice(0, -1);
    styles.pop();
  }
  return { text, spans: spansFromStyles(styles) };
}

// Format the selected words in the editor that is open right now.
export type RichCommand = "bold" | "italic" | "underline";
export const richCommand = (cmd: RichCommand) => document.execCommand(cmd);
export const richColor = (color: string) => document.execCommand("foreColor", false, color);
export const richState = (cmd: RichCommand) => {
  try {
    return document.queryCommandState(cmd);
  } catch {
    return false;
  }
};
export const RICH_TYPES = ["sticky", "shape", "text"] as const;
