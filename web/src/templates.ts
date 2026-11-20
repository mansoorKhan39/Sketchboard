import { newId } from "./store";
import type { BoardObject, Connector, FrameObj, Shape, ShapeKind, Sticky, TextObj } from "./types";
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

const frame = (slide: number, x: number, y: number, title: string): FrameObj => ({
  id: newId(), type: "frame", x, y, width: 640, height: 360, rotation: 0, text: title, slide,
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
  {
    id: "mindmap",
    name: "Mind map",
    description: "A topic with branches (Tab adds a child)",
    build: () => {
      const centre = shape("ellipse", -120, -60, 240, 120, "Main topic", "#EEF2FF");
      const branch = (x: number, y: number, text: string, color: string) => sticky(x, y, text, color);
      const a = branch(260, -330, "Branch one", YELLOW);
      const b = branch(260, -90, "Branch two", GREEN);
      const c = branch(-440, -90, "Branch three", PINK);
      const d = branch(-90, 220, "Branch four", BLUE);
      const a1 = branch(560, -400, "Detail", YELLOW);
      const a2 = branch(560, -190, "Detail", YELLOW);
      return [centre, a, b, c, d, a1, a2, link(centre, a), link(centre, b), link(centre, c), link(centre, d), link(a, a1), link(a, a2)].map((o) =>
        o.type === "connector" ? { ...o, endArrow: false } : o,
      );
    },
  },
  {
    id: "swot",
    name: "SWOT analysis",
    description: "Strengths, weaknesses, opportunities, threats",
    build: () => {
      const quad = (x: number, y: number, title: string, fill: string) => [shape("rect", x, y, 420, 320, "", fill), label(x + 20, y + 16, title, 24, 380)];
      return [
        ...quad(0, 0, "Strengths", "#E6F8EA"), ...quad(440, 0, "Weaknesses", "#FFE3E3"),
        ...quad(0, 340, "Opportunities", "#EEF2FF"), ...quad(440, 340, "Threats", "#FFF8DB"),
        sticky(30, 70, "What do we do well?", GREEN), sticky(470, 70, "What could be better?", PINK),
        sticky(30, 410, "What chances are coming?", BLUE), sticky(470, 410, "What could hurt us?", YELLOW),
      ];
    },
  },
  {
    id: "retro",
    name: "Retrospective",
    description: "Went well, to improve, actions",
    build: () => {
      const col = (x: number, title: string, fill: string) => [shape("rect", x, 0, 320, 600, "", fill), label(x + 20, 20, title, 24, 280)];
      return [
        ...col(0, "Went well", "#E6F8EA"), ...col(360, "To improve", "#FFE3E3"), ...col(720, "Action items", "#EEF2FF"),
        sticky(70, 90, "We shipped on time", GREEN), sticky(430, 90, "Too many meetings", PINK), sticky(790, 90, "Write a clear plan", BLUE),
      ];
    },
  },
  {
    id: "planner",
    name: "Weekly planner",
    description: "Monday to Friday",
    build: () => {
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      return [
        ...days.flatMap((d, i) => [shape("rect", i * 280, 0, 260, 560, "", i % 2 ? "#F8FAFC" : "#EEF2FF"), label(i * 280 + 20, 20, d, 22, 220)]),
        sticky(20, 80, "Plan the week", YELLOW),
      ];
    },
  },
  {
    id: "presentation",
    name: "Presentation",
    description: "Three frames, ready for Present",
    build: () => [
      frame(1, 0, 0, "Title"), frame(2, 740, 0, "Main idea"), frame(3, 1480, 0, "Next steps"),
      label(40, 140, "Your title here", 48, 560), label(780, 60, "Say it in one sentence", 32, 560), label(1520, 60, "What happens next?", 32, 560),
    ],
  },
];
