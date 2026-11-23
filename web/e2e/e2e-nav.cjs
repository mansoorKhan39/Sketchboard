// Stage 15: moving around the board like a real app: wheel, trackpad, middle mouse, hand tool, arrow keys,
// zoom shortcuts, zoom menu, minimap, no browser page zoom, edge scrolling, touch pinch.
// Needs `npm run dev` on port 5173 and the user alice@example.com / "alice password 1" (see README).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const vp = () => p.evaluate(() => { const v = window.__board.getState().viewport; return { x: v.x, y: v.y, s: v.scale }; });
  const near = (a, c, e = 0.5) => Math.abs(a - c) <= e;

  await p.goto('http://localhost:5173/#/login'); await p.waitForTimeout(700);
  await p.getByTestId('auth-email').fill('alice@example.com'); await p.getByTestId('auth-password').fill('alice password 1');
  await p.getByTestId('auth-submit').click(); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);
  // some content: two stickies far apart (placed by the store so the test does not depend on clicking)
  await p.evaluate(() => {
    const s = window.__board.getState();
    s.addObject({ id: 'n1', type: 'sticky', x: 100, y: 100, width: 180, height: 180, rotation: 0, text: 'left', color: '#FFD43B', by: 'x' });
    s.addObject({ id: 'n2', type: 'sticky', x: 2600, y: 1500, width: 180, height: 180, rotation: 0, text: 'far', color: '#69DB7C', by: 'x' });
    s.setViewport({ x: 0, y: 0, scale: 1 });
    s.select([]); // (adding an object selects it)
  });
  await p.waitForTimeout(300);

  // 1. wheel zooms about the pointer (mouse wheel = big whole-number steps), smoothly
  const worldBefore = await p.evaluate(() => { const v = window.__board.getState().viewport; return { x: (640 - v.x) / v.scale, y: (400 - v.y) / v.scale }; });
  await p.mouse.move(640, 400); await p.mouse.wheel(0, -100); await p.waitForTimeout(80);
  const mid = await vp();
  await p.waitForTimeout(600);
  const z1 = await vp();
  ok('mouse wheel up zooms in (about 12% a click)', z1.s > 1.1 && z1.s < 1.16);
  ok('zoom is smooth: it was part-way after 80 ms', mid.s > 1 && mid.s < z1.s - 0.01);
  const worldAfter = { x: (640 - z1.x) / z1.s, y: (400 - z1.y) / z1.s };
  ok('the point under the pointer did not move', near(worldBefore.x, worldAfter.x, 1) && near(worldBefore.y, worldAfter.y, 1));
  await p.mouse.wheel(0, 100); await p.waitForTimeout(600);
  ok('one click down undoes one click up', near((await vp()).s, 1, 0.01));
  ok('the % label follows', (await p.getByTestId('zoom').textContent()).trim() === '100%');

  // 2. trackpad-style scrolling (small fractional deltas) pans; Shift+wheel slides sideways
  const t0 = await vp();
  await p.mouse.wheel(12.5, 30.25); await p.waitForTimeout(100);
  const t1 = await vp();
  ok('trackpad swipe pans (zoom unchanged)', near(t1.s, t0.s, 1e-9) && t1.y < t0.y - 20 && t1.x < t0.x - 5);
  await p.keyboard.down('Shift'); await p.mouse.wheel(0, 100); await p.keyboard.up('Shift'); await p.waitForTimeout(150);
  const t2 = await vp();
  ok('Shift + wheel slides sideways', t2.x < t1.x - 50 && near(t2.y, t1.y, 1) && near(t2.s, t1.s, 1e-9));

  // 3. Ctrl+wheel zooms and the browser does not zoom the page itself
  await p.evaluate(() => window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }));
  await p.keyboard.down('Control'); await p.mouse.wheel(0, -100); await p.keyboard.up('Control'); await p.waitForTimeout(600);
  ok('Ctrl + wheel zooms the board', (await vp()).s > 1.1);
  ok('page itself is not zoomed (visual viewport scale 1)', (await p.evaluate(() => window.visualViewport.scale)) === 1);

  // 4. middle mouse drag pans
  await p.evaluate(() => window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }));
  await p.mouse.move(700, 500); await p.mouse.down({ button: 'middle' }); await p.mouse.move(760, 540, { steps: 4 }); await p.mouse.up({ button: 'middle' });
  const m1 = await vp();
  ok('middle-button drag pans the board exactly by the drag', near(m1.x, 60, 1) && near(m1.y, 40, 1));
  ok('nothing got selected or drawn by it', (await p.evaluate(() => window.__board.getState().selectedIds.length)) === 0);

  // 5. Hand tool (H): drag pans, objects do not move; V goes back
  await p.keyboard.press('h'); await p.waitForTimeout(100);
  ok('H switches to the Hand tool', (await p.evaluate(() => window.__board.getState().tool)) === 'hand');
  const n1before = await p.evaluate(() => window.__board.getState().objects.find(o => o.id === 'n1').x);
  const sx = m1.x + 190, sy = m1.y + 190; // on top of sticky n1
  await p.mouse.move(sx, sy); await p.mouse.down(); await p.mouse.move(sx + 100, sy + 50, { steps: 5 }); await p.mouse.up();
  const h1 = await vp();
  ok('dragging with Hand pans the board', near(h1.x, m1.x + 100, 1) && near(h1.y, m1.y + 50, 1));
  ok('...and does not move the sticky under it', (await p.evaluate(() => window.__board.getState().objects.find(o => o.id === 'n1').x)) === n1before);
  await p.keyboard.press('v');
  ok('V goes back to Select', (await p.evaluate(() => window.__board.getState().tool)) === 'select');

  // 6. Space + drag still pans
  await p.keyboard.down('Space'); await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(380, 380, { steps: 3 }); await p.mouse.up(); await p.keyboard.up('Space');
  const sp = await vp();
  ok('Space + drag pans', near(sp.x, h1.x - 20, 1) && near(sp.y, h1.y - 20, 1));

  // 7. arrow keys: nothing selected = move the view; selected = nudge the object
  await p.evaluate(() => { window.__board.getState().select([]); window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }); });
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(80);
  ok('arrow with nothing selected moves the view (looks right)', near((await vp()).x, -60, 1));
  await p.evaluate(() => window.__board.getState().select(['n1']));
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Shift+ArrowDown'); await p.waitForTimeout(80);
  const n1 = await p.evaluate(() => { const o = window.__board.getState().objects.find(o => o.id === 'n1'); return { x: o.x, y: o.y }; });
  ok('arrow nudges the selected object 1, Shift+arrow 10', n1.x === 99 && n1.y === 110);
  ok('...and the view did not move', near((await vp()).x, -60, 1));

  // 8. zoom shortcuts
  await p.evaluate(() => window.__board.getState().select([]));
  await p.keyboard.press('Control+='); await p.waitForTimeout(500);
  ok('Ctrl + = zooms in 25%', near((await vp()).s, 1.25, 0.01));
  await p.keyboard.press('Control+-'); await p.waitForTimeout(500);
  ok('Ctrl + - zooms out', near((await vp()).s, 1, 0.01));
  await p.keyboard.press('Control+='); await p.waitForTimeout(400);
  await p.keyboard.press('Control+0'); await p.waitForTimeout(500);
  ok('Ctrl + 0 goes back to 100%', near((await vp()).s, 1, 0.01));
  await p.keyboard.press('Shift+1'); await p.waitForTimeout(600);
  const fit = await vp();
  const seen = await p.evaluate(() => { const v = window.__board.getState().viewport; return [100, 2600 + 180].map((x) => x * v.scale + v.x); });
  ok('Shift+1 shows everything (both stickies on screen)', fit.s < 0.5 && seen[0] > 0 && seen[1] < 1280);
  await p.evaluate(() => window.__board.getState().select(['n2']));
  await p.keyboard.press('Shift+2'); await p.waitForTimeout(600);
  const sel = await vp();
  const c = await p.evaluate(() => { const v = window.__board.getState().viewport; return { x: (2600 + 90) * v.scale + v.x, y: (1500 + 90) * v.scale + v.y }; });
  ok('Shift+2 zooms in on the selection and centres it', sel.s > fit.s * 2 && near(c.x, 640, 3) && near(c.y, 400, 3));

  // 9. zoom menu
  await p.evaluate(() => { window.__board.getState().select([]); window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }); });
  await p.getByTestId('zoom').click(); await p.waitForTimeout(200);
  ok('clicking the % opens the zoom menu', (await p.getByTestId('zoom-menu').count()) === 1);
  await p.getByRole('menuitem', { name: '200%' }).click(); await p.waitForTimeout(600);
  ok('menu: 200% sets 200%', near((await vp()).s, 2, 0.02) && (await p.getByTestId('zoom-menu').count()) === 0);
  await p.getByTestId('zoom').click(); await p.getByRole('menuitem', { name: /Zoom to fit/ }).click(); await p.waitForTimeout(600);
  ok('menu: Zoom to fit works', (await vp()).s < 0.5);
  await p.getByTestId('zoom').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('Escape closes the menu', (await p.getByTestId('zoom-menu').count()) === 0);
  await p.getByTestId('zoom').click(); await p.mouse.click(300, 300); await p.waitForTimeout(150);
  ok('clicking outside closes the menu', (await p.getByTestId('zoom-menu').count()) === 0);

  // 10. wheel setting: Scrolls = the plain wheel pans instead of zooming; remembered after reload
  await p.evaluate(() => window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }));
  await p.getByTestId('zoom').click(); await p.getByTestId('wheel-scroll').click(); await p.keyboard.press('Escape');
  await p.mouse.move(640, 400); await p.mouse.wheel(0, 100); await p.waitForTimeout(200);
  const w1 = await vp();
  ok('"Scrolls" mode: wheel pans, zoom stays', near(w1.s, 1, 1e-9) && w1.y < -50);
  ok('setting is remembered', (await p.evaluate(() => JSON.parse(localStorage.getItem('sketchboard.nav')).wheelMode)) === 'scroll');
  await p.getByTestId('zoom').click(); await p.getByTestId('wheel-zoom').click(); await p.keyboard.press('Escape');

  // 11. minimap: shows the board; clicking it jumps there; can be hidden
  await p.evaluate(() => window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }));
  await p.waitForTimeout(200);
  ok('minimap is shown', (await p.getByTestId('minimap').count()) === 1);
  const mb = await p.getByTestId('minimap').boundingBox();
  await p.mouse.click(mb.x + mb.width - 14, mb.y + mb.height - 14); await p.waitForTimeout(150);
  const jumped = await p.evaluate(() => { const v = window.__board.getState().viewport; return { x: (640 - v.x) / v.scale, y: (400 - v.y) / v.scale }; });
  ok('clicking the bottom-right of the minimap moves the view towards the far sticky', jumped.x > 1800 && jumped.y > 1000);
  await p.getByTestId('zoom').click(); await p.getByTestId('minimap-toggle').uncheck(); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('minimap can be hidden', (await p.getByTestId('minimap').count()) === 0);
  await p.getByTestId('zoom').click(); await p.getByTestId('minimap-toggle').check(); await p.keyboard.press('Escape');

  // 12. edge scrolling while dragging a selection box
  await p.evaluate(() => window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }));
  await p.mouse.move(500, 300); await p.mouse.down(); await p.mouse.move(1276, 400, { steps: 6 }); await p.waitForTimeout(500);
  const e1 = await vp(); await p.mouse.up();
  ok('dragging a selection box at the right edge slides the board left', e1.x < -60);

  // 13. two-finger pinch on a touch screen (sent through the browser's touch events)
  await p.evaluate(() => window.__board.getState().setViewport({ x: 0, y: 0, scale: 1 }));
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i })) });
  await touch('touchStart', [[600, 400], [680, 400]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[600 - i * 20, 400], [680 + i * 20, 400]]);
  await touch('touchEnd', []);
  await p.waitForTimeout(150);
  const pz = await vp();
  ok('pinching two fingers apart zooms in', pz.s > 2);
  ok('...and no pen stroke or box was left behind', (await p.evaluate(() => window.__board.getState().objects.filter(o => o.type === 'stroke').length)) === 0);

  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
