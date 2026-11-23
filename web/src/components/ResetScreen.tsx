import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useUI } from "../ui";
import AuthShell from "./AuthShell";

// Opened from the link in the e-mail (#/reset/<secret>). Choosing a new password also signs the person in.
export default function ResetScreen({ token }: { token: string }) {
  const go = useUI((s) => s.go);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError("");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== again) return setError("The two passwords are not the same.");
    setBusy(true);
    try {
      const { user } = await api.reset(token, password);
      useAuth.getState().setUser(user);
      useUI.getState().showToast("Password changed. You are signed in.");
      go({ name: "dashboard" });
    } catch (err) {
      if (err instanceof ApiError && err.code === "bad_reset") setExpired(true);
      else setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (expired)
    return (
      <AuthShell title="Link not valid">
        <p data-testid="reset-expired" className="text-center text-sm text-muted">This reset link has expired or was already used.</p>
        <button onClick={() => go({ name: "forgot" })} className="mt-5 h-10 w-full rounded-[10px] bg-brand text-sm font-medium text-white hover:bg-brand-strong">Get a new link</button>
      </AuthShell>
    );

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <label className="block text-sm font-medium">
          New password
          <input className="field mt-1.5" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" data-testid="reset-password" />
        </label>
        <label className="block text-sm font-medium">
          Type it again
          <input className="field mt-1.5" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" data-testid="reset-again" />
        </label>
        {error && (
          <p role="alert" data-testid="reset-error" className="fade-in rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
        )}
        <button type="submit" disabled={busy} data-testid="reset-submit" className="h-10 w-full rounded-[10px] bg-brand text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">
          {busy ? "Please wait…" : "Save password"}
        </button>
      </form>
    </AuthShell>
  );
}
