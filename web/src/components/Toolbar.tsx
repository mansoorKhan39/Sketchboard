import type { ReactNode } from "react";
import { useBoard } from "../store";
import type { Tool } from "../types";

const icon = (d: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", key: "V", icon: icon(<path d="M5 3l14 8-6 2-2 6z" />) },
  { id: "sticky", label: "Sticky note", key: "N", icon: icon(<path d="M4 4h16v10l-6 6H4zM14 20v-6h6" />) },
  { id: "shape", label: "Shape", key: "S", icon: icon(<><rect x="3" y="11" width="9" height="9" rx="1" /><circle cx="16" cy="8" r="5" /></>) },
  { id: "pen", label: "Pen", key: "P", icon: icon(<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />) },
  { id: "connector", label: "Connector", key: "L", icon: icon(<><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><path d="M7 18h4a4 4 0 004-4V8" /></>) },
  { id: "text", label: "Text", key: "T", icon: icon(<path d="M5 6V4h14v2M12 4v16M9 20h6" />) },
];

export default function Toolbar() {
  const tool = useBoard((s) => s.tool);
  const setTool = useBoard((s) => s.setTool);
  const canEdit = useBoard((s) => s.role !== "viewer");
  const tools = canEdit ? TOOLS : TOOLS.filter((t) => t.id === "select");

  return (
    <div className="absolute left-4 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-float">
      {tools.map((t) => (
        <div key={t.id} className="group relative">
          <button
            aria-label={t.label}
            aria-pressed={tool === t.id}
            data-testid={`tool-${t.id}`}
            onClick={() => setTool(t.id)}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
              tool === t.id ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-sunken hover:text-ink"
            }`}
          >
            {t.icon}
          </button>
          <span className="pointer-events-none absolute left-full top-1/2 ml-3 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-canvas opacity-0 transition group-hover:opacity-100">
            {t.label}
            <kbd className="rounded bg-canvas/20 px-1.5 py-0.5 font-sans text-[10px]">{t.key}</kbd>
          </span>
        </div>
      ))}
    </div>
  );
}
