// Stage 16: profile page, change password, forgot/reset password, delete account, Google button wiring.
// Needs `npm run dev` on port 5173 with its output saved to /tmp/dev.log (the dev server prints reset e-mails there):
//   npm run dev > /tmp/dev.log 2>&1 &
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const R = []; process.on('exit', () => console.log(R.join('\n')));
  const ok = (n, c) => R.push((c ? 'PASS ' : 'FAIL ') + n);
  const LOG = process.env.DEV_LOG || '/tmp/dev.log';
  const email = `zed${Date.now()}@example.com`;
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const wait = (ms = 400) => p.waitForTimeout(ms);

  // sign up
  await p.goto('http://localhost:5173/#/login'); await wait(700);
  ok('no Google button when the server has no Google client id', (await p.getByTestId('google-button').count()) === 0);
  await p.getByTestId('auth-switch').click();
  await p.getByTestId('auth-name').fill('Zed Khan'); await p.getByTestId('auth-email').fill(email); await p.getByTestId('auth-password').fill('first password 1');
  await p.getByTestId('auth-submit').click(); await wait(900);

  // profile page
  await p.getByTestId('account').click(); await p.getByTestId('profile-link').click(); await wait(500);
  ok('profile page opens at #/profile', p.url().endsWith('#/profile') && (await p.getByTestId('profile-email').textContent()) === email);
  ok('shows password sign-in is on, Google not connected', (await p.getByTestId('profile-haspw').textContent()) === 'On' && (await p.getByTestId('profile-google').textContent()).startsWith('Not connected'));
  ok('Save is disabled until the name changes', await p.getByTestId('profile-save-name').isDisabled());
  await p.getByTestId('profile-name').fill('Zed K'); await p.getByTestId('profile-save-name').click(); await wait();
  ok('name saved', (await p.getByTestId('profile-name-note').textContent()) === 'Name saved.');
  await p.reload(); await wait(900);
  ok('...and it is still the new name after a reload', (await p.getByTestId('profile-name').inputValue()) === 'Zed K');

  // change password: wrong current, too short, then right
  await p.getByTestId('profile-current').fill('wrong one'); await p.getByTestId('profile-new').fill('second password 2'); await p.getByTestId('profile-save-pw').click(); await wait();
  ok('wrong current password is refused', (await p.getByTestId('profile-pw-note').textContent()).includes('not correct'));
  await p.getByTestId('profile-current').fill('first password 1'); await p.getByTestId('profile-new').fill('short'); await p.getByTestId('profile-save-pw').click(); await wait();
  ok('too short new password is explained', (await p.getByTestId('profile-pw-note').textContent()).includes('at least 8'));
  await p.getByTestId('profile-new').fill('second password 2'); await p.getByTestId('profile-save-pw').click(); await wait();
  ok('password changed', (await p.getByTestId('profile-pw-note').textContent()) === 'Password changed.');

  // sign out and in with the new password
  await p.getByTestId('profile-back').click(); await wait(500);
  await p.getByTestId('account').click(); await p.getByTestId('sign-out').click(); await wait(500);
  await p.goto('http://localhost:5173/#/login'); await wait(500);
  await p.getByTestId('auth-email').fill(email); await p.getByTestId('auth-password').fill('first password 1'); await p.getByTestId('auth-submit').click(); await wait(700);
  ok('old password no longer works', (await p.getByTestId('auth-error').textContent()).includes('Wrong email or password'));
  await p.getByTestId('auth-password').fill('second password 2'); await p.getByTestId('auth-submit').click(); await wait(900);
  ok('new password signs in', (await p.getByTestId('account').count()) === 1);

  // forgot password
  await p.getByTestId('account').click(); await p.getByTestId('sign-out').click(); await wait(400);
  await p.goto('http://localhost:5173/#/login'); await wait(600);
  await p.getByTestId('auth-forgot').click(); await wait(400);
  ok('Forgot password? opens the forgot screen', p.url().endsWith('#/forgot'));
  await p.getByTestId('forgot-submit').click(); await wait(200);
  ok('empty e-mail is explained', (await p.getByTestId('forgot-error').textContent()).includes('valid email'));
  await p.getByTestId('forgot-email').fill(email); await p.getByTestId('forgot-submit').click(); await wait(800);
  ok('confirmation is shown', (await p.getByTestId('forgot-sent').textContent()).includes('a link is on its way'));
  const log = fs.readFileSync(LOG, 'utf8');
  const links = [...log.matchAll(new RegExp('to ' + email.replace('.', '\\.') + '[\\s\\S]*?#/reset/([\\w-]+)', 'g'))];
  ok('the reset e-mail was "sent" (printed by the dev server)', links.length === 1);
  const token = links[0] && links[0][1];

  await p.goto('http://localhost:5173/#/reset/' + token); await wait(800);
  await p.getByTestId('reset-password').fill('third password 3'); await p.getByTestId('reset-again').fill('different'); await p.getByTestId('reset-submit').click(); await wait(200);
  ok('passwords that differ are caught', (await p.getByTestId('reset-error').textContent()).includes('not the same'));
  await p.getByTestId('reset-again').fill('third password 3'); await p.getByTestId('reset-submit').click(); await wait(1000);
  ok('reset signs you in and goes to your boards', (await p.getByTestId('account').count()) === 1 && !p.url().includes('reset'));

  // the same link cannot be used twice
  await p.getByTestId('account').click(); await p.getByTestId('sign-out').click(); await wait(400);
  await p.goto('http://localhost:5173/#/reset/' + token); await wait(700);
  await p.getByTestId('reset-password').fill('fourth password 4'); await p.getByTestId('reset-again').fill('fourth password 4'); await p.getByTestId('reset-submit').click(); await wait(700);
  ok('a used reset link is refused', (await p.getByTestId('reset-expired').count()) === 1);

  // Google button wiring (a pretend Google, because the real one needs the internet and a client id)
  const g = await ctx.newPage(); const gerrs = []; g.on('pageerror', e => gerrs.push(String(e)));
  await g.route('**/api/v1/auth/config', r => r.fulfill({ json: { google: 'fake-client-id', resetEmail: true } }));
  await g.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: {
      initialize(o) { window.__cb = o.client_id === 'fake-client-id' ? o.callback : null; },
      renderButton(el) { const b = document.createElement('button'); b.textContent = 'Fake Google'; b.id = 'fake-g'; b.onclick = () => window.__cb({ credential: 'x'.repeat(50) }); el.appendChild(b); }
    } } };` }));
  await g.goto('http://localhost:5173/#/login'); await g.waitForTimeout(900);
  ok('Google button is shown when the server offers it', (await g.locator('#fake-g').count()) === 1);
  await g.locator('#fake-g').click(); await g.waitForTimeout(700);
  ok('clicking it sends the token to the server and shows the answer (dev server has no Google set up)', (await g.getByTestId('auth-error').textContent()).includes('not set up'));
  await g.close();

  // delete account
  await p.goto('http://localhost:5173/#/login'); await wait(600);
  await p.getByTestId('auth-email').fill(email); await p.getByTestId('auth-password').fill('third password 3'); await p.getByTestId('auth-submit').click(); await wait(900);
  await p.getByTestId('account').click(); await p.getByTestId('profile-link').click(); await wait(500);
  ok('Delete stays disabled until the e-mail is typed', await p.getByTestId('profile-delete').isDisabled());
  await p.getByTestId('profile-confirm').fill(email); await p.getByTestId('profile-delete').click(); await wait(1000);
  ok('deleting goes back to the front page, signed out', (await p.getByTestId('landing').count()) === 1);
  await p.goto('http://localhost:5173/#/login'); await wait(500);
  await p.getByTestId('auth-email').fill(email); await p.getByTestId('auth-password').fill('third password 3'); await p.getByTestId('auth-submit').click(); await wait(700);
  ok('the deleted account cannot sign in', (await p.getByTestId('auth-error').textContent()).includes('Wrong email or password'));

  ok('no page errors ' + JSON.stringify(errs.concat(gerrs)), errs.length + gerrs.length === 0);
  await b.close();
})();
