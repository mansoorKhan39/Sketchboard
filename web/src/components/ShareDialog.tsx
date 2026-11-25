import { useEffect, useState } from "react";
import { api, ApiError, type ShareSettings } from "../api";
import { useAuth } from "../auth";
import { useBoard } from "../store";
import { useUI } from "../ui";
import PeoplePanel from "./PeoplePanel";

// The panel that opens from the Share button. Only the owner of a saved (account) board can change sharing.
export default function ShareDialog() {
  const user = useAuth((s) => s.user);
  const boardId = useBoard((s) => s.boardId)!;
  const go = useUI((s) => s.go);
  const [share, setShare] = useState<ShareSettings | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .getShare(boardId)
      .then((r) => {
        setShare(r.share);
        setState("ready");
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Could not load sharing settings.");
        setState("error");
      });
  }, [boardId, user]);

  const update = async (body: Parameters<typeof api.setShare>[1]) => {
    setError("");
    try {
      setShare((await api.setShare(boardId, body)).share);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not change sharing.");
    }
  };

  if (!user) {
    return (
      <div>
        <div className="text-sm font-semibold">Sign in to share</div>
        <p className="mt-1 text-sm text-muted">Boards that are saved in this browser cannot be shared. Sign in, then move the board to your account.</p>
        <button onClick={() => go({ name: "auth" })} className="mt-3 h-8 rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand-strong">
          Sign in
        </button>
      </div>
    );
  }

  const link = share ? `${window.location.origin}${window.location.pathname}#/s/${share.token}` : "";

  const embedCode = `<iframe src="${link}?embed=1" width="800" height="500" style="border:1px solid #ddd;border-radius:8px" allowfullscreen loading="lazy"></iframe>`;

  return (
    <div>
      <div className="text-sm font-semibold">Share this board</div>
      {state === "loading" && <p className="mt-2 text-sm text-muted">Loading…</p>}
      {state === "error" && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      {state === "ready" && (
        <>
          <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-sm">
            Anyone with the link
            <input
              type="checkbox"
              role="switch"
              data-testid="share-toggle"
              checked={!!share?.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="h-5 w-9 cursor-pointer accent-[#4F46E5]"
            />
          </label>

          {share?.enabled && (
            <>
              <div className="mt-3 flex rounded-lg bg-sunken p-0.5">
                {(["viewer", "editor"] as const).map((r) => (
                  <button
                    key={r}
                    data-testid={`share-right-${r}`}
                    onClick={() => update({ enabled: true, right: r })}
                    className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${share.right === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                  >
                    {r === "viewer" ? "Can view" : "Can edit"}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input readOnly value={link} data-testid="share-link" aria-label="Share link" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none" />
                <button
                  onClick={async () => {
                    await navigator.clipboard?.writeText(link).catch(() => {});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="h-8 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {share.right === "viewer" ? (
                <div className="mt-3">
                  <div className="text-xs font-medium">Embed on a web page</div>
                  <textarea
                    readOnly
                    data-testid="embed-code"
                    aria-label="Embed code"
                    rows={3}
                    value={embedCode}
                    onFocus={(e) => e.target.select()}
                    className="mt-1 w-full resize-none rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-[11px] outline-none"
                  />
                  <button
                    data-testid="copy-embed"
                    onClick={async () => {
                      await navigator.clipboard?.writeText(embedCode).catch(() => {});
                      setCopiedEmbed(true);
                      setTimeout(() => setCopiedEmbed(false), 1500);
                    }}
                    className="mt-1 text-xs text-brand hover:underline"
                  >
                    {copiedEmbed ? "Copied" : "Copy embed code"}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">To embed this board on a web page, set the link to "Can view".</p>
              )}
              <button onClick={() => update({ enabled: true, regenerate: true })} className="mt-3 text-xs text-muted underline hover:text-ink">
                Make a new link (the old one stops working)
              </button>
            </>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <p className="mt-3 text-xs text-muted">People who already have the board open keep their access until they reload.</p>
          <div className="mt-4 border-t border-line pt-4">
            <PeoplePanel />
          </div>
        </>
      )}
    </div>
  );
}
