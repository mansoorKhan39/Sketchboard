import { useState } from "react";
import { useBoard } from "../store";
import { useAuth } from "../auth";
import { MAX_COMMENT_CHARS, MAX_THREAD, newMessage } from "../comments";
import type { CommentObj } from "../types";

// Comment pins are plain HTML drawn over the board, so they keep the same size at every zoom level.
export default function CommentLayer() {
  const objects = useBoard((s) => s.objects);
  const vp = useBoard((s) => s.viewport);
  const openId = useBoard((s) => s.commentId);
  const setOpen = useBoard((s) => s.setCommentId);
  const comments = objects.filter((o): o is CommentObj => o.type === "comment");
  if (!comments.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {comments.map((c, i) => {
        const left = c.x * vp.scale + vp.x;
        const top = c.y * vp.scale + vp.y;
        if (left < -40 || top < -40 || left > window.innerWidth + 40 || top > window.innerHeight + 40) return null;
        const open = openId === c.id;
        return (
          <div key={c.id} className="absolute" style={{ left, top, transform: "translate(-4px, -100%)" }}>
            <button
              data-testid="comment-pin"
              aria-label={`Comment ${i + 1}${c.resolved ? " (resolved)" : ""}`}
              onClick={() => setOpen(open ? null : c.id)}
              className={`pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full rounded-bl-none border-2 border-white text-xs font-semibold shadow-float transition ${
                c.resolved ? "bg-sunken text-muted" : "bg-brand text-white"
              } ${open ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : ""}`}
            >
              {c.resolved ? "✓" : c.thread.length || "+"}
            </button>
            {open && <Thread c={c} />}
          </div>
        );
      })}
    </div>
  );
}

function Thread({ c }: { c: CommentObj }) {
  const updateObjects = useBoard((s) => s.updateObjects);
  const canEdit = useBoard((s) => s.role !== "viewer");
  const meName = useBoard((s) => s.me?.name);
  const userName = useAuth((s) => s.user?.name);
  const [text, setText] = useState("");
  const author = meName || userName || "Guest";

  const post = () => {
    const t = text.trim().slice(0, MAX_COMMENT_CHARS);
    if (!t || c.thread.length >= MAX_THREAD) return;
    updateObjects({ [c.id]: { thread: [...c.thread, newMessage(author, t)] } });
    setText("");
  };
  const remove = () => {
    const s = useBoard.getState();
    s.select([c.id]);
    s.removeSelected();
    s.setCommentId(null);
  };

  return (
    <div
      data-testid="comment-thread"
      className="pointer-events-auto absolute left-0 top-9 w-72 rounded-xl border border-line bg-surface p-3 shadow-float"
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="max-h-56 space-y-2.5 overflow-auto">
        {c.thread.length === 0 && <p className="text-sm text-muted">Write the first comment.</p>}
        {c.thread.map((m) => (
          <div key={m.id} data-testid="comment-message">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="font-semibold">{m.author}</span>
              <span className="text-muted">{new Date(m.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{m.text}</p>
          </div>
        ))}
      </div>
      {canEdit ? (
        <>
          <textarea
            data-testid="comment-input"
            value={text}
            maxLength={MAX_COMMENT_CHARS}
            rows={2}
            placeholder="Reply… (Enter to send)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                post();
              }
            }}
            className="mt-2 w-full resize-none rounded-lg border border-line bg-canvas p-2 text-sm outline-none focus:border-brand"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-1">
              <button
                data-testid="comment-resolve"
                onClick={() => updateObjects({ [c.id]: { resolved: !c.resolved } })}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:bg-sunken hover:text-ink"
              >
                {c.resolved ? "Reopen" : "Resolve"}
              </button>
              <button data-testid="comment-delete" onClick={remove} className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10">
                Delete
              </button>
            </div>
            <button data-testid="comment-send" onClick={post} disabled={!text.trim()} className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-40">
              Send
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted">You can read comments, but not add them (view only).</p>
      )}
    </div>
  );
}
