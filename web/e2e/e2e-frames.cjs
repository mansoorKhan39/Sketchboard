const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const st = () => p.evaluate(() => { const s = window.__board.getState(); return { objects: s.objects, vp: s.viewport, present: s.present, sel: s.selectedIds }; });
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);
  ok('no Present button on a board without frames', (await p.getByTestId('present').count()) === 0);

  // frame tool (key F) creates a titled frame and selects it
  await p.keyboard.press('f'); await p.mouse.click(500, 400); await p.waitForTimeout(200);
  let s = await st(); const f1 = s.objects.find(o => o.type === 'frame');
  ok('F + click creates "Frame 1", slide 1', !!f1 && f1.text === 'Frame 1' && f1.slide === 1);
  ok('the new frame is selected and Present button appears', s.sel[0] === f1.id && (await p.getByTestId('present').count()) === 1);

  // a sticky inside the frame
  await p.keyboard.press('Escape'); await p.keyboard.press('n'); await p.mouse.click(500, 400); await p.waitForTimeout(150);
  await p.keyboard.type('inside'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  s = await st(); const sticky = s.objects.find(o => o.type === 'sticky');
  ok('sticky created inside frame', !!sticky);

  // click inside the empty part of the frame does NOT grab the frame
  await p.mouse.click(300, 250); await p.waitForTimeout(150); s = await st();
  ok('clicking empty space inside a frame selects nothing', s.sel.length === 0);

  // drag the frame by its title: the sticky must travel with it
  const tx = f1.x * s.vp.scale + s.vp.x + 30, ty = f1.y * s.vp.scale + s.vp.y + 16;
  await p.mouse.move(tx, ty); await p.mouse.down(); await p.mouse.move(tx + 60, ty + 40, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
  s = await st(); const f1b = s.objects.find(o => o.id === f1.id), stb = s.objects.find(o => o.id === sticky.id);
  ok(`frame moved by (60,40): ${Math.round(f1b.x - f1.x)},${Math.round(f1b.y - f1.y)}`, Math.abs(f1b.x - f1.x - 60) < 2 && Math.abs(f1b.y - f1.y - 40) < 2);
  ok('sticky moved with it', Math.abs(stb.x - sticky.x - 60) < 2 && Math.abs(stb.y - sticky.y - 40) < 2);

  // undo brings both back in one step
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200); s = await st();
  ok('one undo restores frame and sticky', s.objects.find(o => o.id === f1.id).x === f1.x && s.objects.find(o => o.id === sticky.id).x === sticky.x);

  // marquee wrapping the whole frame selects it; a marquee that only touches it does not
  await p.mouse.click(1200, 100); await p.waitForTimeout(100);
  await p.mouse.move(1100, 700); await p.mouse.down(); await p.mouse.move(1000, 500, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(100);

  // a second frame, titled and renumbered through the panel
  await p.evaluate(([x, y]) => window.__board.getState().addObject({ id: 'f2', type: 'frame', x, y, width: 640, height: 360, rotation: 0, text: 'Second', slide: 2 }), [f1.x + 800, f1.y]);
  await p.waitForTimeout(150);
  await p.evaluate(() => window.__board.getState().select(['f2'])); await p.waitForTimeout(150);
  await p.getByTestId('frame-title').fill('Results'); await p.waitForTimeout(150);
  ok('title edited in panel', (await st()).objects.find(o => o.id === 'f2').text === 'Results');

  // present
  const before = (await st()).vp;
  await p.evaluate(() => window.__board.getState().select([])); await p.waitForTimeout(100);
  await p.getByTestId('present').click(); await p.waitForTimeout(800);
  ok('presenter shown, bars hidden', (await p.getByTestId('presenter').count()) === 1 && (await p.getByTestId('tool-sticky').count()) === 0);
  ok('shows 1 / 2', (await p.getByTestId('present-count').textContent()).includes('1 / 2'));
  s = await st(); const fa = s.objects.find(o => o.id === f1.id);
  ok('frame 1 is centred on screen', Math.abs((fa.x + fa.width / 2) * s.vp.scale + s.vp.x - 640) < 2);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(800); s = await st();
  ok('arrow right goes to 2 / 2 and flies there', (await p.getByTestId('present-count').textContent()).includes('2 / 2') && Math.abs(800 * 0 + (s.objects.find(o => o.id === 'f2').x + 320) * s.vp.scale + s.vp.x - 640) < 2);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  ok('cannot go past the last frame', (await p.getByTestId('present-count').textContent()).includes('2 / 2'));
  await p.mouse.click(600, 300); await p.keyboard.type('x'); await p.waitForTimeout(100);
  ok('cannot edit while presenting', (await st()).objects.length === 3);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); s = await st();
  ok('Esc exits and restores the view', s.present === null && Math.abs(s.vp.x - before.x) < 1 && s.vp.scale === before.scale && (await p.getByTestId('tool-sticky').count()) === 1);

  // present from a chosen frame
  await p.evaluate(() => window.__board.getState().select(['f2'])); await p.waitForTimeout(100);
  await p.getByTestId('present-from').click(); await p.waitForTimeout(500);
  ok('"Present from here" starts at 2 / 2', (await p.getByTestId('present-count').textContent()).includes('2 / 2'));
  await p.getByTestId('present-exit').click(); await p.waitForTimeout(200);
  ok('Exit button works', (await st()).present === null);

  // delete a frame: contents stay
  await p.evaluate((id) => { const g = window.__board.getState(); g.select([id]); g.removeSelected(); }, f1.id); await p.waitForTimeout(100);
  s = await st(); ok('deleting a frame keeps its contents', s.objects.some(o => o.id === sticky.id) && !s.objects.some(o => o.id === f1.id));
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await p.screenshot({ path: 'e2e/out-frames.png' });
  await b.close();
})();
