import { useEffect, useState } from "react";
import { Group, Rect, Ellipse, Line, Path, Text, Image as KImage } from "react-konva";
import type Konva from "konva";
import { useRef } from "react";
import type { Placeable } from "../types";
import { insideFrame } from "../geometry";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { useAuth } from "../auth";
import { isHiddenFrom, isPrivate, voterId } from "../extras";
import { inkFor, mixHex } from "../constants";
import { expandGroups, placeable } from "../arrange";
import { GRID_SIZE, SNAP_DISTANCE, snapBox } from "../snapping";
import type { Box } from "../snapping";
import { curvePath, polygonPoints } from "../shapes";

interface Props {
  obj: Placeable;
  draggable: boolean;
}

// Loads the picture stored in an image object. Returns null until it is ready.
function useLoadedImage(src: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const i = new window.Image();
    i.onload = () => setImg(i);
    i.src = src;
    return () => {
      i.onload = null;
    };
  }, [src]);
  return img;
}

function Picture({ src, width, height }: { src: string; width: number; height: number }) {
  const img = useLoadedImage(src);
  return img ? (
    <KImage image={img} width={width} height={height} cornerRadius={4} />
  ) : (
    <Rect width={width} height={height} fill="rgba(127,127,127,0.18)" cornerRadius={4} />
  );
}

