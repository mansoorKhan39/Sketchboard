import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_SCALE, MIN_SCALE } from "./constants";
import { arrowStep, blendViews, centreOf, edgePanSpeed, looksLikeMouseWheel, miniMapFrame, panBy, pinchStep, viewOfRect, wheelIntent, zoomAt, zoomTo } from "./viewport";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const wheel = (o: Partial<Parameters<typeof wheelIntent>[0]>) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, shiftKey: false, ...o });

test("zooming keeps the board point under the pointer exactly where it was", () => {
  const v = { x: 40, y: -20, scale: 0.8 };
  const world = { x: (300 - v.x) / v.scale, y: (200 - v.y) / v.scale };
  for (const f of [1.5, 0.4, 2.7]) {
    const z = zoomAt(v, f, 300, 200);
    near(world.x * z.scale + z.x, 300);
    near(world.y * z.scale + z.y, 200);
  }
});

test("zoom never goes past the limits, and at the limit the view does not drift", () => {
  const top = zoomAt({ x: 0, y: 0, scale: MAX_SCALE }, 10, 500, 300);
  assert.equal(top.scale, MAX_SCALE);
  assert.deepEqual([top.x, top.y], [0, 0]);
  assert.equal(zoomAt({ x: 0, y: 0, scale: 1 }, 0.0001, 0, 0).scale, MIN_SCALE);
  near(zoomTo({ x: 0, y: 0, scale: 0.5 }, 1, 100, 100).scale, 1);
});

test("panBy slides the board by screen pixels", () => {
  assert.deepEqual(panBy({ x: 10, y: 10, scale: 2 }, -5, 7), { x: 5, y: 17, scale: 2 });
});

test("a mouse wheel zooms in 'zoom' mode (down = out, up = in), about 12% a click", () => {
  const up = wheelIntent(wheel({ deltaY: -100 }), "zoom");
  const down = wheelIntent(wheel({ deltaY: 100 }), "zoom");
  assert.equal(up.kind, "zoom");
  assert.ok(up.kind === "zoom" && up.factor > 1.1 && up.factor < 1.15);
  assert.ok(down.kind === "zoom" && down.factor < 1);
  // one click up then one click down cancels out
  near((up as { factor: number }).factor * (down as { factor: number }).factor, 1);
});

test("a trackpad two-finger swipe scrolls instead of zooming; the board follows the fingers", () => {
  const swipe = wheelIntent(wheel({ deltaX: 12.5, deltaY: -30.25 }), "zoom");
  assert.deepEqual(swipe, { kind: "pan", dx: -12.5, dy: 30.25 });
  assert.equal(looksLikeMouseWheel(wheel({ deltaY: 3.5 })), false);
  assert.equal(looksLikeMouseWheel(wheel({ deltaY: 120 })), true);
  assert.equal(looksLikeMouseWheel(wheel({ deltaY: 3, deltaMode: 1 })), true); // Firefox: lines
});

test("pinch and Ctrl+wheel zoom in both modes", () => {
  for (const mode of ["zoom", "scroll"] as const) {
    const pinchOut = wheelIntent(wheel({ deltaY: -4, ctrlKey: true }), mode);
    assert.ok(pinchOut.kind === "zoom" && pinchOut.factor > 1);
    assert.equal(wheelIntent(wheel({ deltaY: 100, metaKey: true }), mode).kind, "zoom");
  }
  // a very hard Ctrl+wheel is capped so one flick cannot jump across the whole range
  const hard = wheelIntent(wheel({ deltaY: -5000, ctrlKey: true }), "zoom");
  assert.ok(hard.kind === "zoom" && hard.factor < 2);
});

test("'scroll' mode: the wheel scrolls up/down, Shift+wheel slides sideways", () => {
  assert.deepEqual(wheelIntent(wheel({ deltaY: 100 }), "scroll"), { kind: "pan", dx: -0, dy: -100 });
  assert.deepEqual(wheelIntent(wheel({ deltaY: 100, shiftKey: true }), "scroll"), { kind: "pan", dx: -100, dy: 0 });
  assert.deepEqual(wheelIntent(wheel({ deltaY: 100, shiftKey: true }), "zoom"), { kind: "pan", dx: -100, dy: 0 });
});

test("fitting a rectangle centres it, leaves room, and does not blow a tiny object up", () => {
  const v = viewOfRect({ x: 100, y: 100, width: 400, height: 200 }, 1000, 600);
  const c = centreOf(v, 1000, 600);
  near(c.x, 300);
  near(c.y, 200);
  assert.ok(400 * v.scale <= 1000 * 0.85 + 1e-6);
  assert.ok(viewOfRect({ x: 0, y: 0, width: 5, height: 5 }, 1000, 600).scale <= 1.5);
});

test("pinch: spreading two fingers zooms about their middle, moving them pans", () => {
  const v = { x: 0, y: 0, scale: 1 };
  const z = pinchStep(v, { cx: 100, cy: 100, dist: 100 }, { cx: 100, cy: 100, dist: 200 });
  near(z.scale, 2);
  near(100 * 2 + z.x, 100); // the point between the fingers stayed put
  const p = pinchStep(v, { cx: 100, cy: 100, dist: 100 }, { cx: 130, cy: 90, dist: 100 });
  assert.deepEqual([p.x, p.y, p.scale], [30, -10, 1]);
});

test("edge scrolling: faster the closer to the edge, nothing in the middle", () => {
  assert.equal(edgePanSpeed(500, 1000), 0);
  assert.ok(edgePanSpeed(30, 1000) > 0 && edgePanSpeed(1, 1000) > edgePanSpeed(30, 1000));
  assert.ok(edgePanSpeed(990, 1000) < 0);
  assert.equal(edgePanSpeed(-50, 1000), 18); // never faster than the maximum
});

test("arrow keys move 1, or 10 with Shift", () => {
  assert.equal(arrowStep(false), 1);
  assert.equal(arrowStep(true), 10);
});

test("a flight between two views starts and ends exactly on them, and zooms smoothly in between", () => {
  const a = { x: 0, y: 0, scale: 1 }, b = { x: -3000, y: -1000, scale: 0.25 };
  const s = blendViews(a, b, 0, 1000, 600), e = blendViews(a, b, 1, 1000, 600);
  near(s.scale, 1); near(s.x, 0); near(s.y, 0);
  near(e.scale, 0.25); near(e.x, -3000); near(e.y, -1000);
  near(blendViews(a, b, 0.5, 1000, 600).scale, 0.5); // halfway in log space
});

test("minimap: board and box coordinates convert both ways", () => {
  const m = miniMapFrame({ x: -100, y: -50, width: 800, height: 400 }, { w: 160, h: 100 });
  const p = m.toMini(300, 150);
  const back = m.toWorld(p.x, p.y);
  near(back.x, 300); near(back.y, 150);
  const tl = m.toMini(-100, -50), br = m.toMini(700, 350);
  assert.ok(tl.x >= -1e-9 && tl.y >= -1e-9 && br.x <= 160 + 1e-9 && br.y <= 100 + 1e-9);
});
