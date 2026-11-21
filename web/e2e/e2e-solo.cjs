const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('http://localhost:5173/#/login'); await p.waitForTimeout(800);
  await p.getByTestId('auth-email').fill('alice@example.com'); await p.getByTestId('auth-password').fill('alice password 1'); await p.getByTestId('auth-submit').click(); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(500);
  await p.keyboard.press('n'); await p.mouse.click(500, 300); await p.waitForTimeout(150); await p.keyboard.type('made while offline'); await p.keyboard.press('Escape');
  await p.waitForTimeout(6500);
  const st = (await p.getByTestId('save-status').textContent()).trim();
  ok('with no Ably key on the server the board works alone: "' + st + '"', st === 'Saved');
  const id = await p.evaluate(() => window.__board.getState().boardId);
  const saved = await p.evaluate(async (id) => (await (await fetch('/api/v1/boards/' + id)).json()).board.objects.map(o => o.text), id);
  ok('edit made during connecting was saved normally: ' + JSON.stringify(saved), saved.includes('made while offline'));
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
