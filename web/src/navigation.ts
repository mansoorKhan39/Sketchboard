import { useBoard } from "./store";
import { contentBounds } from "./geometry";
import { blendViews, centreOf, ease, panBy, viewOfRect, zoomAt, zoomTo } from "./viewport";
import type { Viewport } from "./types";

// Moving the view with animation. Everything that changes zoom or position by a button, a key or the wheel goes
// through here, so the board glides instead of jumping. Dragging with the hand is NOT animated (it must follow
// the pointer exactly): it calls `panNow`, which also stops any glide in progress.

let raf = 0;
let glide: { from: Viewport; to: Viewport; start: number; ms: number } | null = null;
let wheelGoal: { scale: number; cx: number; cy: number } | null = null; // where smooth wheel-zooming is heading

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const view = () => useBoard.getState().viewport;
const put = (v: Viewport) => useBoard.getState().setViewport(v);
const size = () => ({ w: window.innerWidth, h: window.innerHeight });

export function stopMotion() {
  cancelAnimationFrame(raf);
  raf = 0;
  glide = null;
  wheelGoal = null;
}

// Go to a view over `ms` milliseconds (or at once if the person asked their system for less motion).
export function flyTo(to: Viewport, ms = 260) {
  stopMotion();
  if (reduced() || ms <= 0) return put(to);
  const { w, h } = size();
  glide = { from: view(), to, start: performance.now(), ms };
  const step = (now: number) => {
    if (!glide) return;
    const t = Math.min(1, (now - glide.start) / glide.ms);
    put(t >= 1 ? glide.to : blendViews(glide.from, glide.to, ease(t), w, h));
    if (t < 1) raf = requestAnimationFrame(step);
    else stopMotion();
  };
  raf = requestAnimationFrame(step);
}

// Mouse-wheel zoom: every click moves the goal, and the view eases towards it (so fast scrolling stays smooth).
export function wheelZoom(factor: number, cx: number, cy: number) {
  if (reduced()) {
    stopMotion();
    return put(zoomAt(view(), factor, cx, cy));
  }
  cancelAnimationFrame(raf);
  glide = null;
  const base = wheelGoal?.scale ?? view().scale;
  const goal = zoomAt({ x: 0, y: 0, scale: base }, factor, 0, 0).scale; // clamps the goal to the allowed range
  wheelGoal = { scale: goal, cx, cy };
  let last = performance.now();
  const step = (now: number) => {
    if (!wheelGoal) return;
    const dt = Math.min(48, now - last);
    last = now;
    const v = view();
    const a = 1 - Math.exp(-dt / 60); // catches up about 70% in 70 ms
    const ratio = wheelGoal.scale / v.scale;
    const done = Math.abs(Math.log(ratio)) < 0.002;
    put(zoomTo(v, done ? wheelGoal.scale : v.scale * Math.pow(ratio, a), wheelGoal.cx, wheelGoal.cy));
    if (done) stopMotion();
    else raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

// Follow the pointer exactly (hand tool, middle mouse, trackpad scroll, arrow keys).
export function panNow(dx: number, dy: number) {
  stopMotion();
  put(panBy(view(), dx, dy));
}

// ---- the actions behind buttons, menu items and shortcuts ----

export function zoomStep(factor: number) {
  const { w, h } = size();
  flyTo(zoomAt(view(), factor, w / 2, h / 2));
}

export function zoomToScale(scale: number) {
  const { w, h } = size();
  flyTo(zoomTo(view(), scale, w / 2, h / 2));
}

// Everything on the board.
export function zoomToFit() {
  const { w, h } = size();
  const box = contentBounds(useBoard.getState().objects, 0);
  flyTo(box ? viewOfRect(box, w, h) : { x: 0, y: 0, scale: 1 });
}

// What is selected (or everything, if nothing is).
export function zoomToSelection() {
  const s = useBoard.getState();
  const picked = s.objects.filter((o) => s.selectedIds.includes(o.id));
  if (!picked.length) return zoomToFit();
  const { w, h } = size();
  const box = contentBounds(picked, 0);
  if (box) flyTo(viewOfRect(box, w, h, 0.7, 2));
}

// Put a board point in the middle of the screen without changing zoom (used by the minimap and "go to").
export function centreOn(x: number, y: number, ms = 0) {
  const { w, h } = size();
  const v = view();
  flyTo({ scale: v.scale, x: w / 2 - x * v.scale, y: h / 2 - y * v.scale }, ms);
}

export const currentCentre = () => {
  const { w, h } = size();
  return centreOf(view(), w, h);
};
