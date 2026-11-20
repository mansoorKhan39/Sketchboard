const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const objs = () => p.evaluate(() => window.__board.getState().objects);
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);

  // ---- voting ----
  await p.keyboard.press('n'); await p.mouse.click(500, 350); await p.waitForTimeout(150); await p.keyboard.type('idea A'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.keyboard.press('n'); await p.mouse.click(850, 350); await p.waitForTimeout(150); await p.keyboard.type('idea B'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  const [a, bb] = (await objs()).filter(o => o.type === 'sticky');
  await p.evaluate((id) => window.__board.getState().select([id]), a.id); await p.waitForTimeout(150);
  ok('5 votes left at the start', ((await p.getByTestId('votes-left').textContent()) || '').includes('5'));
  await p.getByTestId('vote').click(); await p.getByTestId('vote').click(); await p.waitForTimeout(150);
  ok('two votes on idea A show as a badge "2"', (await p.getByTestId('vote-badge').first().getAttribute('data-votes')) === '2');
  ok('3 votes left', ((await p.getByTestId('votes-left').textContent()) || '').includes('3'));
  await p.getByTestId('unvote').click(); await p.waitForTimeout(100);
  ok('Remove takes back one', (await p.getByTestId('vote-badge').first().getAttribute('data-votes')) === '1');
  await p.evaluate((id) => window.__board.getState().select([id]), bb.id); await p.waitForTimeout(100);
  for (let i = 0; i < 6; i++) { if (await p.getByTestId('vote').isEnabled()) await p.getByTestId('vote').click(); }
  await p.waitForTimeout(150);
  const mine = (await objs()).filter(o => o.type === 'vote').length;
  ok('a person can give at most 5 votes in total (' + mine + ')', mine === 5);
  ok('Vote button is disabled when none are left', !(await p.getByTestId('vote').isEnabled()));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok('undo removes the last vote', (await objs()).filter(o => o.type === 'vote').length === 4);
  // deleting the voted object removes its votes
  await p.evaluate((id) => { const g = window.__board.getState(); g.select([id]); g.removeSelected(); }, bb.id); await p.waitForTimeout(150);
  ok('deleting an object deletes its votes', (await objs()).filter(o => o.type === 'vote').every(v => v.targetId === a.id));

  // ---- reactions ----
  const before = (await objs()).length;
  await p.getByTestId('react').first().click(); await p.waitForTimeout(300);
  ok('reaction floats on screen', (await p.getByTestId('reaction').count()) === 1);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok('undo does not touch reactions (they are not part of the drawing)', (await objs()).some(o => o.type === 'reaction'));
  await p.waitForTimeout(4300);
  ok('reaction disappears by itself and is removed from the board', (await p.getByTestId('reaction').count()) === 0 && !(await objs()).some(o => o.type === 'reaction'));

  // ---- timer ----
  await p.getByTestId('timer-toggle').click(); await p.waitForTimeout(200);
  ok('timer shows 5:00', ((await p.getByTestId('timer-time').textContent()) || '').trim() === '5:00');
  await p.getByTestId('timer-length').selectOption('60'); await p.waitForTimeout(150);
  ok('length can be changed to 1 min', ((await p.getByTestId('timer-time').textContent()) || '').trim() === '1:00');
  await p.getByTestId('timer-start').click(); await p.waitForTimeout(2300);
  const t1 = ((await p.getByTestId('timer-time').textContent()) || '').trim();
  ok('timer counts down while running: ' + t1, t1 === '0:58' || t1 === '0:57');
  await p.getByTestId('timer-pause').click(); await p.waitForTimeout(1200);
  const t2 = ((await p.getByTestId('timer-time').textContent()) || '').trim();
  await p.waitForTimeout(1200);
  ok('pause freezes it: ' + t2, ((await p.getByTestId('timer-time').textContent()) || '').trim() === t2);
  await p.getByTestId('timer-reset').click(); await p.waitForTimeout(150);
  ok('reset goes back to 1:00', ((await p.getByTestId('timer-time').textContent()) || '').trim() === '1:00');
  // let it run out (use the store to set a 2-second timer)
  await p.evaluate(() => window.__board.getState().liveEdit(o => o.map(x => x.type === 'timer' ? { ...x, endsAt: Date.now() + 1500, left: 2 } : x))); await p.waitForTimeout(2500);
  ok('shows "Time\'s up" at zero', ((await p.getByTestId('timer-time').textContent()) || '').includes("Time's up"));
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  ok('undo does not remove the timer', (await p.getByTestId('timer').count()) === 1);
  await p.getByTestId('timer-toggle').click(); await p.waitForTimeout(150);
  ok('Timer button again removes it', (await p.getByTestId('timer').count()) === 0);

  // none of these count as board content
  await p.evaluate(() => { const g = window.__board.getState(); g.select(g.objects.filter(o => o.type === 'sticky').map(o => o.id)); g.removeSelected(); }); await p.waitForTimeout(200);
  await p.getByTestId('export-png').click(); await p.waitForTimeout(300);
  ok('votes alone do not count as content (export says empty)', ((await p.getByTestId('notice').textContent().catch(() => '')) || '').includes('empty'));
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await p.screenshot({ path: 'e2e/out-extras.png' });
  await b.close();
})();
