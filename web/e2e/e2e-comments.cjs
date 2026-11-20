const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const objs = () => p.evaluate(() => window.__board.getState().objects);
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);

  await p.keyboard.press('c'); await p.mouse.click(600, 400); await p.waitForTimeout(250);
  ok('C + click drops a pin and opens its thread', (await p.getByTestId('comment-pin').count()) === 1 && (await p.getByTestId('comment-thread').count()) === 1);
  await p.getByTestId('comment-input').fill('Is this the final layout?'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  let c = (await objs()).find(o => o.type === 'comment');
  ok('Enter sends the message', c.thread.length === 1 && c.thread[0].text === 'Is this the final layout?' && c.thread[0].author === 'Guest');
  await p.getByTestId('comment-input').fill('Yes, ship it'); await p.getByTestId('comment-send').click(); await p.waitForTimeout(200);
  ok('reply is added: 2 messages shown', (await p.getByTestId('comment-message').count()) === 2);
  ok('pin shows the count', ((await p.getByTestId('comment-pin').textContent()) || '').trim() === '2');

  // zoom: the pin follows its spot on the board
  const pos1 = await p.getByTestId('comment-pin').boundingBox();
  await p.mouse.move(640, 400); await p.mouse.wheel(0, -300); await p.waitForTimeout(300);
  const pos2 = await p.getByTestId('comment-pin').boundingBox();
  ok('pin keeps its size when zooming', Math.abs(pos1.width - pos2.width) < 1);

  // close, resolve, reopen
  await p.getByTestId('comment-resolve').click(); await p.waitForTimeout(150);
  ok('resolved is saved on the object', (await objs()).find(o => o.type === 'comment').resolved === true);
  ok('resolved pin shows a tick', ((await p.getByTestId('comment-pin').textContent()) || '').includes('✓'));

  // comments are not board content: Export PNG still says "empty", Fit and marquee ignore them
  await p.getByTestId('comment-pin').click(); await p.waitForTimeout(100);
  await p.getByTestId('export-png').click(); await p.waitForTimeout(300);
  ok('a board with only a pin counts as empty for export', ((await p.getByTestId('notice').textContent().catch(() => '')) || '').includes('empty'));

  // persistence: reload keeps the thread
  await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(1200);
  c = (await objs()).find(o => o.type === 'comment');
  ok('thread survives a reload', !!c && c.thread.length === 2 && c.resolved === true);

  // delete
  await p.getByTestId('comment-pin').click(); await p.getByTestId('comment-delete').click(); await p.waitForTimeout(200);
  ok('delete removes the pin', (await p.getByTestId('comment-pin').count()) === 0 && !(await objs()).some(o => o.type === 'comment'));
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
