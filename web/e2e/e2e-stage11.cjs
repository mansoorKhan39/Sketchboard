const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const objs = () => p.evaluate(() => window.__board.getState().objects);
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(900);

  // ---- templates ----
  const names = await p.locator('[data-testid^="template-"]').allTextContents();
  ok('dashboard offers 9 templates: ' + names.length, names.length === 9);
  await p.locator('[data-testid="template-mindmap"]').click(); await p.waitForTimeout(900);
  let o = await objs();
  ok('Mind map template: 13 objects, 6 links', o.length === 13 && o.filter(x => x.type === 'connector').length === 6);
  await p.screenshot({ path: 'e2e/out-mindmap.png' });
  await p.getByTestId('tool-select').click();

  // ---- mind map keys ----
  const root = o.find(x => x.type === 'shape');
  await p.evaluate((id) => window.__board.getState().select([id]), root.id); await p.waitForTimeout(100);
  await p.keyboard.press('Tab'); await p.waitForTimeout(200);
  await p.keyboard.type('new child'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  o = await objs();
  const kid = o.find(x => x.type === 'sticky' && x.text === 'new child');
  ok('Tab adds a child note and opens it for typing', !!kid && o.some(x => x.type === 'connector' && x.fromId === root.id && x.toId === kid.id));
  await p.evaluate((id) => window.__board.getState().select([id]), kid.id); await p.waitForTimeout(100);
  await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  await p.keyboard.type('sibling'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  o = await objs();
  const sib = o.find(x => x.type === 'sticky' && x.text === 'sibling');
  ok('Enter adds a sibling under the same parent', !!sib && o.some(x => x.type === 'connector' && x.fromId === root.id && x.toId === sib.id));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok('one undo removes the sibling and its link', !(await objs()).some(x => x.text === 'sibling'));
  await p.evaluate((id) => window.__board.getState().select([id]), kid.id); await p.waitForTimeout(100);
  await p.getByTestId('add-child').click(); await p.waitForTimeout(200); await p.keyboard.type('via button'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('"Add child" button works too', (await objs()).some(x => x.text === 'via button'));

  // ---- private mode ----
  await p.evaluate(() => { const g = window.__board.getState(); g.select([]); g.addObject({ id: 'theirs', type: 'sticky', x: 100, y: 500, width: 180, height: 180, rotation: 0, text: 'secret idea', color: '#FFD43B', by: 'someone-else' }); });
  await p.keyboard.press('n'); await p.mouse.click(800, 600); await p.waitForTimeout(150); await p.keyboard.type('mine'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  const shown = () => p.evaluate(() => (window.Konva ? window.Konva.stages[0].find('Text').map(t => t.text()) : null));
  let texts = await shown();
  if (texts) ok('private off: everyone sees "secret idea"', texts.includes('secret idea'));
  await p.getByTestId('private-toggle').click(); await p.waitForTimeout(250);
  ok('private button is pressed', (await p.getByTestId('private-toggle').getAttribute('aria-pressed')) === 'true');
  texts = await shown();
  if (texts) ok('private on: their note shows dots, mine stays readable', !texts.includes('secret idea') && texts.includes('• • •') && texts.includes('mine'));
  await p.evaluate(() => window.__board.getState().setEditing('theirs')); await p.waitForTimeout(100);
  // double-click on their note must not open an editor
  const vp = await p.evaluate(() => window.__board.getState().viewport);
  await p.evaluate(() => window.__board.getState().setEditing(null));
  await p.mouse.dblclick(100 * vp.scale + vp.x + 60, 500 * vp.scale + vp.y + 60); await p.waitForTimeout(200);
  ok('their hidden note cannot be edited', (await p.evaluate(() => window.__board.getState().editingId)) !== 'theirs');
  await p.getByTestId('private-toggle').click(); await p.waitForTimeout(250);
  texts = await shown();
  if (texts) ok('switched off: revealed again', texts.includes('secret idea'));
  ok('only one settings object after toggling twice', (await objs()).filter(x => x.type === 'settings').length === 1);
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
