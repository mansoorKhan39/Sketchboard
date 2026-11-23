import type { ReactNode } from "react";
import { useUI } from "../ui";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";

// The page frame shared by the account screens (forgot password, reset, profile): logo bar and a centred card.
export default function AuthShell({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  const go = useUI((s) => s.go);
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
      <main className={`relative mx-auto flex flex-col px-5 pb-16 pt-8 sm:pt-14 ${wide ? "max-w-xl" : "max-w-[26rem]"}`}>
        <div className="glass pop-in-center rounded-2xl p-7">
          <div className="flex flex-col items-center text-center">
            <Logo size={44} />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
