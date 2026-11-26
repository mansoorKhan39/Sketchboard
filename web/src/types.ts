// Object model — mirrors the Database Design document (shared fields + one shape per type).
export type Tool = "select" | "sticky" | "shape" | "pen" | "text" | "connector" | "frame" | "comment" | "hand" | "table";
export type ShapeKind = "rect" | "ellipse" | "diamond" | "triangle" | "hexagon" | "star" | "arrow" | "speech" | "cloud" | "cylinder";

import type { Span } from "./richtext";

interface Base {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z?: number; // layer: higher is drawn on top (missing = 0)
  locked?: boolean; // cannot be moved, edited or deleted until unlocked
  group?: string; // objects with the same group id move and select together ("" = no group)
  bold?: boolean; // text formatting (sticky, shape, text): one style for the whole object
  italic?: boolean;
  underline?: boolean;
  bullets?: boolean; // every line starts with a bullet
  align?: "left" | "center" | "right";
  spans?: Span[]; // word-level formatting (bold/italic/underline/colour) over `text`; sticky, shape, text
  fs?: number; // font size (sticky, shape, table); 0 or missing = default. Text objects use fontSize
}

export interface Sticky extends Base {
  type: "sticky";
  text: string;
  color: string;
  by?: string; // who made it (user id or guest id) — used by private mode
}

export interface Shape extends Base {
  type: "shape";
  kind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  text: string;
}

export interface Stroke extends Base {
  type: "stroke";
  points: number[]; // flat [x1,y1,x2,y2...] relative to (x,y)
  color: string;
  lineWidth: number;
}

export interface TextObj extends Base {
  type: "text";
  text: string;
  fontSize: number;
  color: string;
}

// A picture. `src` is a small compressed data URL, so the image travels inside the board like any other object.
export interface ImageObj extends Base {
  type: "image";
  src: string;
  name: string;
}

// A frame is a titled area (a "slide"). Presentation mode shows frames one by one, ordered by `slide`.
export interface FrameObj extends Base {
  type: "frame";
  text: string; // the title
  slide: number;
}

export interface CommentMessage {
  id: string;
  author: string;
  text: string;
  at: number; // time sent (ms since 1970)
}

// A comment pin. (x, y) is the pin's tip; width/height are 0. It is drawn as HTML, not on the Konva canvas.
export interface CommentObj extends Base {
  type: "comment";
  thread: CommentMessage[];
  resolved: boolean;
}

// A vote (a dot on an object). One object per vote, so two people voting at once never overwrite each other.
export interface VoteObj extends Base {
  type: "vote";
  targetId: string;
  voter: string; // user id, or a guest id kept in the browser
}

// The board's countdown timer. endsAt is a clock time while running; `left` is the seconds left while stopped.
export interface TimerObj extends Base {
  type: "timer";
  seconds: number; // chosen length
  endsAt: number | null;
  left: number;
}

// A floating emoji. Lives a few seconds, then it is removed.
export interface ReactionObj extends Base {
  type: "reaction";
  emoji: string;
  at: number;
}

// Board-wide switches. For now: private mode, which hides other people's sticky notes on screen.
export interface SettingsObj extends Base {
  type: "settings";
  private: boolean;
}

// A connector links two objects. x/y/width/height are unused (0) — its line is computed from the two objects.
export interface Connector extends Base {
  type: "connector";
  fromId: string;
  toId: string;
  lineStyle: "straight" | "elbow";
  endArrow: boolean;
  startArrow?: boolean;
  dash?: "solid" | "dashed" | "dotted";
  color: string;
}

// A table: rows x columns of equal cells inside the object's box. cells[row][column] is the text.
export interface TableObj extends Base {
  type: "table";
  cells: string[][];
  header: boolean; // first row is a header (tinted, bold)
}

export type BoardObject = TableObj | Sticky | Shape | Stroke | TextObj | ImageObj | FrameObj | CommentObj | VoteObj | TimerObj | ReactionObj | SettingsObj | Connector;
export type Placeable = Exclude<BoardObject, Connector | CommentObj | VoteObj | TimerObj | ReactionObj | SettingsObj>; // everything that has a real position on the board

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
