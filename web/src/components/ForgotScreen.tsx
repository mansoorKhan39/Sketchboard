import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useUI } from "../ui";
import AuthShell from "./AuthShell";

// "Forgot password": ask for the e-mail address; the server always answers the same, so this screen does too.
export default function ForgotScreen() {
  const go = useUI((s) => s.go);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email, like you@example.com.");
    setBusy(true);
    try {
      await api.forgot(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Reset your password" subtitle={sent ? undefined : "We will e-mail you a link to choose a new one."}>
      {sent ? (
        <div data-testid="forgot-sent" className="text-center text-sm">
          <p>If an account exists for <b>{email.trim()}</b>, a link is on its way. It works for 30 minutes.</p>
          <p className="mt-2 text-muted">Nothing there? Check your spam folder, or try again in a minute.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <label className="block text-sm font-medium">
            Email
            <input className="field mt-1.5" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" data-testid="forgot-email" />
          </label>
          {error && (
            <p role="alert" data-testid="forgot-error" className="fade-in rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>
          )}
          <button type="submit" disabled={busy} data-testid="forgot-submit" className="h-10 w-full rounded-[10px] bg-brand text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-60">
            {busy ? "Please wait…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <button className="font-medium text-brand hover:underline" onClick={() => go({ name: "auth" })}>Back to sign in</button>
      </p>
    </AuthShell>
  );
}
