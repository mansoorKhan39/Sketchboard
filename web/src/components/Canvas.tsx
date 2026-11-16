import { useEffect, useRef, useState } from "react";
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
  const selectedIds = useBoard((s) => s.selectedIds);
  const tool = useBoard((s) => s.tool);
  const viewport = useBoard((s) => s.viewport);
  const editingId = useBoard((s) => s.editingId);
  const canEdit = useBoard((s) => s.role !== "viewer");
  const { setViewport, zoomBy, select, addObject, updateObjects, setTool, setEditing } = useBoard.getState();

  const theme = useUI((s) => s.theme);
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
    const nodes = editingId || !canEdit ? [] : selectedIds.map((id) => stage.findOne("#" + id)).filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, objects, editingId, canEdit]);

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
    if (e.evt.ctrlKey || e.evt.metaKey) {
      zoomBy(Math.exp(-e.evt.deltaY * 0.01), p.x, p.y); // pinch / ctrl+wheel
    } else {
      zoomBy(e.evt.deltaY < 0 ? 1.1 : 1 / 1.1, p.x, p.y); // plain wheel zooms (Miro style)
    }
  };

  const onStageDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (spaceDown || editingId) return;
    const onEmpty = e.target === e.target.getStage();
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
        text: "", color: STICKY_COLORS[0],
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
    const hit = objects.filter(
      (o) => o.type !== "connector" && o.x < right && o.x + o.width > left && o.y < bottom && o.y + o.height > top,
    );
    select(hit.map((o) => o.id));
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

  const cursor = spaceDown ? "grab" : tool === "select" ? "default" : tool === "pen" ? "crosshair" : "copy";

  return (
    <div style={{ cursor }}>
      <Stage
        ref={stageRef}
        width={w}
        height={h}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={spaceDown}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) setViewport({ ...viewport, x: e.target.x(), y: e.target.y() });
        }}
        onWheel={onWheel}
        onMouseDown={onStageDown}
        onTouchStart={onStageDown}
        onMouseMove={onStageMove}
        onTouchMove={onStageMove}
        onMouseUp={onStageUp}
        onTouchEnd={onStageUp}
      >
        <Layer>
          {objects.map((o) => (o.type === "connector" ? <ConnectorNode key={o.id} conn={o} /> : null))}
          {objects.map((o) =>
            o.type === "connector" ? null : <ObjectNode key={o.id} obj={o} draggable={tool === "select" && !spaceDown && canEdit} />,
          )}
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
            keepRatio={false}
            borderStroke="#4F46E5"
            borderStrokeWidth={1.5}
            anchorStroke="#4F46E5"
            anchorStrokeWidth={1.5}
            anchorFill="#FFFFFF"
            anchorCornerRadius={3}
            anchorSize={10}
            onTransformEnd={onTransformEnd}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
          />
        </Layer>
      </Stage>
      <TextEditor />
    </div>
  );
}
