// Stage 21: word-level formatting. Select single words in a sticky note and make them bold / italic / coloured.
// Guest mode, needs `npm run dev` on 5173.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e)));
  const objs = () => p.evaluate(() => window.__board.getState().objects);
  const sticky = async () => (await objs()).find(o => o.type === 'sticky');
  await p.goto('http://localhost:5173/#/'); await p.waitForTimeout(900);
  await p.getByTestId('new-board').click(); await p.waitForTimeout(700);

  await p.keyboard.press('n'); await p.mouse.click(500, 350); await p.waitForTimeout(250);
  ok('editing a sticky uses the word editor', (await p.getByTestId('rich-editor').count()) === 1);
  await p.keyboard.type('hello big world'); await p.waitForTimeout(100);
  // select "big": Home, 6 x Right, Shift + 3 x Right
  await p.keyboard.press('Home'); for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowRight');
  await p.keyboard.down('Shift'); for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight'); await p.keyboard.up('Shift');
  await p.getByTestId('fmt-bold').click(); await p.waitForTimeout(100);
  ok('the Bold button shows pressed for the selected word', (await p.getByTestId('fmt-bold').getAttribute('aria-pressed')) === 'true');
  // "world": italic with the keyboard, then a colour
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); // past the space ... then select 5 letters
  await p.keyboard.down('Shift'); for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight'); await p.keyboard.up('Shift');
  await p.keyboard.press('Control+i');
  await p.getByLabel('Word colour #E03131').click(); await p.waitForTimeout(100);
  await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  let s = await sticky();
  console.log(JSON.stringify(s.text), JSON.stringify(s.spans));
  ok('the text itself is unchanged', s.text === 'hello big world');
  ok('"big" is a bold span', (s.spans || []).some(x => x.s === 6 && x.e === 9 && x.b === true && !x.i));
  ok('"world" is italic and red', (s.spans || []).some(x => x.s === 10 && x.e === 15 && x.i === true && x.c === '#e03131'));
  ok('"hello" has no style', !(s.spans || []).some(x => x.s < 5));
  ok('the object-level flags stay off', !s.bold && !s.italic);
  await p.screenshot({ path: 'e2e/out-rich.png' });

  // survives re-opening the editor (styles come back as styled words)
  await p.mouse.dblclick(s.x + 100, s.y + 60); await p.waitForTimeout(300);
  const html = await p.getByTestId('rich-editor').innerHTML();
  ok('re-opening shows the styled words', /font-weight:\s*700/.test(html) && /font-style:\s*italic/.test(html));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('closing without a change does not make an extra edit', JSON.stringify((await sticky()).spans) === JSON.stringify(s.spans));

  // undo takes back text and styles together
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  s = await sticky();
  ok('undo removes the word styles in one step', !s.spans || s.spans.length === 0);
  await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(150);
  ok('redo brings them back', ((await sticky()).spans || []).length >= 2);

  // whole-object bold first, then edit: it is moved into the words
  await p.mouse.click(s.x + 100, s.y + 60); await p.waitForTimeout(150);
  await p.getByTestId('fmt-bold').click(); await p.waitForTimeout(150);
  ok('whole-object Bold still works when not editing', (await sticky()).bold === true);
  await p.mouse.dblclick(s.x + 100, s.y + 60); await p.waitForTimeout(300);
  await p.keyboard.press('End'); await p.keyboard.type('!'); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  s = await sticky();
  ok('editing moves object-level bold into the words', s.bold === false && s.text === 'hello big world!' && (s.spans || []).some(x => x.s === 0 && x.b === true));

  // survives a reload (guest boards are saved in the browser)
  await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(1200);
  const again = await sticky();
  ok('styles are saved with the board', !!again && JSON.stringify(again.spans) === JSON.stringify(s.spans));

  // Enter makes a new line, and a trailing empty line survives
  await p.mouse.dblclick(again.x + 100, again.y + 60); await p.waitForTimeout(300);
  await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('line two'); await p.keyboard.press('Escape'); await p.waitForTimeout(250);
  ok('Enter adds a line', (await sticky()).text === 'hello big world!\nline two');
  await b.close();
})();
