// Stage 19: board management: favourites, folders, search, trash/restore, export (PDF/SVG/JSON), import, embed.
// Needs `npm run dev` on 5173 started with ABLY_API_KEY=app.key:secret (any value: only the share link is checked), and alice registered.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const api = (m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await fetch('/api/v1' + path, { method: m, headers: { 'content-type': 'application/json', 'x-sketchboard': '1' }, body: body ? JSON.stringify(body) : undefined }); return r.status === 204 ? null : r.json(); }, [m, path, body]);
  const names = async () => (await p.getByTestId('board-card').locator('.truncate.text-sm').allTextContents());
  await p.goto('http://localhost:5173/#/login'); await p.waitForTimeout(800);
  await p.evaluate(() => fetch('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sketchboard': '1' }, body: JSON.stringify({ email: 'alice@example.com', password: 'alice password 1' }) }));
  // clean slate
  await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(600);
  for (const bd of (await api('GET', '/boards')).boards) await api('DELETE', '/boards/' + bd.id);
  const sticky = (id, t) => ({ id, type: 'sticky', x: 100, y: 100, width: 200, height: 150, rotation: 0, text: t, color: '#FFD43B' });
  await api('POST', '/boards', { name: 'Alpha plan', objects: [sticky('a1', 'hello')] });
  await api('POST', '/boards', { name: 'Beta notes', objects: [sticky('b1', 'x')] });
  await api('POST', '/boards', { name: 'Gamma', objects: [] });
  await p.reload(); await p.waitForTimeout(900);
  ok('three boards listed', (await p.getByTestId('board-card').count()) === 3);

  // favourite
  const card = n => p.getByTestId('board-card').filter({ hasText: n });
  await card('Beta notes').getByTestId('board-star').click({ force: true }); await p.waitForTimeout(400);
  await p.getByTestId('filter-favorites').click(); await p.waitForTimeout(200);
  ok('starring puts a board under Favourites', (await names()).join() === 'Beta notes');
  await p.reload(); await p.waitForTimeout(800); await p.getByTestId('filter-favorites').click();
  ok('the star is saved', (await names()).join() === 'Beta notes');
  await p.getByTestId('filter-all').click();

  // folder
  await card('Alpha plan').getByTestId('board-menu').click(); await p.getByTestId('board-folder').click();
  await p.getByTestId('folder-input').fill('Uni'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ok('a folder chip appears', (await p.getByTestId('filter-folder:Uni').count()) === 1);
  await p.getByTestId('filter-folder:Uni').click();
  ok('the folder shows only its boards', (await names()).join() === 'Alpha plan');
  await p.getByTestId('filter-all').click();

  // search by name and by folder
  await p.getByLabel('Search boards').fill('gam'); ok('search by name', (await names()).join() === 'Gamma');
  await p.getByLabel('Search boards').fill('uni'); ok('search by folder name', (await names()).join() === 'Alpha plan');
  await p.getByLabel('Search boards').fill('');

  // trash and restore
  await card('Gamma').getByTestId('board-menu').click(); await p.getByTestId('board-trash').click(); await p.waitForTimeout(400);
  ok('Move to trash removes it from All', (await names()).length === 2 && !(await names()).includes('Gamma'));
  await p.getByTestId('filter-trash').click();
  ok('it is in the Trash view with the 30 day note', (await names()).join() === 'Gamma' && (await p.getByTestId('trash-banner').textContent()).includes('30 days'));
  await card('Gamma').getByTestId('board-menu').click(); await p.getByTestId('board-restore').click(); await p.waitForTimeout(500);
  ok('Restore brings it back (and the empty Trash chip goes away)', (await p.getByTestId('filter-trash').count()) === 0 && (await names()).length === 3);
  await card('Gamma').getByTestId('board-menu').click(); await p.getByTestId('board-trash').click(); await p.waitForTimeout(300);
  await card('Beta notes').getByTestId('board-menu').click(); await p.getByTestId('board-trash').click(); await p.waitForTimeout(300);
  await p.getByTestId('filter-trash').click();
  await card('Gamma').getByTestId('board-menu').click(); await p.getByTestId('board-delete').click(); await p.getByTestId('board-delete').click(); await p.waitForTimeout(400);
  ok('Delete forever needs a second click and removes it', (await names()).join() === 'Beta notes');
  p.once('dialog', d => d.accept()); await p.getByTestId('empty-trash').click(); await p.waitForTimeout(500);
  ok('Empty trash clears it and returns to All', (await names()).join() === 'Alpha plan');

  // open the board, export every format
  await card('Alpha plan').getByRole('button', { name: /Open/ }).click(); await p.waitForTimeout(900);
  const grab = async id => { await p.getByTestId('export').click(); const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.getByTestId('export-' + id).click()]); const path = await dl.path(); return { name: dl.suggestedFilename(), buf: fs.readFileSync(path) }; };
  const svg = await grab('svg'); ok('SVG export downloads a .svg with the sticky text', svg.name.endsWith('.svg') && svg.buf.toString().startsWith('<svg') && svg.buf.toString().includes('hello'));
  const pdf = await grab('pdf'); ok('PDF export downloads a real PDF', pdf.name.endsWith('.pdf') && pdf.buf.slice(0, 5).toString() === '%PDF-' && pdf.buf.toString('latin1').includes('%%EOF'));
  const png = await grab('png'); ok('PNG export still works', png.name.endsWith('.png') && png.buf[1] === 0x50);
  const json = await grab('json'); ok('Board file export downloads .sketchboard.json', json.name.endsWith('.sketchboard.json') && JSON.parse(json.buf.toString()).objects.length === 1);
  fs.writeFileSync('/tmp/exported.sketchboard.json', json.buf);

  // import it again
  await p.goBack(); await p.waitForTimeout(700);
  await p.getByTestId('import-file').setInputFiles('/tmp/exported.sketchboard.json'); await p.waitForTimeout(1200);
  const imported = (await api('GET', '/boards')).boards;
  ok('Import makes a new board with the same objects and opens it', imported.length === 2 && imported.some(x => x.name === 'Alpha plan' && x.objects.length === 1) && p.url().includes('#/board/'));
  fs.writeFileSync('/tmp/bad.json', '{"hello":1}'); await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(700);
  await p.getByTestId('import-file').setInputFiles('/tmp/bad.json'); await p.waitForTimeout(400);
  ok('a wrong file shows a clear error and makes no board', (await p.getByRole('alert').textContent()).includes('not a Sketchboard file') && (await api('GET', '/boards')).boards.length === 2);

  // embed
  const target = (await api('GET', '/boards')).boards[0].id;
  await p.goto('http://localhost:5173/#/board/' + target); await p.waitForTimeout(900);
  await p.getByTestId('share').click(); await p.getByTestId('share-toggle').click(); await p.waitForTimeout(800);
  ok('embed code is offered for a view-only link', (await p.getByTestId('embed-code').inputValue()).match(/<iframe src="http:\/\/localhost:5173\/#\/s\/[\w-]+\?embed=1"/) !== null);
  await p.getByTestId('share-right-editor').click(); await p.waitForTimeout(400);
  ok('but not for an edit link', (await p.getByTestId('embed-code').count()) === 0);
  await p.getByTestId('share-right-viewer').click(); await p.waitForTimeout(400);
  const link = await p.getByTestId('share-link').inputValue();
  // (this sandbox cannot reach Ably, so a guest could not finish opening the board here; the embedded layout is the same screen, so it is checked on the owner's board)
  const emb = await (await b.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  await emb.goto('http://localhost:5173/#/'); await emb.evaluate(() => fetch('/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-sketchboard': '1' }, body: JSON.stringify({ email: 'alice@example.com', password: 'alice password 1' }) }));
  await emb.goto('http://localhost:5173/#/board/' + target + '?embed=1'); await emb.reload(); await emb.waitForTimeout(1500);
  ok('the embedded view shows only the board and an "Open in Sketchboard" link', (await emb.getByTestId('embed').count()) === 1 && (await emb.getByText('Open in Sketchboard').count()) === 1 && (await emb.getByTestId('share').count()) === 0 && (await emb.locator('[data-testid^=tool-]').count()) === 0);
  const guest = await (await b.newContext()).newPage(); guest.on('pageerror', e => errs.push('guest: ' + e));
  // a trashed board's share link stops working
  await api('PATCH', '/boards/' + target, { trashed: true });
  await guest.goto(link); await guest.reload(); await guest.waitForTimeout(1200);
  ok('a trashed board\'s public link stops working', (await guest.getByText('Cannot open this board').count()) === 1);

  ok('no page errors', errs.length === 0); if (errs.length) console.log(errs.join('\n'));
  await b.close();
})();
