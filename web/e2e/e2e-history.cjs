const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const errs = [];

  async function flow(p, label) {
    const objs = () => p.evaluate(() => window.__board.getState().objects);
    const sticky = async (x, y, text) => { await p.keyboard.press('n'); await p.mouse.click(x, y); await p.waitForTimeout(150); await p.keyboard.type(text); await p.keyboard.press('Escape'); await p.waitForTimeout(150); };
    await sticky(400, 300, 'one');
    await p.getByTestId('history').click(); await p.waitForTimeout(400);
    ok(label + ': panel opens, no versions yet', (await p.getByTestId('version-row').count()) === 0);
    await p.getByTestId('save-version').click(); await p.waitForTimeout(500);
    ok(label + ': version 1 saved (1 object)', (await p.getByTestId('version-row').count()) === 1 && ((await p.getByTestId('version-row').first().textContent()) || '').includes('1 objects'));
    await p.getByTestId('history').click(); // close
    await sticky(700, 300, 'two'); await sticky(400, 550, 'three');
    ok(label + ': board now has 3 objects', (await objs()).length === 3);
    await p.getByTestId('history').click(); await p.waitForTimeout(400);
    await p.getByTestId('save-version').click(); await p.waitForTimeout(500);
    ok(label + ': newest version is listed first (3 objects)', ((await p.getByTestId('version-row').first().textContent()) || '').includes('3 objects'));

    // restore the old one (the second row = 1 object): needs a confirm click
    await p.getByTestId('version-restore').nth(1).click(); await p.waitForTimeout(100);
    ok(label + ': restore asks for confirmation first', (await objs()).length === 3 && (await p.getByTestId('version-confirm').count()) === 1);
    await p.getByTestId('version-confirm').click(); await p.waitForTimeout(600);
    ok(label + ': board is back to 1 object ("one")', (await objs()).length === 1 && (await objs())[0].text === 'one');
    await p.getByTestId('history').click(); await p.waitForTimeout(400);
    const rows = await p.getByTestId('version-row').allTextContents();
    ok(label + ': a "Before restore" copy was kept: ' + rows.length + ' rows', rows.some(r => r.includes('Before restore')) && rows.length === 3);
    await p.getByTestId('history').click();

    // undo brings the 3-object board back
    await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
    ok(label + ': Ctrl+Z undoes the restore', (await objs()).length === 3);

    // limit of 5
    await p.getByTestId('history').click(); await p.waitForTimeout(300);
    for (let i = 0; i < 4; i++) { await p.getByTestId('save-version').click(); await p.waitForTimeout(350); }
    ok(label + ': never more than 5 versions', (await p.getByTestId('version-row').count()) === 5);
    await p.getByTestId('history').click();
  }

  // 1) guest (versions live in this browser)
  const g = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  g.on('pageerror', e => errs.push(String(e)));
  await g.goto('http://localhost:5173/'); await g.waitForTimeout(900);
  await g.getByTestId('new-board').click(); await g.waitForTimeout(700);
  await flow(g, 'guest');

  // 2) signed in (versions live on the server)
  const c = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  c.on('pageerror', e => errs.push(String(e)));
  await c.goto('http://localhost:5173/#/login'); await c.waitForTimeout(800);
  const email = 'hist' + Date.now() + '@example.com';
  await c.evaluate(async (email) => { await fetch('/api/v1/auth/register', { method: 'POST', headers: { 'X-Sketchboard': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hist', email, password: 'history pass 1' }) }); }, email);
  await c.goto('http://localhost:5173/'); await c.waitForTimeout(1200);
  await c.getByTestId('new-board').click(); await c.waitForTimeout(900);
  await flow(c, 'cloud');
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
