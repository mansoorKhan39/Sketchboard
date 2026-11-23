import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { useUI } from "../ui";
import { ApiError } from "../api";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import GoogleButton, { useAuthConfig } from "./GoogleButton";

type Errors = { name?: string; email?: string; password?: string };

const eye = (off: boolean) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 4l16 16" />}
  </svg>
);

export default function AuthScreen() {
  const go = useUI((s) => s.go);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const config = useAuthConfig();

  // Quick checks in the browser, so people see what to fix without waiting for the server.
  const check = (): Errors => {
    const e: Errors = {};
    if (mode === "register" && !name.trim()) e.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = "Enter a valid email, like you@example.com.";
    if (!password) e.password = "Enter your password.";
    else if (mode === "register" && password.length < 8) e.password = "Use at least 8 characters.";
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setError("");
    const e = check();
    setFieldErrors(e);
    if (Object.keys(e).length) return;
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

  const withGoogle = async (credential: string) => {
    setError("");
    setBusy(true);
    try {
      await useAuth.getState().google(credential);
      go({ name: "dashboard" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Google sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const clear = (k: keyof Errors) => setFieldErrors((f) => (f[k] ? { ...f, [k]: undefined } : f));
  const msg = (t?: string, id?: string) =>
    t ? (
      <span id={id} role="alert" className="mt-1.5 block text-xs font-normal text-red-500">
        {t}
      </span>
    ) : null;

  return (
    <div className="scroll-page dot-bg relative">
      <div className="glow-bg absolute inset-0" aria-hidden />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <button onClick={() => go({ name: "dashboard" })} className="flex items-center gap-2.5" aria-label="Back to boards">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight">Sketchboard</span>
        </button>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto flex max-w-[26rem] flex-col px-5 pb-16 pt-8 sm:pt-14">
        <div className="glass pop-in-center rounded-2xl p-7">
          <div className="flex flex-col items-center text-center">
            <Logo size={44} />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="mt-1 text-sm text-muted">
              {mode === "login" ? "Sign in to open your boards on any device." : "Free. Your boards are saved to your account."}
            </p>
          </div>

          {config?.google && (
            <div className="mt-7">
              <GoogleButton onCredential={(c) => void withGoogle(c)} text={mode === "login" ? "signin_with" : "signup_with"} />
              <div className="mt-5 flex items-center gap-3 text-xs text-muted" aria-hidden>
                <span className="h-px flex-1 bg-line" />
                or use email
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <form onSubmit={submit} className={`${config?.google ? "mt-5" : "mt-7"} space-y-4`} noValidate>
            {mode === "register" && (
              <label className="block text-sm font-medium">
                Name
                <input
                  className="field mt-1.5"
                  value={name}
                  onChange={(e) => { setName(e.target.value); clear("name"); }}
                  autoComplete="name"
                  aria-invalid={!!fieldErrors.name}
                  data-testid="auth-name"
                />
                {msg(fieldErrors.name)}
              </label>
            )}
            <label className="block text-sm font-medium">
              Email
              <input
                className="field mt-1.5"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clear("email"); }}
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={!!fieldErrors.email}
                data-testid="auth-email"
              />
              {msg(fieldErrors.email)}
            </label>
            <label className="block text-sm font-medium">
              Password
              <div className="relative mt-1.5">
                <input
                  className="field pr-11"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clear("password"); }}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  aria-invalid={!!fieldErrors.password}
                  data-testid="auth-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  aria-pressed={show}
                  data-testid="auth-show"
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
                >
                  {eye(show)}
                </button>
              </div>
              {fieldErrors.password ? msg(fieldErrors.password) : mode === "register" && <span className="mt-1.5 block text-xs font-normal text-muted">At least 8 characters.</span>}
            </label>
            {mode === "login" && config?.resetEmail && (
              <div className="-mt-2 text-right">
                <button type="button" className="text-xs font-medium text-brand hover:underline" onClick={() => go({ name: "forgot" })} data-testid="auth-forgot">
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p role="alert" data-testid="auth-error" className="fade-in rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              data-testid="auth-submit"
              className="h-10 w-full rounded-[10px] bg-brand text-sm font-medium text-white shadow-[0_1px_2px_rgb(79_70_229/0.4),0_6px_14px_-6px_rgb(79_70_229/0.6)] hover:bg-brand-strong disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {mode === "login" ? "New here? " : "Already have an account? "}
            <button
              className="font-medium text-brand hover:underline"
              data-testid="auth-switch"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setFieldErrors({});
              }}
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
        <button className="mt-5 self-center text-sm text-muted hover:text-ink hover:underline" onClick={() => go({ name: "dashboard" })}>
          Continue without an account
        </button>
      </main>
    </div>
  );
}
