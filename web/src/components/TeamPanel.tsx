import { useEffect, useState } from "react";
import { api, ApiError, type TeamDetail } from "../api";
import { useAuth } from "../auth";

// One team: its people and their roles. Admins invite, change roles, rename and delete; members can only look or leave.
export default function TeamPanel({ teamId, onClose, onChanged }: { teamId: string; onClose: () => void; onChanged: () => void }) {
  const me = useAuth((s) => s.user)!;
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    api.getTeam(teamId).then((r) => { setTeam(r.team); setName(r.team.name); }).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the team."));
  }, [teamId]);

  const run = async (fn: () => Promise<{ team: TeamDetail | null; emailed?: boolean }>, after?: () => void) => {
    setError(""); setNote(""); setBusy(true);
    try {
      const r = await fn();
      if (r.team) { setTeam(r.team); setName(r.team.name); }
      onChanged();
      after?.();
      return r;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const admin = team?.you === "admin";
  const field = "h-8 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-brand";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-label="Team" data-testid="team-panel" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-float">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Team</h2>
          <button onClick={onClose} aria-label="Close" className="text-muted hover:text-ink">✕</button>
        </div>
        {!team && !error && <p className="mt-3 text-sm text-muted">Loading…</p>}
        {team && (
          <>
            {admin ? (
              <form className="mt-3 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== team.name) void run(() => api.renameTeam(team.id, name.trim())); }}>
                <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Team name" maxLength={60} data-testid="team-name" className={`${field} min-w-0 flex-1`} />
                <button disabled={busy || !name.trim() || name.trim() === team.name} className="h-8 rounded-lg border border-line px-3 text-xs font-medium hover:border-brand disabled:opacity-50">Rename</button>
              </form>
            ) : (
              <div className="mt-3 text-sm font-medium">{team.name}</div>
            )}
            <p className="mt-1 text-xs text-muted">Everyone in a team can open the team's boards. Members can edit; admins also manage people.</p>

            {admin && (
              <form
                className="mt-3 flex gap-1.5"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const addr = email.trim();
                  if (!addr) return;
                  const r = await run(() => api.inviteToTeam(team.id, addr, role));
                  if (r) { setEmail(""); setNote(r.emailed ? `Invitation sent to ${addr}.` : `${addr} joins when they sign in.`); }
                }}
              >
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address to add" data-testid="team-email" className={`${field} min-w-0 flex-1`} />
                <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "member")} aria-label="Role" data-testid="team-role" className={field}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button disabled={busy || !email.trim()} data-testid="team-invite" className="h-8 rounded-lg bg-brand px-3 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-50">Add</button>
              </form>
            )}
            {note && <p data-testid="team-note" className="mt-1.5 text-xs text-muted">{note}</p>}

            <ul className="mt-3 space-y-1.5" data-testid="team-members">
              {team.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 text-sm" data-testid="team-member">
                  <span className="min-w-0 truncate" title={m.email}>{m.name}{m.userId === me.id && " (you)"}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {admin ? (
                      <select value={m.role} disabled={busy || !m.email} aria-label={`Role of ${m.name}`} onChange={(e) => m.email && run(() => api.inviteToTeam(team.id, m.email!, e.target.value as "admin" | "member"))} className="h-7 rounded-md border border-line bg-surface px-1 text-xs">
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="text-xs text-muted">{m.role === "admin" ? "Admin" : "Member"}</span>
                    )}
                    {admin && m.userId !== me.id && (
                      <button disabled={busy} onClick={() => run(() => api.removeTeamMember(team.id, m.userId))} aria-label={`Remove ${m.name}`} className="text-muted hover:text-red-600">✕</button>
                    )}
                  </span>
                </li>
              ))}
              {team.invites.map((i) => (
                <li key={i.email} className="flex items-center justify-between gap-2 text-sm" data-testid="team-invite-row">
                  <span className="min-w-0 truncate text-muted">{i.email} (invited)</span>
                  <button disabled={busy} onClick={() => run(() => api.cancelTeamInvite(team.id, i.email))} aria-label={`Cancel invitation for ${i.email}`} className="text-muted hover:text-red-600">✕</button>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <button disabled={busy} data-testid="team-leave" onClick={() => run(() => api.removeTeamMember(team.id, me.id), onClose)} className="text-muted underline hover:text-red-600">Leave team</button>
              {admin && (
                <button
                  disabled={busy}
                  data-testid="team-delete"
                  onClick={async () => {
                    if (!confirm) return setConfirm(true);
                    setBusy(true);
                    try { await api.deleteTeam(team.id); onChanged(); onClose(); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not delete the team."); setBusy(false); }
                  }}
                  className={confirm ? "font-medium text-red-600" : "text-muted underline hover:text-red-600"}
                >
                  {confirm ? "Click again: boards become personal again" : "Delete team"}
                </button>
              )}
            </div>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
