import { Arrow, Line } from "react-konva";
import { useBoard } from "../store";
import { useUI } from "../ui";
import { inkFor } from "../constants";
import type { Connector, Placeable } from "../types";
import { connectorPoints } from "../geometry";

export default function ConnectorNode({ conn }: { conn: Connector }) {
  const objects = useBoard((s) => s.objects);
  const selected = useBoard((s) => s.selectedIds.includes(conn.id));
  const select = useBoard((s) => s.select);
  const tool = useBoard((s) => s.tool);
  const theme = useUI((s) => s.theme);

  const from = objects.find((o) => o.id === conn.fromId) as Placeable | undefined;
  const to = objects.find((o) => o.id === conn.toId) as Placeable | undefined;
  if (!from || !to) return null;

  const points = connectorPoints(conn, from, to);
  const stroke = selected ? "#4F46E5" : inkFor(conn.color, theme);
  const common = {
    points,
    stroke,
    strokeWidth: selected ? 3 : 2,
    lineJoin: "round" as const,
    hitStrokeWidth: 16,
    onMouseDown: () => tool === "select" && select([conn.id]),
    onTouchStart: () => tool === "select" && select([conn.id]),
  };
  // No `id` on purpose: the resize handles only attach to nodes whose id is an object id.
  return conn.endArrow ? (
    <Arrow {...common} fill={stroke} pointerLength={12} pointerWidth={10} />
  ) : (
    <Line {...common} />
  );
}
