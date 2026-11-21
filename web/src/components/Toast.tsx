import { useUI } from "../ui";

// One small message at the bottom of the screen, for things like "Link copied".
export default function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex justify-center">
      <div
        key={toast.id}
        role="status"
        data-testid="toast"
        className="pop-in-center flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-canvas shadow-float"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
        {toast.text}
      </div>
    </div>
  );
}
