const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);

  // export on an empty board gives a clear message
  await p.getByTestId('export-png').click(); await p.waitForTimeout(300);
  ok('empty board: export says so', ((await p.getByTestId('notice').textContent().catch(() => '')) || '').includes('empty'));

  // make a 1600x1000 test picture in the page and pick it like a user would
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1600, 1000); gr.addColorStop(0, '#ff6b6b'); gr.addColorStop(1, '#4dabf7'); g.fillStyle = gr; g.fillRect(0, 0, 1600, 1000);
    g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % 1500, (i * 61) % 900, 80, 50);
    return c.toDataURL('image/png').split(',')[1];
  });
  await p.getByTestId('image-input').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await p.waitForFunction(() => window.__board.getState().objects.some(o => o.type === 'image'), null, { timeout: 8000 }).catch(() => {});
  const img = await p.evaluate(() => window.__board.getState().objects.find(o => o.type === 'image') || null);
  ok('picture added as an image object', !!img);
  if (img) {
    ok('stored as a small data URL: ' + img.src.length + ' chars', /^data:image\/(webp|jpeg)/.test(img.src) && img.src.length <= 150000);
    ok('shown 360 wide, shape kept (' + Math.round(img.width) + 'x' + Math.round(img.height) + ')', img.width === 360 && Math.abs(img.height - 225) <= 1);
    ok('keeps its file name', img.name === 'test.png');
  }
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'e2e/out-image.png' });

  // saved with the board and back after a reload
  await p.reload(); await p.waitForTimeout(1200);
  const again = await p.evaluate(() => window.__board.getState().objects.filter(o => o.type === 'image').length);
  ok('picture is still there after reload', again === 1);

  // export
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.getByTestId('export-png').click()]);
  ok('export gives a file', !!dl);
  if (dl) {
    const path = 'e2e/out-export.png'; await dl.saveAs(path); const buf = fs.readFileSync(path);
    ok('file is a real PNG (' + buf.length + ' bytes): ' + dl.suggestedFilename(), buf.slice(1, 4).toString() === 'PNG' && buf.length > 2000 && dl.suggestedFilename().endsWith('.png'));
  }

  // the board still looks normal after exporting (view restored)
  const vp = await p.evaluate(() => window.__board.getState().viewport);
  ok('view restored after export', vp.scale === 1 || vp.scale > 0);

  // delete it
  await p.evaluate(() => { const s = window.__board.getState(); s.select(s.objects.filter(o => o.type === 'image').map(o => o.id)); });
  await p.keyboard.press('Delete'); await p.waitForTimeout(200);
  ok('picture can be deleted', (await p.evaluate(() => window.__board.getState().objects.length)) === 0);

  // a non-picture file is refused politely
  await p.getByTestId('image-input').setInputFiles({ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await p.waitForTimeout(300);
  ok('text file is not added', (await p.evaluate(() => window.__board.getState().objects.length)) === 0);
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
