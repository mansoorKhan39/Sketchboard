import { isOverlay } from "../kinds";
import { voterId } from "../extras";
import { useAuth } from "../auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Line, Rect, Transformer } from "react-konva";
import type Konva from "konva";
import { useBoard, newId } from "../store";
import type { BoardObject, Connector, Placeable, ShapeKind, Stroke } from "../types";
import { INK_COLORS, SHAPE_FILLS, STICKY_COLORS, inkFor } from "../constants";
import { useUI } from "../ui";
import { sendCursor } from "../realtime/connection";
import ObjectNode from "./ObjectNode";
import ConnectorNode from "./ConnectorNode";
import { centerOf } from "../geometry";
import TextEditor from "./TextEditor";
import { placeImages, toWorld } from "../image";
import { registerStage } from "../exportPng";
import { panNow, stopMotion, wheelZoom } from "../navigation";
import { edgePanSpeed, pinchStep, wheelIntent } from "../viewport";
import { expandGroups, sortByZ } from "../arrange";

export const lastShapeKind: { current: ShapeKind } = { current: "rect" };

function useWindowSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

export default function Canvas({ spaceDown }: { spaceDown: boolean }) {
  const { w, h } = useWindowSize();
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const objects = useBoard((s) => s.objects);
  const guides = useUI((s) => s.guides);
  const ordered = useMemo(() => sortByZ(objects), [objects]); // drawing order follows the layer (z) of each object
  const selectedIds = useBoard((s) => s.selectedIds);
  const tool = useBoard((s) => s.tool);
  const viewport = useBoard((s) => s.viewport);
  const editingId = useBoard((s) => s.editingId);
  const canEdit = useBoard((s) => s.role !== "viewer");
  const { select, addObject, updateObjects, setTool, setEditing } = useBoard.getState();

  const theme = useUI((s) => s.theme);
  const wheelMode = useUI((s) => s.wheelMode);
  const boxRef = useRef<HTMLDivElement>(null);
  // moving the view with the hand: Space held, the Hand tool, or the middle mouse button (and one finger on a touch screen)
  const panMode = spaceDown || tool === "hand";
  const panRef = useRef<{ x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [draft, setDraft] = useState<number[] | null>(null); // pen stroke being drawn (world coords)
  const drawing = useRef(false);
  // marquee (drag-select box) and connector being dragged — refs hold the truth, state triggers redraw
  const marqueeRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const linkRef = useRef<{ fromId: string; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [link, setLink] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Attach the resize/rotate handles to the selected nodes.
  useEffect(() => {
    const stage = stageRef.current;
    const tr = trRef.current;
    if (!stage || !tr) return;
    const nodes = editingId || !canEdit ? [] : selectedIds.filter((id) => !objects.find((o) => o.id === id)?.locked).map((id) => stage.findOne("#" + id)).filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, objects, editingId, canEdit]);

  // Let the Export button find the stage.
  useEffect(() => {
    registerStage(stageRef.current, trRef.current);
    return () => registerStage(null, null);
  }, []);

  // Pictures keep their shape when resized.
  const onlyImages = selectedIds.length > 0 && selectedIds.every((id) => objects.find((o) => o.id === id)?.type === "image");

  const world = () => stageRef.current!.getRelativePointerPosition()!;

  // Walk up from a clicked Konva shape to the Group that represents a board object (not a stroke/connector).
  const objectIdAt = (node: Konva.Node | null | undefined): string | null => {
    const stage = stageRef.current;
    while (node && node !== stage) {
      const id = node.id();
      if (id && objects.some((o) => o.id === id && o.type !== "connector" && o.type !== "stroke")) return id;
      node = node.getParent();
    }
    return null;
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const p = stageRef.current!.getPointerPosition()!;
    const intent = wheelIntent(e.evt, wheelMode);
    if (intent.kind === "zoom") wheelZoom(intent.factor, p.x, p.y);
    else panNow(intent.dx, intent.dy);
  };

  // Drag the view around. Listens on the window so it keeps working when the pointer leaves the canvas.
  const startPan = (x: number, y: number) => {
    stopMotion();
    panRef.current = { x, y };
    setPanning(true);
    const move = (ev: MouseEvent | TouchEvent) => {
      const pt = "touches" in ev ? ev.touches[0] : ev;
      const last = panRef.current;
      if (!pt || !last) return;
      panNow(pt.clientX - last.x, pt.clientY - last.y);
      panRef.current = { x: pt.clientX, y: pt.clientY };
    };
    const end = () => {
      panRef.current = null;
      setPanning(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
  };

  // Browser-level things that must be switched off on the board: page zoom with Ctrl+wheel, and two fingers
  // pinching the whole page. Two fingers on the board zoom and move the board instead.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const noScroll = (e: WheelEvent) => e.preventDefault();
    let last: { cx: number; cy: number; dist: number } | null = null;
    const info = (t: TouchList) => {
      const a = t[0], b = t[1];
      return { cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      last = info(e.touches);
      // the first finger may have started something (a pen line, a selection box, a pan): drop it
      stopMotion();
      panRef.current = null;
      drawing.current = false;
      setDraft(null);
      marqueeRef.current = null;
      setMarquee(null);
      linkRef.current = null;
      setLink(null);
    };
    const move = (e: TouchEvent) => {
      if (!last || e.touches.length !== 2) return;
      e.preventDefault();
      const now = info(e.touches);
      const st = useBoard.getState();
      st.setViewport(pinchStep(st.viewport, last, now));
      last = now;
    };
    const end = (e: TouchEvent) => {
      if (e.touches.length < 2) last = null;
    };
    box.addEventListener("wheel", noScroll, { passive: false });
    box.addEventListener("touchstart", start, { passive: false });
    box.addEventListener("touchmove", move, { passive: false });
    box.addEventListener("touchend", end);
    box.addEventListener("touchcancel", end);
    return () => {
      box.removeEventListener("wheel", noScroll);
      box.removeEventListener("touchstart", start);
      box.removeEventListener("touchmove", move);
      box.removeEventListener("touchend", end);
      box.removeEventListener("touchcancel", end);
    };
  }, []);

  // Dragging a selection box or a connector close to the edge of the screen slides the board that way.
  const dragging = !!marquee || !!link;
  useEffect(() => {
    if (!dragging) return;
    let id = 0;
    const tick = () => {
      const p = stageRef.current?.getPointerPosition();
      if (p) {
        const dx = edgePanSpeed(p.x, window.innerWidth), dy = edgePanSpeed(p.y, window.innerHeight);
        if (dx || dy) {
          panNow(dx, dy);
          const v = useBoard.getState().viewport;
          const x = (p.x - v.x) / v.scale, y = (p.y - v.y) / v.scale;
          if (marqueeRef.current) {
            marqueeRef.current = { ...marqueeRef.current, x2: x, y2: y };
            setMarquee(marqueeRef.current);
          }
          if (linkRef.current) {
            linkRef.current = { ...linkRef.current, x2: x, y2: y };
            setLink(linkRef.current);
          }
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [dragging]);

  const onStageDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const touch = "touches" in e.evt;
    if (touch && (e.evt as TouchEvent).touches.length > 1) return; // two fingers: the pinch code above handles it
    const onEmpty = e.target === e.target.getStage();
    const mouse = e.evt as MouseEvent;
    if ((!touch && (mouse.button === 1 || (mouse.button === 0 && panMode))) || (touch && onEmpty && (tool === "select" || panMode))) {
      e.evt.preventDefault(); // (the middle button would otherwise start the browser's scroll circle)
      const pt = touch ? (e.evt as TouchEvent).touches[0] : mouse;
      return startPan(pt.clientX, pt.clientY);
    }
    if (panMode || editingId) return;
    const { x, y } = world();

    if (tool === "select") {
      if (onEmpty) {
        select([]);
        marqueeRef.current = { x1: x, y1: y, x2: x, y2: y };
        setMarquee(marqueeRef.current);
      }
      return;
    }
    if (tool === "connector") {
      const id = objectIdAt(e.target);
      const from = objects.find((o) => o.id === id) as Placeable | undefined;
      if (from) {
        const c = centerOf(from);
        linkRef.current = { fromId: from.id, x1: c.x, y1: c.y, x2: x, y2: y };
        setLink(linkRef.current);
      }
      return;
    }
    if (tool === "pen") {
      drawing.current = true;
      setDraft([x, y]);
      return;
    }
    if (tool === "sticky") {
      const o: BoardObject = {
        id: newId(), type: "sticky", x: x - 90, y: y - 90, width: 180, height: 180, rotation: 0,
        text: "", color: STICKY_COLORS[0], by: voterId(useAuth.getState().user?.id),
      };
      addObject(o);
      setTool("select");
      setEditing(o.id);
    } else if (tool === "shape") {
      const o: BoardObject = {
        id: newId(), type: "shape", kind: lastShapeKind.current, x: x - 80, y: y - 60, width: 160, height: 120,
        rotation: 0, fill: SHAPE_FILLS[0], stroke: INK_COLORS[0], strokeWidth: 2, text: "",
      };
      addObject(o);
      setTool("select");
    } else if (tool === "comment") {
      const o: BoardObject = { id: newId(), type: "comment", x, y, width: 0, height: 0, rotation: 0, thread: [], resolved: false };
      addObject(o);
      setTool("select");
      useBoard.getState().setCommentId(o.id);
    } else if (tool === "frame") {
      const n = objects.reduce((m, o) => (o.type === "frame" ? Math.max(m, o.slide) : m), 0) + 1;
      const o: BoardObject = {
        id: newId(), type: "frame", x: x - 320, y: y - 180, width: 640, height: 360, rotation: 0,
        text: `Frame ${n}`, slide: n,
      };
      addObject(o);
      setTool("select");
      select([o.id]);
    } else if (tool === "text") {
      const o: BoardObject = {
        id: newId(), type: "text", x, y, width: 200, height: 32, rotation: 0,
        text: "", fontSize: 24, color: INK_COLORS[0],
      };
      addObject(o);
      setTool("select");
      setEditing(o.id);
    }
  };

  const onStageMove = () => {
    const pos = stageRef.current?.getRelativePointerPosition();
    if (pos) sendCursor(pos.x, pos.y); // let other people see where my pointer is (throttled inside)
    if (!drawing.current && !marqueeRef.current && !linkRef.current) return;
    const { x, y } = world();
    if (drawing.current) setDraft((d) => (d ? [...d, x, y] : d));
    if (marqueeRef.current) {
      marqueeRef.current = { ...marqueeRef.current, x2: x, y2: y };
      setMarquee(marqueeRef.current);
    }
    if (linkRef.current) {
      linkRef.current = { ...linkRef.current, x2: x, y2: y };
      setLink(linkRef.current);
    }
  };

  const finishMarquee = () => {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m) return;
    const left = Math.min(m.x1, m.x2), right = Math.max(m.x1, m.x2);
    const top = Math.min(m.y1, m.y2), bottom = Math.max(m.y1, m.y2);
    if (right - left < 3 && bottom - top < 3) return; // a plain click, not a drag
    // a frame is only picked when the box wraps all of it; otherwise it would be grabbed every time you select inside it
    const hit = objects.filter((o) =>
      o.type === "connector" || isOverlay(o)
        ? false
        : o.type === "frame"
          ? o.x >= left && o.x + o.width <= right && o.y >= top && o.y + o.height <= bottom
          : o.x < right && o.x + o.width > left && o.y < bottom && o.y + o.height > top,
    );
    select(expandGroups(objects, hit.map((o) => o.id)));
  };

  const finishLink = () => {
    const l = linkRef.current;
    linkRef.current = null;
    setLink(null);
    if (!l) return;
    const stage = stageRef.current!;
    const toId = objectIdAt(stage.getIntersection(stage.getPointerPosition()!));
    const exists = objects.some(
      (o) => o.type === "connector" && ((o.fromId === l.fromId && o.toId === toId) || (o.fromId === toId && o.toId === l.fromId)),
    );
    if (!toId || toId === l.fromId || exists) return;
    const c: Connector = {
      id: newId(), type: "connector", x: 0, y: 0, width: 0, height: 0, rotation: 0,
      fromId: l.fromId, toId, lineStyle: "straight", endArrow: true, color: INK_COLORS[0],
    };
    addObject(c);
  };

  const onStageUp = () => {
    finishMarquee();
    finishLink();
    if (!drawing.current) return;
    drawing.current = false;
    if (draft && draft.length >= 4) {
      // store points relative to the top-left of the stroke so it can move like any other object
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < draft.length; i += 2) {
        minX = Math.min(minX, draft[i]); maxX = Math.max(maxX, draft[i]);
        minY = Math.min(minY, draft[i + 1]); maxY = Math.max(maxY, draft[i + 1]);
      }
      const points = draft.map((v, i) => (i % 2 === 0 ? v - minX : v - minY));
      const o: Stroke = {
        id: newId(), type: "stroke", x: minX, y: minY, width: maxX - minX, height: maxY - minY,
        rotation: 0, points, color: INK_COLORS[0], lineWidth: 3,
      };
      addObject(o);
    }
    setDraft(null);
  };

  // After resize/rotate: Konva changes scaleX/scaleY — we convert that into real width/height and reset the scale.
  const onTransformEnd = () => {
    const patches: Record<string, Partial<BoardObject>> = {};
    for (const node of trRef.current!.nodes()) {
      const obj = objects.find((o) => o.id === node.id());
      if (!obj) continue;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const base = { x: node.x(), y: node.y(), rotation: node.rotation() };
      if (obj.type === "stroke") {
        const points = obj.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
        patches[obj.id] = { ...base, points, width: obj.width * sx, height: obj.height * sy };
      } else {
        patches[obj.id] = {
          ...base,
          width: Math.max(30, obj.width * sx),
          height: obj.type === "text" ? obj.height : Math.max(30, obj.height * sy),
        };
      }
    }
    updateObjects(patches);
  };

  const cursor = panning ? "grabbing" : panMode ? "grab" : tool === "select" ? "default" : tool === "pen" ? "crosshair" : "copy";

  return (
    <div
      ref={boxRef}
      style={{ cursor, touchAction: "none" }}
      onDragOver={(e) => {
        if (canEdit && e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!canEdit || !e.dataTransfer.files.length) return;
        e.preventDefault();
        const p = toWorld(e.clientX, e.clientY);
        void placeImages([...e.dataTransfer.files], p.x, p.y);
      }}
    >
      <Stage
        ref={stageRef}
        width={w}
        height={h}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        onWheel={onWheel}
        onMouseDown={onStageDown}
        onTouchStart={onStageDown}
        onMouseMove={onStageMove}
        onTouchMove={onStageMove}
        onMouseUp={onStageUp}
        onTouchEnd={onStageUp}
      >
        <Layer>
          {ordered.map((o) => (o.type === "frame" ? <ObjectNode key={o.id} obj={o} draggable={tool === "select" && !panMode && canEdit} /> : null))}
          {objects.map((o) => (o.type === "connector" ? <ConnectorNode key={o.id} conn={o} /> : null))}
          {ordered.map((o) =>
            o.type === "connector" || o.type === "frame" || isOverlay(o) ? null : <ObjectNode key={o.id} obj={o} draggable={tool === "select" && !panMode && canEdit} />,
          )}
          {guides.map((g, i) => (
            <Line
              key={i}
              points={g.axis === "x" ? [g.pos, g.from, g.pos, g.to] : [g.from, g.pos, g.to, g.pos]}
              stroke="#F43F5E"
              strokeWidth={1 / viewport.scale}
              dash={[4 / viewport.scale, 3 / viewport.scale]}
              listening={false}
            />
          ))}
          {marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill="rgba(79,70,229,0.08)"
              stroke="#4F46E5"
              strokeWidth={1 / viewport.scale}
              listening={false}
            />
          )}
          {link && (
            <Line points={[link.x1, link.y1, link.x2, link.y2]} stroke="#4F46E5" strokeWidth={2} dash={[6, 4]} listening={false} />
          )}
          {draft && (
            <Line points={draft} stroke={inkFor(INK_COLORS[0], theme)} strokeWidth={3} lineCap="round" lineJoin="round" tension={0.4} listening={false} />
          )}
          <Transformer
            ref={trRef}
            rotateEnabled
            keepRatio={onlyImages}
            borderStroke="#4F46E5"
            borderStrokeWidth={1.5}
            anchorStroke="#4F46E5"
            anchorStrokeWidth={1.5}
            anchorFill="#FFFFFF"
            anchorCornerRadius={3}
            anchorSize={9}
            rotateAnchorOffset={28}
            padding={3}
            onTransformEnd={onTransformEnd}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
      <TextEditor />
    </div>
  );
}
