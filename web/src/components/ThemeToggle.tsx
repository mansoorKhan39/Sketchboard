import { useUI } from "../ui";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useUI((s) => s.theme);
  const toggle = useUI((s) => s.toggleTheme);
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      data-testid="theme-toggle"
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
        )}
      </svg>
    </button>
  );
}
