// Stage 20b: teams. Alice makes a team, adds Bob, moves a board into it, Bob sees it and edits; admin/member rights; leave; delete.
// Needs `npm run dev` on 5173 (no ABLY key needed) with alice@example.com registered. bob@example.com is registered here.
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
  for (const t of (await api(A, 'GET', '/teams')).teams) await api(A, 'DELETE', '/teams/' + t.id);
  for (const bd of (await api(A, 'GET', '/boards')).boards) await api(A, 'DELETE', '/boards/' + bd.id);
  await api(A, 'POST', '/boards', { name: 'Solo notes', objects: [] });
  await A.reload(); await A.waitForTimeout(900);

  // create a team from the dashboard
  await A.getByTestId('new-team').click(); await A.getByTestId('new-team-name').fill('Design crew'); await A.getByTestId('new-team-create').click(); await A.waitForTimeout(900);
  ok('a team chip appears and is selected', (await A.getByTestId('filter-team:' + (await api(A, 'GET', '/teams')).teams[0].id).getAttribute('aria-pressed')) === 'true');
  ok('the team banner is shown', (await A.getByTestId('team-banner').textContent()).includes('Design crew'));

  // add Bob through the team panel
  await A.getByTestId('team-manage').click(); await A.getByTestId('team-email').fill('bob@example.com'); await A.getByTestId('team-invite').click(); await A.waitForTimeout(700);
  ok('Bob is listed in the team', (await A.getByTestId('team-members').textContent()).includes('Bob Marley'));
  await A.mouse.click(5, 5); await A.waitForTimeout(300);

  // a board created while the team is selected belongs to the team
  await A.getByTestId('new-board').click(); await A.waitForTimeout(1200);
  const boardUrl = A.url(); const bid = boardUrl.split('/board/')[1];
  ok('a new board opened', !!bid);
  await A.goto('http://localhost:5173/#/'); await A.waitForTimeout(800);
  const mine = (await api(A, 'GET', '/boards')).boards.find(x => x.id === bid);
  ok('the new board is in the team', mine && mine.teamName === 'Design crew');

  // Bob sees it in the team view, with the team name
  await B.goto('http://localhost:5173/#/'); await B.reload(); await B.waitForTimeout(1000);
  ok('Bob has a team chip', (await B.locator('[data-testid^="filter-team:"]').count()) === 1);
  await B.locator('[data-testid^="filter-team:"]').click();
  ok('Bob sees the team board (can edit)', (await B.getByTestId('board-card').count()) === 1 && (await B.getByTestId('board-card').textContent()).includes('can edit'));
  // Bob can save, but cannot trash it
  const save = await api(B, 'PUT', '/boards/' + bid, { objects: [], viewport: { x: 0, y: 0, scale: 1 } });
  ok('Bob can save to it', !!save.updatedAt);
  const trash = await B.evaluate(async id => (await fetch('/api/v1/boards/' + id, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-sketchboard': '1' }, body: JSON.stringify({ trashed: true }) })).status, bid);
  ok('Bob cannot trash it (403)', trash === 403);
  // Bob opens the board: People button, team note
  await B.goto('http://localhost:5173/#/board/' + bid); await B.waitForTimeout(1500);
  await B.getByTestId('share').click(); await B.waitForTimeout(600);
  ok('the People panel says the team can open it', (await B.getByTestId('people-team').textContent()).includes('Design crew'));

  // move Alice's solo board into the team via the card menu
  await A.goto('http://localhost:5173/#/'); await A.waitForTimeout(800);
  await A.getByTestId('filter-all').click();
  const card = A.getByTestId('board-card').filter({ hasText: 'Solo notes' });
  await card.getByTestId('board-menu').click(); await A.getByTestId('board-team').click(); await A.getByTestId('move-team-Design crew').click(); await A.waitForTimeout(700);
  const bobList = await api(B, 'GET', '/boards');
  ok('after the move Bob sees two team boards', bobList.shared.filter(x => x.teamName === 'Design crew').length === 2);

  // Bob leaves; the boards disappear for him
  await B.goto('http://localhost:5173/#/'); await B.waitForTimeout(800);
  await B.locator('[data-testid^="filter-team:"]').click(); await B.getByTestId('team-manage').click(); await B.getByTestId('team-leave').click(); await B.waitForTimeout(800);
  ok('after leaving, Bob has no team boards', (await api(B, 'GET', '/boards')).shared.length === 0);

  // delete the team: boards become personal again
  await A.reload(); await A.waitForTimeout(900);
  await A.locator('[data-testid^="filter-team:"]').click(); await A.getByTestId('team-manage').click();
  await A.getByTestId('team-delete').click(); await A.getByTestId('team-delete').click(); await A.waitForTimeout(900);
  ok('team is gone', (await api(A, 'GET', '/teams')).teams.length === 0);
  ok('Alice still has both boards, now personal', (await api(A, 'GET', '/boards')).boards.filter(x => !x.teamId).length === 2);
  await b.close();
})();
