import { useMemo } from "react";
import { Group, Text } from "react-konva";
import { layoutRich, type Span } from "../richtext";
import { measureFor } from "../richmeasure";

// Text with different styles inside it (bold words, a red word ...). Plain Konva text can only have one style,
// so every styled piece is drawn on its own at the position the layout code worked out.
export default function RichText(p: {
  text: string;
  spans: Span[];
  width: number;
  height: number;
  size: number;
  pad: number;
  align: "left" | "center" | "right";
  middle?: boolean;
  bullets?: boolean;
  base: { b?: boolean; i?: boolean; u?: boolean };
  fill: string;
}) {
  const { text, spans, width, height, size, pad, align, middle, bullets, base, fill } = p;
  const lay = useMemo(
    () => layoutRich(text, spans, { width: width - 2 * pad, size, align, bullets, base, measure: measureFor(size) }),
    [text, spans, width, pad, size, align, bullets, base.b, base.i, base.u], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const top = middle ? (height - lay.height) / 2 : pad;
  return (
    <Group listening={false}>
      {lay.lines.map((l, li) =>
        l.segs.map((s, si) => (
          <Text
            key={`${li}-${si}`}
            x={pad + s.x}
            y={top + l.y}
            text={s.text}
            fontSize={size}
            lineHeight={1.25}
            fontFamily="Inter, sans-serif"
            fontStyle={`${s.i ? "italic " : ""}${s.b ? "bold" : ""}`.trim() || "normal"}
            textDecoration={s.u ? "underline" : ""}
            fill={s.c || fill}
            wrap="none"
            listening={false}
          />
        )),
      )}
    </Group>
  );
}
