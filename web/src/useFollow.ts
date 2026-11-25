import { useEffect } from "react";
import { sendView } from "./realtime/connection";
import { applyFollowView, useBoard } from "./store";

// Follow mode. Everybody tells the others where they are looking (the board point in the middle of the screen + zoom).
// If I follow somebody, my screen copies their view. Moving my own view (pan or zoom) stops following.
export function useFollow() {
  const viewport = useBoard((s) => s.viewport);
  const following = useBoard((s) => s.following);
  const view = useBoard((s) => (s.following ? s.views[s.following] : undefined));

  // tell the others where I am looking
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    sendView((w / 2 - viewport.x) / viewport.scale, (h / 2 - viewport.y) / viewport.scale, viewport.scale);
  }, [viewport]);

  // copy the view of the person I follow
  useEffect(() => {
    if (!following || !view) return;
    applyFollowView(view, window.innerWidth, window.innerHeight);
  }, [following, view]);
}
