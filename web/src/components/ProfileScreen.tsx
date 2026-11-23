import { useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useUI } from "../ui";
import Avatar from "./Avatar";
import AuthShell from "./AuthShell";

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="border-t border-line pt-5 first:border-0 first:pt-0">
    <h2 className="mb-3 text-sm font-semibold">{title}</h2>
    {children}
  </section>
);
const Note = ({ kind, children, testid }: { kind: "ok" | "error"; children: ReactNode; testid?: string }) => (
  <p role={kind === "error" ? "alert" : "status"} data-testid={testid} className={`fade-in mt-3 rounded-lg px-3 py-2 text-sm ${kind === "ok" ? "bg-emerald-500/10 text-emerald-600" : "border border-red-500/20 bg-red-500/10 text-red-500"}`}>
    {children}
  </p>
);
const msgOf = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

// Your account: name, how you sign in, password, and deleting the account.
export default function ProfileScreen() {
  const user = useAuth((s) => s.user)!;
  const go = useUI((s) => s.go);

  const [name, setName] = useState(user.name);
  const [nameNote, setNameNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwNote, setPwNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [delError, setDelError] = useState("");
  const [busy, setBusy] = useState("");

  const saveName = async (ev: FormEvent) => {
    ev.preventDefault();
    setNameNote(null);
    if (!name.trim()) return setNameNote({ kind: "error", text: "Enter your name." });
    setBusy("name");
    try {
      useAuth.getState().setUser((await api.updateProfile(name.trim())).user);
      setNameNote({ kind: "ok", text: "Name saved." });
    } catch (e) {
      setNameNote({ kind: "error", text: msgOf(e) });
    } finally {
      setBusy("");
    }
  };

  const savePassword = async (ev: FormEvent) => {
    ev.preventDefault();
    setPwNote(null);
    if (user.hasPassword && !current) return setPwNote({ kind: "error", text: "Enter your current password." });
    if (next.length < 8) return setPwNote({ kind: "error", text: "Use at least 8 characters for the new password." });
    setBusy("pw");
    try {
      useAuth.getState().setUser((await api.changePassword(user.hasPassword ? current : undefined, next)).user);
      setCurrent("");
      setNext("");
      setPwNote({ kind: "ok", text: user.hasPassword ? "Password changed." : "Password added. You can now sign in with email too." });
    } catch (e) {
      setPwNote({ kind: "error", text: msgOf(e) });
    } finally {
      setBusy("");
    }
  };

  const remove = async (ev: FormEvent) => {
    ev.preventDefault();
    setDelError("");
    setBusy("delete");
    try {
      await api.deleteAccount(confirm);
      useAuth.getState().signedOut();
      useUI.getState().showToast("Your account was deleted.");
      go({ name: "landing" });
    } catch (e) {
      setDelError(msgOf(e));
    } finally {
      setBusy("");
    }
  };

  const btn = "h-9 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60";
  return (
    <AuthShell title="Your account" wide>
      <div className="space-y-6">
        <Section title="Profile">
          <div className="flex items-center gap-4">
            <Avatar user={user} size={56} />
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium" data-testid="profile-email">{user.email}</div>
              <div className="text-xs text-muted">Your email is how you sign in. It cannot be changed here.</div>
            </div>
          </div>
          <form onSubmit={saveName} className="mt-4 flex gap-2" noValidate>
            <input className="field flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" autoComplete="name" data-testid="profile-name" />
            <button className={btn} disabled={busy === "name" || name.trim() === user.name} data-testid="profile-save-name">Save</button>
          </form>
          {nameNote && <Note kind={nameNote.kind} testid="profile-name-note">{nameNote.text}</Note>}
        </Section>

        <Section title="How you sign in">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between"><span>Google</span><span className={user.google ? "text-emerald-600" : "text-muted"} data-testid="profile-google">{user.google ? "Connected" : "Not connected (sign in with Google once to connect)"}</span></li>
            <li className="flex items-center justify-between"><span>Email and password</span><span className={user.hasPassword ? "text-emerald-600" : "text-muted"} data-testid="profile-haspw">{user.hasPassword ? "On" : "Not set"}</span></li>
          </ul>
          <form onSubmit={savePassword} className="mt-4 space-y-3" noValidate>
            {user.hasPassword && (
              <input className="field" type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" aria-label="Current password" data-testid="profile-current" />
            )}
            <input className="field" type="password" placeholder={user.hasPassword ? "New password (8+ characters)" : "Add a password (8+ characters)"} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-label="New password" data-testid="profile-new" />
            <button className={btn} disabled={busy === "pw"} data-testid="profile-save-pw">{user.hasPassword ? "Change password" : "Add password"}</button>
          </form>
          {pwNote && <Note kind={pwNote.kind} testid="profile-pw-note">{pwNote.text}</Note>}
        </Section>

        <Section title="Delete account">
          <p className="text-sm text-muted">This removes your account and every board you own, for good. Boards shared with other people disappear for them too.</p>
          <form onSubmit={remove} className="mt-3 space-y-3" noValidate>
            <input className="field" placeholder={`Type ${user.email} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm email" autoComplete="off" data-testid="profile-confirm" />
            <button className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50" disabled={busy === "delete" || confirm.trim().toLowerCase() !== user.email} data-testid="profile-delete">
              Delete my account
            </button>
          </form>
          {delError && <Note kind="error" testid="profile-delete-error">{delError}</Note>}
        </Section>
      </div>
      <p className="mt-6 text-center text-sm">
        <button className="font-medium text-brand hover:underline" onClick={() => go({ name: "dashboard" })} data-testid="profile-back">Back to my boards</button>
      </p>
    </AuthShell>
  );
}
