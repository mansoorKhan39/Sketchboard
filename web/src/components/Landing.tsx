// The first thing a signed-out visitor sees: what Sketchboard is, and a small board that draws itself.
// Pure CSS animation (see .demo-* in index.css), so it costs nothing and stops for people who prefer less motion.
export default function Landing({ onStart, onLogin }: { onStart: () => void; onLogin: () => void }) {
  return (
    <section className="grid items-center gap-10 pt-8 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:pt-14" data-testid="landing">
      <div className="rise-in">
        <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Think together
          <br />
          on one endless board.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
          Sticky notes, shapes, drawing and live cursors. Free, no card, and your boards open the same on every device.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={onStart}
            data-testid="get-started"
            className="h-11 rounded-[10px] bg-brand px-6 text-sm font-medium text-white shadow-[0_1px_2px_rgb(79_70_229/0.4),0_8px_18px_-8px_rgb(79_70_229/0.7)] hover:bg-brand-strong"
          >
            Get started
          </button>
          <button onClick={onLogin} data-testid="landing-login" className="h-11 rounded-[10px] border border-line bg-surface px-5 text-sm font-medium hover:border-brand hover:bg-brand-soft">
            Log in
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">No account needed to start. Sign in later to keep boards on every device.</p>
      </div>

      <div className="glass dot-bg relative mx-auto aspect-[16/10] w-full max-w-[34rem] overflow-hidden rounded-2xl" aria-hidden>
        <svg viewBox="0 0 640 400" className="absolute inset-0 h-full w-full">
          {/* sticky note */}
          <g className="demo-note" style={{ transformOrigin: "170px 150px" }}>
            <rect x="70" y="70" width="190" height="150" rx="4" fill="#FFD43B" style={{ filter: "drop-shadow(0 14px 14px rgb(11 16 32 / 0.22))" }} />
            <rect x="70" y="70" width="190" height="30" rx="4" fill="#fff" opacity="0.22" />
            <path d="M238 220l22-22v22z" fill="#C9A22B" />
            <text x="90" y="128" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="500" fill="#1F2937">Architecture</text>
            <text x="90" y="156" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="500" fill="#1F2937">Review Q3</text>
          </g>
          {/* arrow that draws itself */}
          <path className="demo-line" style={{ "--len": 190 } as React.CSSProperties} d="M262 145 H440" fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" />
          <path className="demo-line" style={{ "--len": 30 } as React.CSSProperties} d="M430 135 L444 145 L430 155" fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* database shape */}
          <g className="demo-note" style={{ animationDelay: "500ms", transformOrigin: "510px 150px" }}>
            <path d="M450 115v70c0 14 28 22 60 22s60-8 60-22v-70" fill="#DBE4FF" stroke="#7C8DE0" strokeWidth="2" />
            <ellipse cx="510" cy="115" rx="60" ry="20" fill="#EEF2FF" stroke="#7C8DE0" strokeWidth="2" />
            <text x="510" y="163" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="20" fill="#27305c">DB</text>
          </g>
          {/* a small flow drawn by hand */}
          <g fill="none" stroke="#4F46E5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
            <rect className="demo-line" style={{ "--len": 240, animationDelay: "1100ms" } as React.CSSProperties} x="150" y="290" width="70" height="46" rx="3" />
            <path className="demo-line" style={{ "--len": 90, animationDelay: "1500ms" } as React.CSSProperties} d="M220 313 C260 313 270 280 310 280" />
            <rect className="demo-line" style={{ "--len": 220, animationDelay: "1700ms" } as React.CSSProperties} x="310" y="258" width="64" height="40" rx="3" />
            <path className="demo-line" style={{ "--len": 90, animationDelay: "1900ms" } as React.CSSProperties} d="M220 322 C260 322 270 350 310 350" />
            <rect className="demo-line" style={{ "--len": 220, animationDelay: "2100ms" } as React.CSSProperties} x="310" y="330" width="64" height="40" rx="3" />
          </g>
        </svg>
        {/* a collaborator's cursor drifting over the board */}
        <div className="demo-cursor absolute left-[52%] top-[62%]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#E8590C" stroke="white" strokeWidth="1.5" strokeLinejoin="round" style={{ filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))" }}>
            <path d="M5 3l14 8-6 2-2 6z" />
          </svg>
          <span className="ml-4 -mt-1 inline-block rounded-full bg-[#E8590C] px-2 py-0.5 text-[11px] font-medium text-white shadow-[0_2px_6px_rgb(0_0_0/0.3)]">Aisha</span>
        </div>
      </div>
    </section>
  );
}
