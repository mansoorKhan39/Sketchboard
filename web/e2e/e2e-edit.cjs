// Stage 17: editing tools: snapping + guides, grid, align/distribute, group, lock, layer order, new shapes, arrow styles.
// Guest mode. Needs `npm run dev` on port 5173.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const objs = () => p.evaluate(() => window.__board.getState().objects);
  const get = async id => (await objs()).find(o => o.id === id);
  const sel = () => p.evaluate(() => window.__board.getState().selectedIds);
  const add = (id, x, y, w = 120, h = 100, extra = {}) => p.evaluate(([id, x, y, w, h, extra]) => window.__board.getState().addObject({ id, type: 'sticky', x, y, width: w, height: h, rotation: 0, text: id, color: '#FFD43B', by: 'x', ...extra }), [id, x, y, w, h, extra]);
  const pick = ids => p.evaluate(ids => window.__board.getState().select(ids), ids);
  const reset = async () => { await p.evaluate(() => { const s = window.__board.getState(); s.restoreObjects([]); s.setViewport({ x: 0, y: 0, scale: 1 }); s.select([]); }); await p.waitForTimeout(100); };
  const drag = async (x, y, dx, dy, alt = false) => { await p.mouse.move(x, y); if (alt) await p.keyboard.down('Alt'); await p.mouse.down(); await p.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await p.mouse.move(x + dx, y + dy, { steps: 4 }); const g = await p.evaluate(() => 0); await p.mouse.up(); if (alt) await p.keyboard.up('Alt'); await p.waitForTimeout(150); };
  const near = (a, c, e = 0.6) => Math.abs(a - c) <= e;

  await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);

  // 1. snapping: A at y=200; drag B so its top is 3 above/below A's top -> it jumps onto A's top line
  await add('A', 200, 200); await add('B', 500, 300); await pick([]);
  await p.mouse.move(560, 350); await p.mouse.down(); await p.mouse.move(560, 300, { steps: 4 }); await p.mouse.move(560, 247, { steps: 4 });
  const live = await p.evaluate(() => document.querySelectorAll('canvas').length); // (just keep the page busy)
  await p.mouse.up(); await p.waitForTimeout(200);
  let B = await get('B');
  ok('dragging near another object snaps its top to the same line', near(B.y, 200) && near(B.x, 500));

  // 2. hold Alt: no snapping
  await reset(); await add('A', 200, 200); await add('B', 500, 300); await pick([]);
  await drag(560, 350, 0, -97, true);
  B = await get('B');
  ok('Alt turns snapping off for that drag', near(B.y, 203));

  // 3. turn snapping off in the menu
  await reset(); await add('A', 200, 200); await add('B', 500, 300); await pick([]);
  await p.getByTestId('zoom').click(); await p.getByTestId('snap-toggle').uncheck(); await p.keyboard.press('Escape');
  await drag(560, 350, 0, -97);
  ok('with "Snap to other objects" off nothing snaps', near((await get('B')).y, 203));
  await p.getByTestId('zoom').click(); await p.getByTestId('snap-toggle').check(); await p.keyboard.press('Escape');
  ok('the setting is remembered in this browser', await p.evaluate(() => JSON.parse(localStorage.getItem('sketchboard.nav')).snap === true));

  // 4. grid snapping
  await reset(); await add('G', 203, 217); await pick([]);
  await p.getByTestId('zoom').click(); await p.getByTestId('grid-toggle').check(); await p.keyboard.press('Escape');
  await drag(260, 260, 33, 21);
  const G = await get('G');
  ok('grid on: a lone object lands on a multiple of 20', G.x % 20 === 0 && G.y % 20 === 0);
  await p.getByTestId('zoom').click(); await p.getByTestId('grid-toggle').uncheck(); await p.keyboard.press('Escape');

  // 5. align / distribute
  await reset();
  await add('a', 200, 200, 100, 80); await add('b', 360, 330, 120, 120); await add('c', 700, 260, 60, 60); await pick(['a', 'b', 'c']);
  await p.getByTestId('arrange').click();
  await p.getByTestId('align-left').click();
  ok('Align left', (await objs()).filter(o => ['a', 'b', 'c'].includes(o.id)).every(o => o.x === 200));
  await p.getByTestId('align-top').click();
  ok('Align top', (await objs()).filter(o => ['a', 'b', 'c'].includes(o.id)).every(o => o.y === 200));
  await p.evaluate(() => window.__board.getState().updateObjects({ b: { x: 320 }, c: { x: 700 } }));
  await p.getByTestId('spread-h').click();
  const [a, bb, c] = [await get('a'), await get('b'), await get('c')];
  ok('Spread sideways gives equal gaps', near(bb.x - (a.x + a.width), c.x - (bb.x + bb.width), 0.01) && a.x === 200 && c.x === 700);
  await p.evaluate(() => window.__board.getState().undo()); await p.waitForTimeout(100);
  ok('align and spread are undoable', (await get('b')).x === 320);

  // 6. group: clicking one member selects all; moving moves all; copy makes a NEW group; ungroup frees them
  await reset(); await add('g1', 200, 200); await add('g2', 400, 200); await add('g3', 700, 500); await pick(['g1', 'g2']);
  await p.keyboard.press('Control+g'); await p.waitForTimeout(100);
  const ga = (await get('g1')).group;
  ok('Ctrl+G puts both in one group', !!ga && (await get('g2')).group === ga && !(await get('g3')).group);
  await pick([]); await p.mouse.click(260, 250); await p.waitForTimeout(100);
  ok('clicking one member selects the whole group', (await sel()).length === 2);
  await drag(260, 250, 100, 60); await p.waitForTimeout(150);
  ok('the group moves together', near((await get('g1')).x, 300, 25) && near((await get('g2')).x - (await get('g1')).x, 200, 0.01));
  await p.evaluate(() => { const s = window.__board.getState(); s.select(['g1', 'g2']); s.duplicateSelected(); });
  const copies = (await objs()).filter(o => o.group && o.group !== ga);
  ok('a copy of a group is a new group', copies.length === 2 && copies[0].group === copies[1].group);
  await pick(['g1', 'g2']); await p.keyboard.press('Control+Shift+g'); await p.waitForTimeout(100);
  ok('Ctrl+Shift+G ungroups', !(await get('g1')).group && !(await get('g2')).group);

  // 7. lock
  await reset(); await add('L', 300, 300); await pick(['L']);
  await p.keyboard.press('Control+Shift+l'); await p.waitForTimeout(100);
  ok('Ctrl+Shift+L locks', (await get('L')).locked === true);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('Delete'); await p.waitForTimeout(100);
  ok('a locked object cannot be nudged or deleted', (await get('L')).x === 300);
  await drag(360, 350, 80, 80);
  ok('a locked object cannot be dragged', (await get('L')).x === 300 && (await get('L')).y === 300);
  await p.keyboard.press('Control+Shift+l'); await p.waitForTimeout(100);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  ok('unlocked again: it moves', (await get('L')).x === 301 && !(await get('L')).locked);

  // 8. layer order
  await reset(); await add('o1', 300, 300, 200, 200); await add('o2', 350, 350, 200, 200); await add('o3', 400, 400, 200, 200); await pick(['o1']);
  await p.keyboard.press('Control+Shift+]'); await p.waitForTimeout(100);
  const order = async () => p.evaluate(() => window.__board.getState().objects.slice().sort((a, b) => (a.z || 0) - (b.z || 0)).map(o => o.id).join(','));
  ok('Ctrl+Shift+] brings to front', (await order()).endsWith('o1'));
  const topId = await p.evaluate(() => { const st = window.__Konva_top; return null; });
  await p.getByTestId('context-bar').waitFor(); await p.getByTestId('arrange').click(); await p.getByTestId('layer-back').click(); await p.waitForTimeout(100);
  ok('To back sends it behind the others', (await order()).startsWith('o1'));
  await p.getByTestId('layer-forward').click(); await p.waitForTimeout(100);
  ok('Forward moves it up one place', (await order()) === 'o2,o1,o3');
  // a click where all three overlap picks the top one
  await pick([]); await p.mouse.click(480, 480); await p.waitForTimeout(100);
  ok('the click lands on the object that is drawn on top', (await sel())[0] === 'o3');
  await p.evaluate(() => window.__board.getState().addObject({ id: 'new', type: 'sticky', x: 900, y: 300, width: 50, height: 50, rotation: 0, text: '', color: '#fff', by: 'x' }));
  ok('a new object lands on top once layers are used', (await order()).endsWith('new'));

  // 9. every new shape draws without errors; also on the thumbnail; cloud/cylinder resize
  await reset();
  await p.evaluate(() => window.__board.getState().addObject({ id: 's', type: 'shape', kind: 'rect', x: 300, y: 250, width: 200, height: 140, rotation: 0, fill: '#FFE8A3', stroke: '#1F2937', strokeWidth: 2, text: 'Hi' }));
  for (const k of ['triangle', 'hexagon', 'star', 'arrow', 'speech', 'cloud', 'cylinder', 'diamond', 'ellipse', 'rect']) {
    await p.getByTestId('shape-kind').selectOption(k); await p.waitForTimeout(80);
    if (k === 'cloud' || k === 'star') await p.screenshot({ path: `e2e/out-shape-${k}.png`, clip: { x: 200, y: 150, width: 420, height: 320 } });
  }
  ok('the shape menu lists ten shapes', (await p.getByTestId('shape-kind').locator('option').count()) === 10);
  await p.getByTestId('shape-kind').selectOption('cloud');
  ok('changing the shape kind is saved on the object', (await get('s')).kind === 'cloud');
  await p.screenshot({ path: 'e2e/out-edit.png' });

  // 10. connector styles
  await reset(); await add('c1', 300, 300); await add('c2', 600, 300);
  await p.evaluate(() => window.__board.getState().addObject({ id: 'cn', type: 'connector', x: 0, y: 0, width: 0, height: 0, rotation: 0, fromId: 'c1', toId: 'c2', lineStyle: 'straight', endArrow: true, color: '#1F2937' }));
  await pick(['cn']); await p.waitForTimeout(100);
  await p.getByRole('button', { name: 'dashed' }).click(); await p.getByTestId('start-arrow').click(); await p.waitForTimeout(100);
  const cn = await get('cn');
  ok('connector can be dashed with an arrow at both ends', cn.dash === 'dashed' && cn.startArrow === true && cn.endArrow === true);

  // 11. viewers cannot arrange or lock
  await reset(); await add('v', 300, 300); await pick(['v']);
  await p.evaluate(() => window.__board.setState({ role: 'viewer' })); await p.waitForTimeout(100);
  ok('no arrange menu for viewers', (await p.getByTestId('arrange').count()) === 0);
  await p.keyboard.press('Control+Shift+l'); await p.waitForTimeout(100);
  ok('viewer shortcut does nothing', !(await get('v')).locked);

  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs.join('\n'));
  await b.close();
})();
