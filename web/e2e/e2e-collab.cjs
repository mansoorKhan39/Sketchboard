// Stage 20a: members by e-mail, "Shared with me", roles, People panel, activity, bell + @mention, leave.
// Needs `npm run dev` on 5173 and alice@example.com / "alice password 1" registered; bob is registered here.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const mk = async (email, name, pw) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERROR', email, String(e)));
    await p.goto('http://localhost:5173/#/login'); await p.waitForTimeout(700);
    const call = (path, body) => p.evaluate(async ([path, body]) => (await fetch('/api/v1' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sketchboard': '1' }, body: JSON.stringify(body) })).status, [path, body]);
    if (name) await call('/auth/register', { name, email, password: pw });
    await call('/auth/login', { email, password: pw }); await p.reload(); await p.waitForTimeout(700);
    return p;
  };
  const api = (p, m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await fetch('/api/v1' + path, { method: m, headers: { 'content-type': 'application/json', 'x-sketchboard': '1' }, body: body ? JSON.stringify(body) : undefined }); return r.status === 204 ? null : r.json(); }, [m, path, body]);
  const A = await mk('alice@example.com', null, 'alice password 1');
  const B = await mk('bob@example.com', 'Bob Marley', 'bob password 1');
  await A.goto('http://localhost:5173/#/'); await A.waitForTimeout(600);
  for (const bd of (await api(A, 'GET', '/boards')).boards) await api(A, 'DELETE', '/boards/' + bd.id);
  const made = await api(A, 'POST', '/boards', { name: 'Team plan', objects: [{ id: 's1', type: 'sticky', x: 100, y: 100, width: 200, height: 150, rotation: 0, text: 'hi', color: '#FFD43B' }] });
  const id = made.board.id;

  // Alice invites Bob from the Share panel
  await A.goto('http://localhost:5173/#/board/' + id); await A.waitForTimeout(1200);
  await A.getByTestId('share').click(); await A.waitForTimeout(600);
  ok('owner sees the People panel inside Share', (await A.getByTestId('people-panel').count()) === 1);
  await A.getByTestId('invite-email').fill('bob@example.com'); await A.getByTestId('invite-role').selectOption('viewer'); await A.getByTestId('invite-send').click(); await A.waitForTimeout(700);
  ok('Bob is listed as a member', (await A.getByTestId('member').count()) === 1 && (await A.getByTestId('member-list').textContent()).includes('Bob Marley'));
  ok('the activity list mentions the invite', (await A.getByTestId('activity').textContent()).includes('Bob'));

  // Bob sees it under "Shared with me", cannot rename/trash
  await B.goto('http://localhost:5173/#/'); await B.waitForTimeout(900);
  await B.getByTestId('filter-shared').click();
  ok('Bob sees the board under Shared with me', (await B.getByTestId('board-card').count()) === 1);
  ok('the card says who shared it and the right', (await B.getByTestId('board-card').textContent()).includes('By ') && (await B.getByTestId('board-card').textContent()).includes('can view'));
  ok('a shared card has no star', (await B.getByTestId('board-star').count()) === 0);
  await B.getByTestId('board-menu').click();
  ok('the card menu only offers Leave', (await B.getByTestId('board-leave').count()) === 1 && (await B.getByTestId('board-trash').count()) === 0);
  await B.keyboard.press('Escape'); await B.mouse.click(5, 5);

  // viewer: server refuses saving; board opens as view only
  await B.goto('http://localhost:5173/#/board/' + id); await B.waitForTimeout(1500);
  ok('Bob sees "View only"', (await B.getByTestId('viewer-badge').count()) === 1);
  ok('the button says People, not Share', (await B.getByTestId('share').textContent()).trim() === 'People');
  const put = await B.evaluate(async id => (await fetch('/api/v1/boards/' + id, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-sketchboard': '1' }, body: JSON.stringify({ objects: [], viewport: { x: 0, y: 0, scale: 1 } }) })).status, id);
  ok('server refuses a viewer to save (403)', put === 403);

  // promote to editor, then Bob can save and mentions Alice
  await api(A, 'PUT', `/boards/${id}/members`, { email: 'bob@example.com', role: 'editor' });
  const m = await api(B, 'POST', `/boards/${id}/mentions`, { handles: ['alice'], text: 'please look' });
  ok('an editor can @mention the owner', m.notified === 1);
  await A.goto('http://localhost:5173/#/'); await A.waitForTimeout(900);
  ok('Alice sees an unread count on the bell', (await A.getByTestId('bell-count').count()) === 1);
  await A.getByTestId('bell').click();
  ok('the notification text names Bob', (await A.getByTestId('bell-item').first().textContent()).includes('Bob'));
  await A.getByTestId('bell-read').click(); await A.waitForTimeout(500);
  ok('mark all as read clears the count', (await A.getByTestId('bell-count').count()) === 0);
  await A.getByTestId('bell-item').first().click(); await A.waitForTimeout(800);
  ok('clicking a notification opens the board', A.url().includes('/board/' + id));

  // Bob leaves
  await B.goto('http://localhost:5173/#/'); await B.waitForTimeout(800);
  await B.getByTestId('filter-shared').click(); await B.getByTestId('board-menu').click(); await B.getByTestId('board-leave').click(); await B.waitForTimeout(700);
  ok('after leaving, the board is gone for Bob', (await B.getByTestId('board-card').count()) === 0);
  const gone = await B.evaluate(async id => (await fetch('/api/v1/boards/' + id, { headers: { 'x-sketchboard': '1' } })).status, id);
  ok('and Bob gets 404 for it', gone === 404);
  await b.close();
})();
