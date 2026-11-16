import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { useUI } from "../ui";
import { ApiError } from "../api";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function AuthScreen() {
  const go = useUI((s) => s.go);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await useAuth.getState().login(email, password);
      else await useAuth.getState().register(name, email, password);
      go({ name: "dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand";

  return (
    <div className="scroll-page">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <button onClick={() => go({ name: "dashboard" })} className="flex items-center gap-2.5" aria-label="Back to boards">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">Sketchboard</span>
        </button>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex max-w-sm flex-col px-6 pt-14">
        <h1 className="text-3xl font-semibold tracking-tight">{mode === "login" ? "Sign in" : "Create your account"}</h1>
        <p className="mt-1 text-[15px] text-muted">
          {mode === "login" ? "Open your boards on any device." : "Free. Your boards are saved to your account."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
          {mode === "register" && (
            <label className="block text-sm font-medium">
              Name
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" data-testid="auth-name" />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" data-testid="auth-email" />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input
              className={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              data-testid="auth-password"
            />
            {mode === "register" && <span className="mt-1 block text-xs font-normal text-muted">At least 8 characters.</span>}
          </label>

          {error && (
            <p role="alert" data-testid="auth-error" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            data-testid="auth-submit"
            className="h-10 w-full rounded-lg bg-brand text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            className="font-medium text-brand hover:underline"
            data-testid="auth-switch"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
        <button className="mt-2 self-start text-sm text-muted hover:text-ink hover:underline" onClick={() => go({ name: "dashboard" })}>
          Continue without an account
        </button>
      </main>
    </div>
  );
}
