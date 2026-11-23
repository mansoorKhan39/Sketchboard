import { useEffect, useRef, useState } from "react";
import { useUI } from "../ui";
import { api, type AuthConfig } from "../api";

// Google's own sign-in button ("Sign in with Google" / Google Identity Services). We load their script only
// when the server says Google is set up. After a click Google gives us a signed token; the server checks it.

interface GoogleId {
  initialize(o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let configPromise: Promise<AuthConfig> | undefined;
// Asked once per page load: what can the sign-in screen offer?
export const authConfig = () => (configPromise ??= api.authConfig().catch(() => ({ google: null, resetEmail: false })));
export function useAuthConfig(): AuthConfig | null {
  const [c, setC] = useState<AuthConfig | null>(null);
  useEffect(() => {
    void authConfig().then(setC);
  }, []);
  return c;
}

let scriptPromise: Promise<void> | undefined;
function loadScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("blocked"));
    document.head.appendChild(s);
  });
  return scriptPromise.catch((e) => {
    scriptPromise = undefined; // let a later visit try again
    throw e;
  });
}

export default function GoogleButton({ onCredential, text = "continue_with" }: { onCredential: (credential: string) => void; text?: "continue_with" | "signin_with" | "signup_with" }) {
  const config = useAuthConfig();
  const theme = useUI((s) => s.theme);
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);
  const clientId = config?.google;

  useEffect(() => {
    if (!clientId || !box.current) return;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => cb.current(r.credential) });
        box.current.innerHTML = "";
        window.google.accounts.id.renderButton(box.current, {
          type: "standard",
          theme: theme === "dark" ? "filled_black" : "outline",
          size: "large",
          shape: "rectangular",
          text,
          logo_alignment: "left",
          width: Math.min(400, Math.max(200, box.current.clientWidth || 320)),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [clientId, theme, text]);

  if (!clientId) return null;
  return (
    <div>
      <div ref={box} data-testid="google-button" className="flex min-h-[44px] w-full items-center justify-center" />
      {failed && <p className="mt-2 text-center text-xs text-muted">Google sign-in could not load. Check your connection or use email instead.</p>}
    </div>
  );
}
