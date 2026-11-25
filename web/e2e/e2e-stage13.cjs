// Stage 13: look and feel. Sign-in card, landing page, floating bar position, text sizes, small windows.
// Needs `npm run dev` on port 5173.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const ctx = await b.newContext({ viewport: { width: 1100, height: 760 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));

  // landing page for a signed-out visitor
  await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(900);
  ok('landing page shows for a new visitor', (await p.getByTestId('landing').count()) === 1);

  // sign-in card: checks before sending, show/hide password
  await p.getByTestId('landing-login').click(); await p.getByTestId('auth-email').waitFor();
  await p.getByTestId('auth-submit').click(); await p.waitForTimeout(200);
  ok('empty form shows inline messages (email + password)', (await p.getByRole('alert').count()) >= 2);
  await p.getByTestId('auth-email').fill('not-an-email'); await p.getByTestId('auth-password').fill('x');
  await p.getByTestId('auth-submit').click(); await p.waitForTimeout(200);
  ok('bad email is explained', (await p.getByText('Enter a valid email').count()) === 1);
  ok('password is hidden by default', (await p.getByTestId('auth-password').getAttribute('type')) === 'password');
  await p.getByTestId('auth-show').click();
  ok('Show password reveals it', (await p.getByTestId('auth-password').getAttribute('type')) === 'text');
  await p.getByTestId('auth-switch').click();
  await p.getByTestId('auth-submit').click(); await p.waitForTimeout(200);
  ok('register asks for a name', (await p.getByText('Enter your name.').count()) === 1);

  // board: floating bar sits above a selected sticky, inside the window
  await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(500);
  await p.getByTestId('landing').waitFor(); await p.getByTestId('get-started').click(); await p.waitForTimeout(700);
  await p.keyboard.press('n'); await p.mouse.click(600, 420); await p.waitForTimeout(150); await p.keyboard.type('hello'); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  const bar = await p.getByTestId('context-bar').boundingBox();
  const note = await p.evaluate(() => { const s = window.__board.getState(); const o = s.objects[0]; return { x: o.x * s.viewport.scale + s.viewport.x, y: o.y * s.viewport.scale + s.viewport.y, w: o.width, h: o.height }; });
  ok('floating bar is above the sticky', !!bar && bar.y + bar.height <= note.y + 2);
  ok('floating bar is centred on the sticky (±4px)', !!bar && Math.abs(bar.x + bar.width / 2 - (note.x + note.w / 2)) < 4);
  ok('floating bar stays inside the window', !!bar && bar.x >= 0 && bar.x + bar.width <= 1100 && bar.y >= 0);

  // text: S / M / L / XL
  await p.keyboard.press('Escape'); await p.mouse.click(900, 300); await p.waitForTimeout(100);
  await p.keyboard.press('t'); await p.mouse.click(300, 300); await p.waitForTimeout(150); await p.keyboard.type('Big'); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  await p.getByTestId('size-XL').click(); await p.waitForTimeout(150);
  const fs = await p.evaluate(() => window.__board.getState().objects.find(o => o.type === 'text').fontSize);
  ok('XL sets the text size to 52', fs === 52);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok('undo restores the previous size (24)', (await p.evaluate(() => window.__board.getState().objects.find(o => o.type === 'text').fontSize)) === 24);

  // narrow window: nothing wraps or hides behind something else
  await p.setViewportSize({ width: 820, height: 700 }); await p.waitForTimeout(300);
  const exp = await p.getByTestId('export').boundingBox();
  ok('Export PNG stays on one line', !!exp && exp.height < 44);
  const extras = await p.getByText('Private').boundingBox(); const zoom = await p.getByTestId('zoom').boundingBox();
  ok('"Private" does not sit under the zoom bar', !!extras && !!zoom && (extras.y + extras.height < zoom.y || extras.x + extras.width < zoom.x));

  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
