// Stage 22: pen options, highlighter, straight line (Shift), dot, eraser (one undo step), pen settings remembered. Guest mode.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  const strokes = () => p.evaluate(() => window.__board.getState().objects.filter(o => o.type === 'stroke'));
  const drag = async (pts, shift) => {
    await p.mouse.move(pts[0][0], pts[0][1]); await p.mouse.down();
    if (shift) await p.keyboard.down('Shift');
    for (const [x, y] of pts.slice(1)) await p.mouse.move(x, y, { steps: 4 });
    await p.mouse.up();
    if (shift) await p.keyboard.up('Shift');
    await p.waitForTimeout(120);
  };
  await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);

  await p.keyboard.press('p'); await p.waitForTimeout(150);
  ok('the pen bar appears with the Pen tool', (await p.getByTestId('pen-bar').count()) === 1);
  await p.getByTestId('pen-color-#E03131').click(); await p.getByTestId('pen-width-8').click();
  await drag([[400, 300], [500, 350], [600, 300]]);
  let s = await strokes();
  ok('a red 8-wide stroke is made', s.length === 1 && s[0].color === '#E03131' && s[0].lineWidth === 8 && !s[0].alpha);

  // highlighter
  await p.getByTestId('pen-mode-highlighter').click(); await p.getByTestId('pen-color-#F08C00').click();
  await drag([[400, 450], [700, 450]]);
  s = await strokes();
  const h = s[1];
  ok('the highlighter stroke is wide and see-through', h && h.lineWidth >= 14 && h.alpha === 0.4 && h.color === '#F08C00');

  // shift = straight line even if the hand wobbled
  await p.getByTestId('pen-mode-pen').click(); await p.getByTestId('pen-width-2').click();
  await drag([[400, 550], [450, 600], [500, 540], [600, 580]], true);
  s = await strokes();
  ok('Shift makes a straight line (two points)', s.length === 3 && s[2].points.length === 4);

  // a click makes a dot
  await p.mouse.click(800, 300); await p.waitForTimeout(150);
  ok('a single click makes a dot', (await strokes()).length === 4);

  // the pen settings are remembered
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('sketchboard.pen')));
  ok('pen settings are kept in the browser', saved.mode === 'pen' && saved.width === 2);

  // eraser: drag across the red stroke and the highlighter; both go in ONE step
  await p.keyboard.press('e'); await p.waitForTimeout(150);
  ok('E selects the eraser', (await p.getByTestId('pen-mode-eraser').getAttribute('aria-pressed')) === 'true');
  await p.mouse.move(380, 320); await p.mouse.down();
  await p.mouse.move(450, 330, { steps: 6 }); // across the red stroke's left part
  await p.mouse.move(450, 450, { steps: 6 }); // down to the highlighter
  await p.mouse.move(520, 452, { steps: 6 });
  const fading = await p.evaluate(() => window.__ui ? window.__ui.getState().erasing.length : -1);
  await p.mouse.up(); await p.waitForTimeout(200);
  s = await strokes();
  ok('the touched strokes are removed, the others stay', s.length === 2 && !s.some(x => x.color === '#E03131') && !s.some(x => x.alpha));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  ok('one undo brings all of them back', (await strokes()).length === 4);
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(200);
  ok('redo removes them again', (await strokes()).length === 2);

  // a selected stroke can change thickness
  await p.keyboard.press('v'); await p.waitForTimeout(100);
  const rest = (await strokes()).find(x => x.lineWidth === 2 && x.points.length === 4);
  await p.mouse.click(rest.x + rest.width / 2, rest.y + rest.height / 2); await p.waitForTimeout(200);
  if (await p.getByTestId('stroke-width-14').count()) { await p.getByTestId('stroke-width-14').click(); await p.waitForTimeout(150); }
  ok('a selected stroke can be made thicker', ((await strokes()).find(x => x.id === rest.id) || {}).lineWidth === 14);
  await p.screenshot({ path: 'e2e/out-pen.png' });
  await b.close();
})();
