import { useEffect, useState } from "react";
import Canvas from "./components/Canvas";
import Toolbar from "./components/Toolbar";
import PropertiesPanel from "./components/PropertiesPanel";
import BottomBars from "./components/BottomBars";
import TopBar from "./components/TopBar";
import EmptyHint from "./components/EmptyHint";
import CommentLayer from "./components/CommentLayer";
import { ExtrasBar, ReactionLayer, TimerBar, VoteLayer } from "./components/Extras";
import Presenter from "./components/Presenter";
import PeerCursors from "./components/PeerCursors";
import Dashboard from "./components/Dashboard";
import AuthScreen from "./components/AuthScreen";
import ForgotScreen from "./components/ForgotScreen";
import ResetScreen from "./components/ResetScreen";
import ProfileScreen from "./components/ProfileScreen";
import Logo from "./components/Logo";
import { useAuth } from "./auth";
import { useShortcuts } from "./useShortcuts";
import { useFollow } from "./useFollow";
import { useBoard } from "./store";
import { isEmbed, useUI } from "./ui";

function BoardScreen() {
  const spaceDown = useShortcuts();
  useFollow();
  const presenting = useBoard((s) => s.present !== null);
  const [embed] = useState(isEmbed);
  if (embed) {
    // inside someone else's page: just the board to look at, a zoom control, and a link to open it properly
    return (
      <div className="relative h-full w-full overflow-hidden" style={{ backgroundImage: "radial-gradient(var(--dot) 1.2px, transparent 1.2px)", backgroundSize: "24px 24px" }} data-testid="embed">
        <Canvas spaceDown={spaceDown} />
        <PeerCursors />
        <BottomBars />
        <a
          href={window.location.href.replace(/[?&]embed=1/, "")}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium shadow-sm hover:border-brand"
        >
          <Logo size={16} /> Open in Sketchboard
        </a>
      </div>
    );
  }
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        // dotted grid, coloured by the theme
        backgroundImage: "radial-gradient(var(--dot) 1.2px, transparent 1.2px)",
        backgroundSize: "24px 24px",
      }}
    >
      <Canvas spaceDown={spaceDown} />
      <PeerCursors />
      <ReactionLayer />
      <TimerBar />
      {presenting ? (
        <Presenter />
      ) : (
        <>
          <CommentLayer />
          <VoteLayer />
          <ExtrasBar />
          <TopBar />
          <Toolbar />
          <PropertiesPanel />
          <BottomBars />
          <EmptyHint />
        </>
      )}
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  const go = useUI((s) => s.go);
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <Logo size={40} />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">{text}</p>
        <button onClick={() => go({ name: "dashboard" })} className="mt-5 h-9 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-strong">
          Go to my boards
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const view = useUI((s) => s.view);
  const theme = useUI((s) => s.theme);
  const go = useUI((s) => s.go);
  const authReady = useAuth((s) => s.ready);
  const userId = useAuth((s) => s.user?.id);
  const openId = useBoard((s) => s.boardId);
  const wantedId = view.name === "board" ? view.id : null;
  const sharedToken = view.name === "shared" ? view.token : null;
  const mode = useBoard((s) => s.mode);
  const loaded = useBoard((s) => s.loaded);
  const notice = useBoard((s) => s.notice);
  const [sharedError, setSharedError] = useState("");

  // apply the theme to <html> so the CSS variables switch
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // find out who is signed in (reads the session cookie via /auth/me)
  useEffect(() => {
    void useAuth.getState().init();
  }, []);

  // open / close the saved board to match the address bar (after we know whether you are signed in)
  useEffect(() => {
    if (!authReady) return;
    if (sharedToken) {
      setSharedError("");
      void useBoard.getState().openShared(sharedToken).then((r) => {
        if (r === "missing") setSharedError("This link is not active. Ask the owner for a new link.");
        if (r === "unavailable") setSharedError("Live boards are not available on this server right now.");
      });
    } else if (wantedId) {
      void useBoard.getState().openBoard(wantedId).then((r) => {
        if (r === "missing") go({ name: "dashboard" }); // unknown board id, or not yours
      });
    } else {
      useBoard.getState().closeBoard();
    }
  }, [wantedId, sharedToken, authReady, userId, go]);

  if (!authReady)
    return (
      <div className="flex h-full items-center justify-center">
        <Logo size={40} />
      </div>
    );
  if (view.name === "auth") return <AuthScreen />;
  if (view.name === "forgot") return <ForgotScreen />;
  if (view.name === "reset") return <ResetScreen token={view.token} />;
  if (view.name === "profile") return userId ? <ProfileScreen /> : <AuthScreen />;
  if (sharedToken) {
    if (sharedError) return <Message title="Cannot open this board" text={sharedError} />;
    if (mode === "shared" && useBoard.getState().sharedToken === sharedToken) {
      if (loaded) return <BoardScreen />;
      if (notice) return <Message title="Cannot open this board" text={notice} />;
    }
    return (
      <div className="flex h-full items-center justify-center">
        <Logo size={40} />
      </div>
    );
  }
  if (wantedId && openId === wantedId && mode === "owned") return <BoardScreen />;
  if (wantedId) return null; // board is loading
  return <Dashboard />;
}
