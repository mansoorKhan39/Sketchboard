import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ActivityItem, type People } from "../api";
import { useAuth } from "../auth";
import { useBoard } from "../store";
import { useUI } from "../ui";

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

// Who can open this board (by e-mail address), their rights, and what happened lately.
// The owner can invite and change rights; other members can only look, or leave.
export default function PeoplePanel() {
  const user = useAuth((s) => s.user)!;
  const boardId = useBoard((s) => s.boardId)!;
  const go = useUI((s) => s.go);
  const [people, setPeople] = useState<People | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.getPeople(boardId).then(setPeople).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the people list."));
    api.getActivity(boardId).then((r) => setActivity(r.activity)).catch(() => {});
  }, [boardId]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<People>) => {
    setError("");
    setNote("");
    setBusy(true);
    try {
      setPeople(await fn());
      api.getActivity(boardId).then((r) => setActivity(r.activity)).catch(() => {});
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const isOwner = people?.you === "owner";
  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    let emailed: boolean | undefined;
    const ok = await run(async () => {
      const r = await api.invite(boardId, addr, role);
      emailed = r.emailed;
      return r;
    });
    if (ok) {
      setEmail("");
      setNote(emailed ? `Invitation sent to ${addr}.` : `${addr} can open the board from "Shared with me" after signing in.`);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await api.removeMember(boardId, user.id);
      go({ name: "dashboard" });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not leave the board.");
      setBusy(false);
    }
  };

  const field = "h-8 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-brand";

  return (
    <div data-testid="people-panel">
      <div className="text-sm font-semibold">People</div>
      {!people && !error && <p className="mt-2 text-sm text-muted">Loading…</p>}
      {people && (
        <>
          {isOwner && (
            <form onSubmit={sendInvite} className="mt-2 flex gap-1.5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                aria-label="Email address to invite"
                data-testid="invite-email"
                className={`${field} min-w-0 flex-1`}
              />
              <select value={role} onChange={(e) => setRole(e.target.value as "editor" | "viewer")} aria-label="Right for the new person" data-testid="invite-role" className={field}>
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <button disabled={busy || !email.trim()} data-testid="invite-send" className="h-8 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-50">
                Invite
              </button>
            </form>
          )}
          {note && <p data-testid="invite-note" className="mt-1.5 text-xs text-muted">{note}</p>}

          {people.team && <p data-testid="people-team" className="mt-2 text-xs text-muted">Everyone in the team "{people.team.name}" can open this board.</p>}
          <ul className="mt-3 space-y-1.5" data-testid="member-list">
            <li className="flex items-center justify-between text-sm">
              <span className="truncate">{people.owner.name}</span>
              <span className="text-xs text-muted">Owner</span>
            </li>
            {people.members.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2 text-sm" data-testid="member">
                <span className="min-w-0 truncate" title={m.email}>
                  {m.name}
                  {m.userId === user.id && " (you)"}
                </span>
                {isOwner ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <select
                      value={m.role}
                      aria-label={`Right for ${m.name}`}
                      disabled={busy}
                      onChange={(e) => m.email && run(() => api.invite(boardId, m.email!, e.target.value as "editor" | "viewer"))}
                      className="h-7 rounded-md border border-line bg-surface px-1 text-xs"
                    >
                      <option value="editor">Can edit</option>
                      <option value="viewer">Can view</option>
                    </select>
                    <button disabled={busy} onClick={() => run(() => api.removeMember(boardId, m.userId))} aria-label={`Remove ${m.name}`} title="Remove" className="text-muted hover:text-red-600">
                      ✕
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-muted">{m.role === "editor" ? "Can edit" : "Can view"}</span>
                )}
              </li>
            ))}
            {people.invites.map((i) => (
              <li key={i.email} className="flex items-center justify-between gap-2 text-sm" data-testid="invite">
                <span className="min-w-0 truncate text-muted">{i.email} (invited)</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs text-muted">{i.role === "editor" ? "Can edit" : "Can view"}</span>
                  <button disabled={busy} onClick={() => run(() => api.cancelInvite(boardId, i.email))} aria-label={`Cancel invitation for ${i.email}`} title="Cancel invitation" className="text-muted hover:text-red-600">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>

          {!isOwner && (
            <button onClick={leave} disabled={busy} data-testid="leave-board" className="mt-3 text-xs text-muted underline hover:text-red-600">
              Leave this board
            </button>
          )}

          {activity.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium">Recent activity</div>
              <ul className="mt-1.5 max-h-36 space-y-1 overflow-y-auto" data-testid="activity">
                {activity.slice(0, 20).map((a, i) => (
                  <li key={i} className="text-xs text-muted">
                    <span className="text-ink">{a.by}</span> {a.text} · {ago(a.at)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
