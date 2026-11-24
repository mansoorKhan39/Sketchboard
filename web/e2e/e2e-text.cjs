// Stage 18: tables (create, type in cells, Tab/Enter, add/remove rows and columns, header) and text formatting. Guest mode.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const objs = () => p.evaluate(() => window.__board.getState().objects);
  const one = async t => (await objs()).find(o => o.type === t);
  await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);

  // 1. table tool
  await p.keyboard.press('b'); await p.mouse.click(640, 420); await p.waitForTimeout(200);
  let t = await one('table');
  ok('B + click makes a 3 x 3 table with a header row', !!t && t.cells.length === 3 && t.cells[0].length === 3 && t.header === true);
  ok('the first cell is open for typing', await p.evaluate(() => { const s = window.__board.getState(); return s.editingId && s.editingCell && s.editingCell.r === 0 && s.editingCell.c === 0; }));
  await p.keyboard.type('Name'); await p.keyboard.press('Tab'); await p.keyboard.type('Age'); await p.keyboard.press('Tab'); await p.keyboard.type('City');
  await p.keyboard.press('Enter'); await p.waitForTimeout(100); // below the City cell
  await p.keyboard.type('Lahore'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  t = await one('table');
  console.log(JSON.stringify(t.cells)); ok('Tab moves right and Enter moves down', t.cells[0].join() === 'Name,Age,City' && t.cells[1][2] === 'Lahore');
  ok('typing in cells is one undoable edit each', await p.evaluate(() => window.__board.getState().past.length >= 4));

  // 2. double-click a cell
  const cx = t.x + t.width * (1.5 / 3), cy = t.y + t.height * (2.5 / 3);
  await p.keyboard.press('Escape'); await p.mouse.dblclick(cx, cy); await p.waitForTimeout(200);
  ok('double-click opens the cell under the pointer', await p.evaluate(() => { const c = window.__board.getState().editingCell; return c && c.r === 2 && c.c === 1; }));
  await p.keyboard.type('x'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok('and saves what was typed', (await one('table')).cells[2][1] === 'x');
  await p.screenshot({ path: 'e2e/out-table.png' });

  // 3. rows, columns, header
  await p.mouse.click(t.x + 20, t.y + 10); await p.waitForTimeout(150);
  await p.getByTestId('add-row').click(); await p.waitForTimeout(100);
  let t2 = await one('table');
  ok('+ Row adds a row and keeps the row height', t2.cells.length === 4 && Math.abs(t2.height - t.height * 4 / 3) < 0.01);
  await p.getByTestId('del-col').click(); await p.waitForTimeout(100);
  t2 = await one('table');
  console.log(JSON.stringify(t2.cells)); ok('- Col removes the last column', t2.cells[0].length === 2 && t2.cells[0].join() === 'Name,Age');
  await p.getByTestId('table-header').click(); await p.waitForTimeout(100);
  ok('Header row can be switched off', (await one('table')).header === false);
  await p.evaluate(() => window.__board.getState().undo()); await p.evaluate(() => window.__board.getState().undo()); await p.waitForTimeout(100);
  ok('all of it is undoable', (await one('table')).cells.length === 4 && (await one('table')).cells[0].length === 3);

  // 4. text formatting on a sticky
  await p.evaluate(() => { const s = window.__board.getState(); s.restoreObjects([]); s.addObject({ id: 'st', type: 'sticky', x: 500, y: 300, width: 220, height: 160, rotation: 0, text: 'line one\nsee https://example.com/page.', color: '#FFD43B', by: 'x' }); });
  await p.waitForTimeout(150);
  await p.getByTestId('fmt-bold').click(); await p.getByTestId('fmt-italic').click(); await p.getByTestId('fmt-underline').click(); await p.getByTestId('fmt-bullets').click();
  await p.getByTestId('fmt-center').click(); await p.getByTestId('fmt-size').selectOption('24'); await p.waitForTimeout(150);
  const st = (await objs()).find(o => o.id === 'st');
  ok('bold, italic, underline, bullets, centre and size are saved on the object', st.bold && st.italic && st.underline && st.bullets && st.align === 'center' && st.fs === 24);
  ok('a link in the text gets an Open link button', (await p.getByTestId('open-link').getAttribute('href')) === 'https://example.com/page');
  await p.screenshot({ path: 'e2e/out-text.png' });
  await p.getByTestId('fmt-bold').click(); await p.getByTestId('fmt-size').selectOption(''); await p.waitForTimeout(100);
  const st2 = (await objs()).find(o => o.id === 'st');
  ok('they switch off again (size back to the default)', !st2.bold && !st2.fs);

  // 5. viewers cannot edit cells
  await p.evaluate(() => { const s = window.__board.getState(); s.addObject({ id: 'tb', type: 'table', x: 100, y: 500, width: 300, height: 100, rotation: 0, cells: [['a', 'b']], header: false }); window.__board.setState({ role: 'viewer', editingId: null, editingCell: null }); window.__board.getState().setEditingCell('tb', 0, 0); });
  ok('a viewer cannot open a cell', await p.evaluate(() => window.__board.getState().editingId === null));
  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs.join('\n'));
  await b.close();
})();
