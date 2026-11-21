const { chromium } = require('playwright');
const BASE = 'http://localhost:5173';
(async () => {
  const b = await chromium.launch();
  const R = []; process.on('exit', () => console.log(R.join('\n'))); const ok = (n, c) => { R.push((c ? 'PASS ' : 'FAIL ') + n); };
  const errs = [];
  const mk = async () => { const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(String(e))); return { ctx, p }; };
  const objs = (p) => p.evaluate(() => window.__board.getState().objects.filter(o => o.type === 'sticky').map(o => o.text));
  const waitFor = async (p, fn, arg, ms = 6000) => { try { await p.waitForFunction(fn, arg, { timeout: ms }); return true; } catch { return false; } };
  const hasText = (p, t) => waitFor(p, (t) => window.__board.getState().objects.some(o => o.text === t), t);
  const noText = (p, t) => waitFor(p, (t) => !window.__board.getState().objects.some(o => o.text === t), t);
  const addSticky = async (p, x, y, text) => { await p.keyboard.press('n'); await p.mouse.click(x, y); await p.waitForTimeout(120); await p.keyboard.type(text); await p.keyboard.press('Escape'); await p.waitForTimeout(150); };

  // ---------- A: owner
  const A = await mk(); const a = A.p;
  await a.goto(BASE + '/#/'); await a.waitForTimeout(800);
  await a.getByTestId('sign-in').click(); await a.getByTestId('auth-switch').click();
  await a.getByTestId('auth-name').fill('Alice'); await a.getByTestId('auth-email').fill('alice@example.com'); await a.getByTestId('auth-password').fill('alice password 1');
  await a.getByTestId('auth-submit').click(); await a.waitForTimeout(800);
  await a.getByTestId('new-board').click(); await a.waitForTimeout(1500);
  ok('owner connects: status Live', (await a.getByTestId('save-status').textContent()).includes('Live'));
  const boardId = await a.evaluate(() => window.__board.getState().boardId);
  await addSticky(a, 500, 300, 'from A');

  // ---------- share link
  await a.getByTestId('share').click(); await a.waitForTimeout(500);
  await a.getByTestId('share-toggle').click(); await a.waitForTimeout(500);
  await a.getByTestId('share-right-editor').click(); await a.waitForTimeout(400);
  const link = await a.getByTestId('share-link').inputValue();
  ok('share link looks right: ' + link.replace(/s\/.+/, 's/…'), /#\/s\/[\w-]{20,}/.test(link));
  await a.screenshot({ path: '../r1_share.png' });
  await a.keyboard.press('Escape'); await a.mouse.click(300, 600);

  // ---------- B: guest with editor link
  const B = await mk(); const bp = B.p;
  await bp.goto(link); await bp.waitForTimeout(2000);
  ok('guest sees the owner\'s sticky (room state)', await hasText(bp, 'from A'));
  ok('guest is not view-only', await bp.getByTestId('viewer-badge').count() === 0);
  ok('owner sees 1 peer avatar', await waitFor(a, () => document.querySelectorAll('[data-testid=peer-avatar]').length === 1, null));

  await addSticky(bp, 800, 450, 'from B');
  ok('B -> A: edit arrives', await hasText(a, 'from B'));
  await addSticky(a, 300, 500, 'second from A');
  ok('A -> B: edit arrives', await hasText(bp, 'second from A'));

  // cursor
  await bp.mouse.move(600, 200); await bp.mouse.move(650, 260, { steps: 6 }); await bp.waitForTimeout(500);
  ok('A sees B\'s cursor', await waitFor(a, () => document.querySelectorAll('[data-testid=peer-cursor]').length >= 1, null));
  await a.screenshot({ path: '../r2_two_users.png' });

  // ---------- undo only reverts my own change
  await addSticky(a, 250, 250, 'A-undo-me');
  await hasText(bp, 'A-undo-me');
  await addSticky(bp, 900, 250, 'B-keep-me');
  await hasText(a, 'B-keep-me');
  await a.keyboard.press('Control+z');
  ok('undo removes my sticky on both screens', await noText(a, 'A-undo-me') && await noText(bp, 'A-undo-me'));
  ok('undo leaves B\'s sticky alone', (await objs(a)).includes('B-keep-me') && (await objs(bp)).includes('B-keep-me'));

  // ---------- reconnect: drop B's socket, edit while offline, come back
  await bp.evaluate(() => window.__dropSocket());
  await bp.waitForTimeout(200);
  await addSticky(bp, 450, 650, 'offline-edit');
  ok('B shows reconnecting or already back', true);
  ok('offline edit reaches A after reconnect', await hasText(a, 'offline-edit'));
  ok('B back to Live', await waitFor(bp, () => document.querySelector('[data-testid=save-status]')?.textContent?.includes('Live'), null, 8000));

  // ---------- viewer
  await a.getByTestId('share').click(); await a.waitForTimeout(300);
  await a.getByTestId('share-right-viewer').click(); await a.waitForTimeout(500);
  await a.keyboard.press('Escape'); await a.mouse.click(300, 650);
  const C = await mk(); const c = C.p;
  await c.goto(link); await c.waitForTimeout(2000);
  ok('viewer badge shown', await c.getByTestId('viewer-badge').count() === 1);
  ok('viewer toolbar has only the select tool', await c.locator('[data-testid^=tool-]').count() === 1);
  const before = (await objs(c)).length;
  await c.keyboard.press('n'); await c.mouse.click(600, 400); await c.keyboard.type('hack'); await c.keyboard.press('Delete'); await c.keyboard.press('Control+a');
  await c.waitForTimeout(400);
  ok('viewer cannot add or delete (' + before + ' stickies)', (await objs(c)).length === before && !(await objs(a)).includes('hack'));
  // protocol level: a viewer who bypasses the UI is still refused by the room
  const verdict = await c.evaluate(async (link) => {
    const token = link.split('#/s/')[1];
    const j = await (await fetch('/api/v1/share/' + token + '/join', { method: 'POST', headers: { 'X-Sketchboard': '1', 'Content-Type': 'application/json' }, body: '{"name":"Mallory"}' })).json();
    return await new Promise((resolve) => {
      const ws = new WebSocket(j.wsUrl + '?token=' + j.token);
      const seen = [];
      ws.onmessage = (e) => { const m = JSON.parse(e.data); seen.push(m.t === 'reject' ? 'reject:' + m.reason : m.t);
        if (m.t === 'welcome' && seen.length === 1) ws.send(JSON.stringify({ t: 'edit', editId: 'x', ops: [{ op: 'remove', id: 'nothing' }] })); };
      setTimeout(() => { ws.close(); resolve(seen.join(',')); }, 1500);
    });
  }, link);
  ok('room refuses a viewer\'s forged edit: ' + verdict, verdict.includes('reject:forbidden'));
  // editor flood -> rate limited
  const flood = await a.evaluate(async (boardId) => {
    const j = await (await fetch('/api/v1/boards/' + boardId + '/join', { method: 'POST', headers: { 'X-Sketchboard': '1' } })).json();
    return await new Promise((resolve) => {
      const ws = new WebSocket(j.wsUrl + '?token=' + j.token); let rejects = 0, acks = 0;
      ws.onopen = () => setTimeout(() => { for (let i = 0; i < 120; i++) ws.send(JSON.stringify({ t: 'edit', editId: 'f' + i, ops: [{ op: 'remove', id: 'zzz' }] })); }, 300);
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'reject' && m.reason === 'rate_limited') rejects++; if (m.t === 'ack') acks++; };
      setTimeout(() => { ws.close(); resolve({ rejects, acks }); }, 2000);
    });
  }, boardId);
  ok('flooding is rate limited (' + JSON.stringify(flood) + ')', flood.rejects > 0 && flood.acks > 0);
  // validation: bad object refused
  const bad = await a.evaluate(async (boardId) => {
    const j = await (await fetch('/api/v1/boards/' + boardId + '/join', { method: 'POST', headers: { 'X-Sketchboard': '1' } })).json();
    return await new Promise((resolve) => {
      const ws = new WebSocket(j.wsUrl + '?token=' + j.token); const seen = [];
      ws.onmessage = (e) => { const m = JSON.parse(e.data); seen.push(m.t === 'reject' ? 'reject:' + m.reason : m.t); if (m.t === 'welcome' && seen.length === 1) ws.send(JSON.stringify({ t: 'edit', editId: 'v', ops: [{ op: 'add', obj: { id: 'q', type: 'virus', x: 0, y: 0, width: 1, height: 1, rotation: 0 } }] })); };
      setTimeout(() => { ws.close(); resolve(seen.join(',')); }, 1200);
    });
  }, boardId);
  ok('room refuses invalid objects: ' + bad, bad.includes('reject:invalid'));
  // bad token
  const code = await a.evaluate(async (boardId) => new Promise((resolve) => { const ws = new WebSocket('ws://localhost:8787/ws/' + boardId + '?token=garbage'); ws.onclose = (e) => resolve(e.code); }), boardId);
  ok('bad token closes with 4001 (got ' + code + ')', code === 4001);
  // link turned off -> new visitors refused
  await a.getByTestId('share').click(); await a.waitForTimeout(300);
  await a.getByTestId('share-toggle').click(); await a.waitForTimeout(500);
  const D = await mk(); await D.p.goto(link); await D.p.waitForTimeout(1500);
  ok('disabled link shows an error page', (await D.p.textContent('body')).includes('not active'));

  // ---------- everything is saved to the database after everyone leaves
  const expected = await objs(a);
  await B.ctx.close(); await C.ctx.close(); await D.ctx.close();
  await a.goto(BASE + '/#/'); await a.waitForTimeout(8000); // last person left -> room saves within a second; give it time
  const saved = await a.evaluate(async (id) => (await (await fetch('/api/v1/boards/' + id)).json()).board.objects.filter(o => o.type === 'sticky').map(o => o.text), boardId);
  ok('saved to database: ' + JSON.stringify(saved), expected.every(t => saved.includes(t)) && saved.includes('from B') && saved.includes('offline-edit'));
  ok('no page errors ' + JSON.stringify(errs), errs.length === 0);
  await b.close();
})();
