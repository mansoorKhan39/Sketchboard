import { Group, Rect, Ellipse, Line, Text } from "react-konva";
import type Konva from "konva";
import type { Placeable } from "../types";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { inkFor } from "../constants";

interface Props {
  obj: Placeable;
  draggable: boolean;
}

// Draws one board object. Konva "Group" sits at (x, y) so every type moves/rotates the same way.
export default function ObjectNode({ obj, draggable }: Props) {
  const select = useBoard((s) => s.select);
  const selectedIds = useBoard((s) => s.selectedIds);
  const updateObjects = useBoard((s) => s.updateObjects);
  const setEditing = useBoard((s) => s.setEditing);
  const editingId = useBoard((s) => s.editingId);

  const theme = useUI((s) => s.theme);
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
  const onDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage()!;
    const patches: Record<string, { x: number; y: number }> = { [obj.id]: { x: e.target.x(), y: e.target.y() } };
    for (const id of useBoard.getState().selectedIds) {
      const node = stage.findOne("#" + id);
      if (node) patches[id] = { x: node.x(), y: node.y() };
    }
    updateObjects(patches);
  };

  const canEditText = obj.type !== "stroke";

  return (
    <Group
      id={obj.id}
      x={obj.x}
      y={obj.y}
      rotation={obj.rotation}
      draggable={draggable}
      onMouseDown={onDown}
      onTouchStart={onDown}
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
              text={obj.text}
              width={obj.width}
              height={obj.height}
              padding={14}
              fontSize={18}
              fontFamily="Inter, sans-serif"
              lineHeight={1.25}
              fill="#1F2937"
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
