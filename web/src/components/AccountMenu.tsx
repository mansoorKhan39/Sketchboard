import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { useUI } from "../ui";
import Avatar from "./Avatar";

export default function AccountMenu() {
  const user = useAuth((s) => s.user);
  const go = useUI((s) => s.go);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) {
    return (
      <button
        onClick={() => go({ name: "auth" })}
        data-testid="sign-in"
        className="h-9 rounded-lg border border-line px-4 text-sm font-medium hover:border-brand hover:bg-brand-soft"
      >
        Sign in
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        data-testid="account"
        className="flex h-9 w-9 items-center justify-center rounded-full"
      >
        <Avatar user={user} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-30 w-60 rounded-xl border border-line bg-surface p-1 shadow-float">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-xs text-muted">{user.email}</div>
          </div>
          <button
            data-testid="profile-link"
            onClick={() => {
              setOpen(false);
              go({ name: "profile" });
            }}
            className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-sunken"
          >
            Profile and password
          </button>
          <button
            data-testid="sign-out"
            onClick={async () => {
              setOpen(false);
              await useAuth.getState().logout();
              go({ name: "dashboard" });
            }}
            className="block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-sunken"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
