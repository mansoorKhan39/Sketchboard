import { useRef } from "react";
import type { ReactNode } from "react";
import { useBoard } from "../store";
import type { Tool } from "../types";
import { placeImages, viewCenter } from "../image";

const icon = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", key: "V", icon: icon(<path d="M5 3l14 8-6 2-2 6z" />) },
  { id: "hand", label: "Hand (move the view)", key: "H", icon: icon(<path d="M8 13V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V13m0-3.5a1.5 1.5 0 013 0V16a6 6 0 01-6 6h-1.5a6 6 0 01-4.6-2.2L4 15.500a1.600 1.600 0 012.400-2.100L8 15" />) },
  { id: "sticky", label: "Sticky note", key: "N", icon: icon(<path d="M4 4h16v10l-6 6H4zM14 20v-6h6" />) },
  { id: "shape", label: "Shape", key: "S", icon: icon(<><rect x="3" y="11" width="9" height="9" rx="1" /><circle cx="16" cy="8" r="5" /></>) },
  { id: "table", label: "Table", key: "B", icon: icon(<><rect x="3" y="4" width="18" height="16" rx="1.500" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>) },
  { id: "pen", label: "Pen", key: "P", icon: icon(<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />) },
  { id: "eraser", label: "Eraser (drag over drawings)", key: "E", icon: icon(<path d="M9 20h11M5.500 15.500l9-9a2 2 0 012.800 0l1.700 1.700a2 2 0 010 2.800L11 20H8l-2.500-2.500a2 2 0 010-2z" />) },
  { id: "connector", label: "Connector", key: "L", icon: icon(<><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h4a4 4 0 004-4V8" /></>) },
  { id: "frame", label: "Frame", key: "F", icon: icon(<path d="M7 3v18M17 3v18M3 7h18M3 17h18" />) },
  { id: "comment", label: "Comment", key: "C", icon: icon(<path d="M4 5h16v11H9l-5 4z" />) },
  { id: "text", label: "Text", key: "T", icon: icon(<path d="M5 6V4h14v2M12 4v16M9 20h6" />) },
];

export default function Toolbar() {
  const tool = useBoard((s) => s.tool);
  const setTool = useBoard((s) => s.setTool);
  const canEdit = useBoard((s) => s.role !== "viewer");
  const tools = canEdit ? TOOLS : TOOLS.filter((t) => t.id === "select" || t.id === "hand");
  const picker = useRef<HTMLInputElement>(null);

  return (
    <div className="glass absolute left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-xl p-1.5">
      {tools.map((t) => (
        <div key={t.id} className="group relative">
          <button
            aria-label={t.label}
            aria-pressed={tool === t.id}
            data-testid={`tool-${t.id}`}
            onClick={() => setTool(t.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${
              tool === t.id
                ? "bg-brand text-white shadow-[0_0_0_1px_rgb(99_102_241/0.6),0_6px_16px_-4px_rgb(79_70_229/0.65)]"
                : "text-muted hover:bg-sunken hover:text-ink"
            }`}
          >
            {t.icon}
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 flex -translate-x-1 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-canvas opacity-0 shadow-float transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100">
            {t.label}
            <kbd className="rounded bg-canvas/20 px-1.5 py-0.5 font-sans text-[10px]">{t.key}</kbd>
          </span>
        </div>
      ))}
      {canEdit && (
        <div className="group relative">
          <button
            aria-label="Image"
            data-testid="tool-image"
            onClick={() => picker.current?.click()}
            className="flex h-10 w-10 items-center justify-center rounded-[10px] text-muted hover:bg-sunken hover:text-ink"
          >
            {icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 9" /></>)}
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 flex -translate-x-1 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-canvas opacity-0 shadow-float transition duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100">
            Image
          </span>
          <input
            ref={picker}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="image-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = ""; // so the same file can be picked again
              const c = viewCenter();
              void placeImages(files, c.x, c.y);
            }}
          />
        </div>
      )}
    </div>
  );
}