// Draws one board object. Konva "Group" sits at (x, y) so every type moves/rotates the same way.
export default function ObjectNode({ obj, draggable }: Props) {
  const select = useBoard((s) => s.select);
  const selectedIds = useBoard((s) => s.selectedIds);
  const updateObjects = useBoard((s) => s.updateObjects);
  const setEditing = useBoard((s) => s.setEditing);
  const editingId = useBoard((s) => s.editingId);

  const theme = useUI((s) => s.theme);
  const privateOn = useBoard((s) => isPrivate(s.objects));
  const userId = useAuth((s) => s.user?.id);
  const masked = obj.type === "sticky" && isHiddenFrom(obj, voterId(userId), privateOn);
  const hidden = editingId === obj.id; // hide text while the textarea overlay is open

  const locked = !!obj.locked;
  const movable = draggable && !locked;

  // Clicking one member of a group picks the whole group.
  const onDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!draggable) return;
    const all = useBoard.getState().objects;
    const mates = expandGroups(all, [obj.id]);
    const shift = "shiftKey" in e.evt && e.evt.shiftKey;
    if (shift) {
      select(selectedIds.includes(obj.id) ? selectedIds.filter((i) => !mates.includes(i)) : [...new Set([...selectedIds, ...mates])]);
    } else if (!selectedIds.includes(obj.id)) {
      select(mates);
    }
  };

  // Smart guides: the box being dragged snaps to the other objects (and to the grid when nothing is close).
  // Done in dragBoundFunc so every selected object follows the corrected position.
  const drag = useRef<{ sx: number; sy: number; box: Box; others: Box[]; alt: boolean } | null>(null);
  const bound = (abs: { x: number; y: number }) => {
    const d = drag.current;
    const ui = useUI.getState();
    const stage = stageOf.current;
    if (!d || !stage || d.alt || (!ui.snap && !ui.grid)) return abs;
    const w = stage.getAbsoluteTransform().copy().invert().point(abs);
    const moved = { ...d.box, x: d.box.x + (w.x - d.sx), y: d.box.y + (w.y - d.sy) };
    const r = snapBox(moved, ui.snap ? d.others : [], SNAP_DISTANCE / stage.scaleX(), ui.grid ? GRID_SIZE : 0);
    const key = r.guides.map((g) => `${g.axis}${g.pos}`).join();
    if (key !== lastGuides.current) {
      lastGuides.current = key;
      ui.setGuides(r.guides);
    }
    return stage.getAbsoluteTransform().point({ x: w.x + r.dx, y: w.y + r.dy });
  };
  const stageOf = useRef<Konva.Stage | null>(null);
  const lastGuides = useRef("");

  // Multi-drag: when several nodes are attached to the Transformer, Konva moves them all together.
  // On drop we just read the final position of every selected node and save them in one go.
  // A frame carries the objects inside it: remember them when the drag starts, move them while it goes.
  const carried = useRef<{ id: string; x: number; y: number }[]>([]);
  const onDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    carried.current = [];
    stageOf.current = e.target.getStage();
    {
      const st = useBoard.getState();
      const ids = new Set(st.selectedIds.includes(obj.id) ? st.selectedIds : [obj.id]);
      const mine = st.objects.filter((o) => ids.has(o.id) && placeable(o) && !o.locked);
      const x1 = Math.min(...mine.map((o) => o.x)), y1 = Math.min(...mine.map((o) => o.y));
      const x2 = Math.max(...mine.map((o) => o.x + o.width)), y2 = Math.max(...mine.map((o) => o.y + o.height));
      drag.current = {
        sx: obj.x, sy: obj.y, alt: false,
        box: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
        others: st.objects.filter((o) => !ids.has(o.id) && placeable(o)).map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height })),
      };
    }
    if (obj.type !== "frame") return;
    const { objects, selectedIds: sel } = useBoard.getState();
    const stage = e.target.getStage()!;
    for (const o of objects) {
      if (!insideFrame(obj, o) || sel.includes(o.id)) continue;
      const node = stage.findOne("#" + o.id);
      if (node) carried.current.push({ id: o.id, x: node.x(), y: node.y() });
    }
  };
  const onDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (drag.current) drag.current.alt = e.evt.altKey; // hold Alt to move without snapping
    if (!carried.current.length) return;
    const dx = e.target.x() - obj.x;
    const dy = e.target.y() - obj.y;
    const stage = e.target.getStage()!;
    for (const c of carried.current) stage.findOne("#" + c.id)?.position({ x: c.x + dx, y: c.y + dy });
  };

  // Multi-drag: when several nodes are attached to the Transformer, Konva moves them all together.
  // On drop we just read the final position of every selected node and save them in one go.
  const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage()!;
    const patches: Record<string, { x: number; y: number }> = { [obj.id]: { x: e.target.x(), y: e.target.y() } };
    for (const id of useBoard.getState().selectedIds) {
      const node = stage.findOne("#" + id);
      if (node) patches[id] = { x: node.x(), y: node.y() };
    }
    for (const c of carried.current) {
      const node = stage.findOne("#" + c.id);
      if (node) patches[c.id] = { x: node.x(), y: node.y() };
    }
    carried.current = [];
    drag.current = null;
    lastGuides.current = "";
    useUI.getState().setGuides([]);
    updateObjects(patches);
  };

  const canEditText = obj.type !== "stroke" && obj.type !== "image" && obj.type !== "frame" && !masked && !locked;

  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      rotation={obj.rotation}
      draggable={movable}
      dragBoundFunc={bound}
      onMouseDown={onDown}
      onTouchStart={onDown}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDblClick={() => canEditText && draggable && setEditing(obj.id)}
      onDblTap={() => canEditText && draggable && setEditing(obj.id)}
    >
      {obj.type === "sticky" && (
        <>
          {/* paper: a wide soft shadow, a tight contact shadow, a top-to-bottom tint and a curled corner */}
          <Rect
            width={obj.width}
            height={obj.height}
            fill={obj.color}
            cornerRadius={3}
            shadowColor="#0B1020"
            shadowBlur={22}
            shadowOpacity={0.22}
            shadowOffsetY={12}
            listening={false}
          />
          <Rect
            width={obj.width}
            height={obj.height}
            fill={obj.color}
            cornerRadius={3}
            shadowColor="#0B1020"
            shadowBlur={3}
            shadowOpacity={0.28}
            shadowOffsetY={1}
          />
          <Rect
            width={obj.width}
            height={obj.height}
            cornerRadius={3}
            fillLinearGradientStartPoint={{ x: 0, y: 0 }}
            fillLinearGradientEndPoint={{ x: 0, y: obj.height }}
            fillLinearGradientColorStops={[0, mixHex(obj.color, "#FFFFFF", 0.28), 0.14, obj.color, 1, mixHex(obj.color, "#000000", 0.07)]}
            listening={false}
          />
          <Line
            points={[obj.width - 22, obj.height, obj.width, obj.height - 22, obj.width, obj.height]}
            closed
            fill={mixHex(obj.color, "#000000", 0.16)}
            listening={false}
          />
          {!hidden && (
            <Text
              text={masked ? "• • •" : obj.text}
              width={obj.width}
              height={obj.height}
              padding={14}
              fontSize={18}
              fontFamily="Inter, sans-serif"
              lineHeight={1.25}
              fill={masked ? "#6B7280" : "#1F2937"}
              listening={false}
            />
          )}
        </>
      )}

      {obj.type === "shape" && (
        <>
          {obj.kind === "rect" && (
            <Rect
              width={obj.width}
              height={obj.height}
              fill={obj.fill}
              stroke={obj.stroke}
              strokeWidth={obj.strokeWidth}
              cornerRadius={6}
              shadowColor="#0B1020"
              shadowBlur={10}
              shadowOpacity={0.1}
              shadowOffsetY={3}
            />
          )}
          {obj.kind === "ellipse" && (
            <Ellipse
              x={obj.width / 2}
              y={obj.height / 2}
              radiusX={obj.width / 2}
              radiusY={obj.height / 2}
              fill={obj.fill}
              stroke={obj.stroke}
              strokeWidth={obj.strokeWidth}
            />
          )}
          {polygonPoints(obj.kind, obj.width, obj.height) && (
            <Line
              points={polygonPoints(obj.kind, obj.width, obj.height)!}
              closed
              lineJoin="round"
              fill={obj.fill}
              stroke={obj.stroke}
              strokeWidth={obj.strokeWidth}
            />
          )}
          {curvePath(obj.kind) && (
            <Group scaleX={obj.width / 100} scaleY={obj.height / 100}>
              <Path data={curvePath(obj.kind)!.body} fill={obj.fill} stroke={obj.stroke} strokeWidth={obj.strokeWidth} strokeScaleEnabled={false} lineJoin="round" />
              {curvePath(obj.kind)!.detail && (
                <Path data={curvePath(obj.kind)!.detail!} stroke={obj.stroke} strokeWidth={obj.strokeWidth} strokeScaleEnabled={false} listening={false} />
              )}
            </Group>
          )}
          {!hidden && (
            <Text
              text={obj.text}
              width={obj.width}
              height={obj.height}
              align="center"
              verticalAlign="middle"
              padding={10}
              fontSize={16}
              fontFamily="Inter, sans-serif"
              lineHeight={1.25}
              fill="#1F2937"
              listening={false}
            />
          )}
        </>
      )}

      {obj.type === "stroke" && (
        <Line
          points={obj.points}
          stroke={inkFor(obj.color, theme)}
          strokeWidth={obj.lineWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
          hitStrokeWidth={Math.max(obj.lineWidth, 14)}
        />
      )}

      {obj.type === "frame" && (
        <>
          {/* the inside is only a tint (not clickable) so a click in an empty frame still starts a selection box */}
          <Rect width={obj.width} height={obj.height} fill="rgba(127,127,127,0.07)" cornerRadius={6} listening={false} />
          <Rect width={obj.width} height={obj.height} stroke="#94A3B8" strokeWidth={2} cornerRadius={6} fillEnabled={false} hitStrokeWidth={14} />
          <Text
            text={obj.text || "Frame"}
            x={10}
            y={8}
            width={Math.max(obj.width - 20, 10)}
            wrap="none"
            ellipsis
            fontSize={15}
            fontStyle="bold"
            fontFamily="Inter, sans-serif"
            fill="#64748B"
          />
        </>
      )}

      {obj.type === "image" && <Picture src={obj.src} width={obj.width} height={obj.height} />}

      {obj.type === "text" && (
        <>
          {/* invisible rect gives the text a clickable area */}
          <Rect width={obj.width} height={obj.height} fill="transparent" />
          {!hidden && (
            <Text
              text={obj.text}
              width={obj.width}
              fontSize={obj.fontSize}
              fontFamily="Inter, sans-serif"
              lineHeight={1.25}
              fill={inkFor(obj.color, theme)}
              listening={false}
            />
          )}
        </>
      )}
      {locked && <Text text="🔒" x={obj.width - 18} y={-8} fontSize={14} listening={false} />}
    </Group>
  );
}
