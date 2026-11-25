import { useCallback, useEffect, useRef, useState } from "react";
import { api, type NotificationItem } from "../api";
import { useAuth } from "../auth";
import { useUI } from "../ui";

// Bell with a red dot when something new happened (an invitation, an @mention). Checks every 45 seconds.
export default function Bell() {
  const user = useAuth((s) => s.user);
  const go = useUI((s) => s.go);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.notifications().then((r) => { setItems(r.notifications); setUnread(r.unread); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) return;
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, [user, load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) return null;
  const markRead = async () => {
    await api.markNotificationsRead().catch(() => {});
    load();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        data-testid="bell"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted hover:border-brand hover:text-ink"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {unread > 0 && (
          <span data-testid="bell-count" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border border-line bg-surface p-2 shadow-float" data-testid="bell-panel">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <button onClick={markRead} data-testid="bell-read" className="text-xs text-brand hover:underline">Mark all as read</button>}
          </div>
          {items.length === 0 && <p className="px-2 py-3 text-sm text-muted">Nothing yet. Invitations and @mentions show up here.</p>}
          <ul className="max-h-80 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  disabled={!n.boardId}
                  onClick={() => { setOpen(false); if (n.boardId) go({ name: "board", id: n.boardId }); }}
                  data-testid="bell-item"
                  className={`block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-sunken ${n.read ? "text-muted" : "font-medium"}`}
                >
                  {n.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
