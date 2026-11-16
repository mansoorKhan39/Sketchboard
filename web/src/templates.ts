import { newId } from "./store";
import type { BoardObject, Connector, Shape, ShapeKind, Sticky, TextObj } from "./types";
import { INK_DEFAULT, STICKY_COLORS } from "./constants";

const [YELLOW, ORANGE, PINK, GREEN, BLUE, PURPLE] = STICKY_COLORS;

const sticky = (x: number, y: number, text: string, color = YELLOW): Sticky => ({
  id: newId(), type: "sticky", x, y, width: 180, height: 180, rotation: 0, text, color,
});
const shape = (kind: ShapeKind, x: number, y: number, width: number, height: number, text: string, fill = "#FFFFFF"): Shape => ({
  id: newId(), type: "shape", kind, x, y, width, height, rotation: 0, fill, stroke: INK_DEFAULT, strokeWidth: 2, text,
});
const label = (x: number, y: number, text: string, fontSize = 26, width = 260): TextObj => ({
  id: newId(), type: "text", x, y, width, height: fontSize * 1.3, rotation: 0, text, fontSize, color: INK_DEFAULT,
});
const link = (a: { id: string }, b: { id: string }, lineStyle: Connector["lineStyle"] = "straight"): Connector => ({
  id: newId(), type: "connector", x: 0, y: 0, width: 0, height: 0, rotation: 0,
  fromId: a.id, toId: b.id, lineStyle, endArrow: true, color: INK_DEFAULT,
});

export interface Template {
  id: string;
  name: string;
  description: string;
  build: () => BoardObject[]; // fresh objects (new ids) every time
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank board",
    description: "An empty canvas",
    build: () => [],
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    description: "One idea, six questions",
    build: () => {
      const centre = shape("ellipse", -150, -80, 300, 160, "Our idea", "#EEF2FF");
      return [
        centre,
        sticky(-520, -330, "Who is it for?", YELLOW),
        sticky(-90, -400, "What problem does it solve?", ORANGE),
        sticky(340, -330, "What could go wrong?", PINK),
        sticky(-520, 170, "What do we need?", GREEN),
        sticky(-90, 230, "What is the first step?", BLUE),
        sticky(340, 170, "Any wild ideas?", PURPLE),
      ];
    },
  },
  {
    id: "kanban",
    name: "Kanban",
    description: "To do, doing, done",
    build: () => {
      const col = (x: number, title: string, fill: string) => [
        shape("rect", x, 0, 300, 620, "", fill),
        label(x + 20, 20, title, 24, 260),
      ];
      return [
        ...col(0, "To do", "#EEF2FF"),
        ...col(340, "Doing", "#FFF8DB"),
        ...col(680, "Done", "#E6F8EA"),
        sticky(60, 90, "Write the proposal", YELLOW),
        sticky(60, 300, "Design the logo", PINK),
        sticky(400, 90, "Build the canvas", BLUE),
        sticky(740, 90, "Pick a project name", GREEN),
      ];
    },
  },
  {
    id: "flowchart",
    name: "Flowchart",
    description: "Steps and decisions",
    build: () => {
      const start = shape("ellipse", 0, 0, 180, 90, "Start", "#E6F8EA");
      const step = shape("rect", 280, 0, 200, 90, "Do the work", "#FFFFFF");
      const ask = shape("diamond", 580, -35, 200, 160, "Done?", "#FFF8DB");
      const end = shape("ellipse", 880, 0, 180, 90, "Finish", "#FFE3E3");
      return [start, step, ask, end, link(start, step), link(step, ask), link(ask, end)];
    },
  },
];
