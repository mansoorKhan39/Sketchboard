import { useEffect, useState } from "react";
import { Group, Rect, Ellipse, Line, Text, Image as KImage } from "react-konva";
import type Konva from "konva";
import { useRef } from "react";
import type { Placeable } from "../types";
import { insideFrame } from "../geometry";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { useAuth } from "../auth";
import { isHiddenFrom, isPrivate, voterId } from "../extras";
import { inkFor } from "../constants";

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

  const onDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!draggable) return;
    const shift = "shiftKey" in e.evt && e.evt.shiftKey;
    if (shift) {
      select(selectedIds.includes(obj.id) ? selectedIds.filter((i) => i !== obj.id) : [...selectedIds, obj.id]);
    } else if (!selectedIds.includes(obj.id)) {
      select([obj.id]);
    }
  };

  // Multi-drag: when several nodes are attached to the Transformer, Konva moves them all together.
  // On drop we just read the final position of every selected node and save them in one go.
  // A frame carries the objects inside it: remember them when the drag starts, move them while it goes.
  const carried = useRef<{ id: string; x: number; y: number }[]>([]);
  const onDragStart = (e: Konva.KonvaEventObject<DragEvent>) => {
    carried.current = [];
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
    updateObjects(patches);
  };

  const canEditText = obj.type !== "stroke" && obj.type !== "image" && obj.type !== "frame" && !masked;

  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      rotation={obj.rotation}
      draggable={draggable}
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
          <Rect
            width={obj.width}
            height={obj.height}
            fill={obj.color}
            cornerRadius={4}
            shadowColor="black"
            shadowBlur={14}
            shadowOpacity={0.2}
            shadowOffsetY={6}
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
          {obj.kind === "diamond" && (
            <Line
              points={[obj.width / 2, 0, obj.width, obj.height / 2, obj.width / 2, obj.height, 0, obj.height / 2]}
              closed
              fill={obj.fill}
              stroke={obj.stroke}
              strokeWidth={obj.strokeWidth}
            />
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
    </Group>
  );
}
