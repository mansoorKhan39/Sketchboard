// Object model — mirrors the Database Design document (shared fields + one shape per type).
export type Tool = "select" | "sticky" | "shape" | "pen" | "text" | "connector";
export type ShapeKind = "rect" | "ellipse" | "diamond";

interface Base {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface Sticky extends Base {
  type: "sticky";
  text: string;
  color: string;
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

// A connector links two objects. x/y/width/height are unused (0) — its line is computed from the two objects.
export interface Connector extends Base {
  type: "connector";
  fromId: string;
  toId: string;
  lineStyle: "straight" | "elbow";
  endArrow: boolean;
  color: string;
}

export type BoardObject = Sticky | Shape | Stroke | TextObj | Connector;
export type Placeable = Exclude<BoardObject, Connector>; // everything that has a real position on the board

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
