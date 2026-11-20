# Sketchboard – Maintenance Document

Nov 17, 2026 · @Mansoor

This document tells the maintainer what to check, back up, update and fix to keep Sketchboard running on its free services, and how to change the code without breaking it.

## 1. Purpose, scope and ownership

**Scope.** The three hosted parts (website and API on Vercel, database on MongoDB Atlas, live collaboration on a Cloudflare Worker) and the code in the repository. Setup is in the Deployment Document; how the code works is in the SCD.

**Who does what**

| Part | Where it runs | Where to manage it | Owner |
| --- | --- | --- | --- |
| Website and API | Vercel (project root `web`) | vercel.com dashboard | Mansoor Ali Khan |
| Database | MongoDB Atlas M0 cluster | cloud.mongodb.com | Mansoor Ali Khan |
| Live collaboration | Cloudflare Worker `sketchboard-realtime` | dash.cloudflare.com and `wrangler` | Mansoor Ali Khan |
| Code | GitHub repository | github.com | Mansoor Ali Khan |

Add the names of other maintainers if this is a group project. Two people should have access to every account, so the project survives one person being away.

**Service level.** There is no formal guarantee. The aim for a university project: the site is usable during demos and grading, a failure is noticed within a day, and no board is lost.

## 2. Types of maintenance

| Type | Meaning | Sketchboard example |
| --- | --- | --- |
| Corrective | Fix a fault found after release | Sign-up fails on Atlas; an object is not drawn in dark mode |
| Adaptive | Keep working when the surroundings change | A free-plan limit changes; Node or a library needs a new major version; a browser changes behaviour |
| Perfective | Improve or add features | Phase 2: frames, comments, image upload, presentation mode, export |
| Preventive | Reduce future faults | Add tests, update packages, remove unused code, watch free-tier usage |

Work is done in this order of priority: security and data loss first, then faults that block the main flow (login, save, share, live editing), then smaller faults, then new features.

## 3. Routine tasks

| How often | Task | How |
| --- | --- | --- |
| Before every demo | Smoke test | Open the site, sign in, create a board, add a sticky, reload; open a share link in a private window and check **Live** |
| Weekly | Check the services are up | Open the site and `https://<worker-address>/health` (answers `ok`) |
| Weekly | Look for errors | Vercel Logs, and `npx wrangler tail` during a short test |
| Monthly | Check free-tier usage | Atlas: storage against 512 MB. Cloudflare: requests and row writes against the daily limits. Vercel: usage page |
| Monthly | Export a backup | See section 5 |
| Monthly | Update packages | See section 6 |
| Every term | Read the free-plan terms again | Vercel Hobby (non-commercial), Atlas M0, Cloudflare Workers free plan; limits can change |
| After any code change | Run `npm test` and `npm run build` in `web/` | Both must pass before pushing |

**Keep the project awake.** Atlas M0 clusters can be paused after a long period of inactivity. If the first request after a long gap fails, open the Atlas dashboard and resume the cluster.

## 4. Monitoring and logs

There is no paid monitoring. Use the free tools each service already gives.

| Symptom | Look here |
| --- | --- |
| Page does not load, or sign-up fails | Vercel, Project, **Logs**; filter by errors. Also the browser console (F12) |
| `MongoServerSelectionError` in a log | Atlas: Network Access must allow `0.0.0.0/0`; check the cluster is not paused and the password in `MONGODB_URI` |
| Not **Live**, or edits do not sync | `npx wrangler tail` in `realtime/` while reproducing it; check `REALTIME_URL` and the two `REALTIME_SECRET` values |
| Edits lost after everyone leaves | `wrangler tail` for save errors; check `API_BASE` and the Vercel logs for `PUT /api/v1/internal/boards/...` |
| Slowness | Vercel function region versus Atlas region; board size (many objects) |
| Usage near a limit | Atlas, Cloudflare and Vercel usage pages |

**Messages the app gives to users** and what they mean for you:

- "The server is missing MONGODB\_URI or SESSION\_SECRET": an environment variable is not set, or Vercel was not redeployed after setting it.
- "Something went wrong on our side": a server error; read the Vercel log.
- Join or share answers 503 `realtime_not_configured`: `REALTIME_URL` or `REALTIME_SECRET` is missing in Vercel.
- The Worker closes a socket with 4001 (bad token), 4003 (forbidden), 4004 (board not found) or 4010 (token expired): the first three are final and the client does not retry; 4010 is normal after a long idle and the client asks for a new pass.

**Write down every incident** (date, symptom, cause, fix) in the log in section 9; the same fault tends to return.

## 5. Backup and restore

**What to protect.** Only the database holds user data: the `users` and `boards` collections in Atlas. The code is in GitHub, and secrets must be kept separately by the owner (a password manager, not GitHub).

**The free plan has no scheduled backups**, so take them by hand.

**Back up (monthly, and before risky changes)**

1. Install MongoDB Database Tools on your computer.
2. Run `mongodump --uri "<MONGODB_URI>" --db sketchboard --out backup-YYYY-MM-DD`. If you set `MONGODB_DB`, use that name instead of `sketchboard`.
3. Store the folder somewhere private (not in the Git repository, because it contains user data and password hashes).

Alternative for a few boards: in Atlas open Collections, then `boards`, and use Export.

**Restore**

1. Check you are using the right cluster.
2. Run `mongorestore --uri "<MONGODB_URI>" --db sketchboard backup-YYYY-MM-DD/sketchboard`.
3. Open the site, sign in and check that boards load.

The room in Cloudflare keeps a copy of each board that is currently open and saves it to Atlas within about 5 seconds of the first change and shortly after the last person leaves, so a restore does not need anything from Cloudflare.

**Test a restore once** on a spare free cluster; a backup that was never restored is only a hope.

## 6. Updating dependencies and security

**Monthly package update (in `web/` and in `realtime/`)**

1. Create a branch.
2. `npm outdated` shows what is old; `npm audit` shows known security problems.
3. Update small steps first (`npm update`), then one major version at a time. Major jumps to check: React, Vite, TypeScript, Tailwind, Konva and `mongodb`.
4. Run `npm test` and `npm run build` in `web/`, and `npx tsc` in `realtime/`.
5. Run the browser checks from the Test Cases document for drawing, saving and two-window collaboration.
6. Merge; Vercel deploys. If `realtime/` changed, run `npx wrangler deploy`.

**Node.** The project uses Node 22. When Vercel or Cloudflare ask for a newer version, change it in Vercel (Settings, Node.js version) and test.

**Secrets.** Rotate `SESSION_SECRET` and `REALTIME_SECRET` once a term, and at once if one may have leaked. Changing `SESSION_SECRET` signs every user out. Change `REALTIME_SECRET` in Vercel and Cloudflare together, then redeploy both, or live editing breaks until they match.

**Database password.** Change it in Atlas, update `MONGODB_URI` in Vercel, redeploy.

**Keep out of GitHub:** `.env`, `.dev.vars`, `.data`, backups and any real connection string. Run `git status` before each push.

**Security gaps to close when time allows:** login attempt limit, e-mail verification and password reset, server-side session cancel, and a check on share rights while a person is connected (see the SCD, section 12).

## 7. Changing the code safely

**Working rules**

- Work on a branch; merge only when `npm test` and `npm run build` pass.
- Make one change at a time and test it in the browser before the next.
- Add a test for every fault you fix.
- Keep the documents in step with the code (SCD for code, API Documentation for routes, Database Design for data).

**Checklists for common changes**

| Change | Files to touch | Also check |
| --- | --- | --- |
| Add a template | `src/templates.ts` | It shows on the start page and opens correctly |
| Change colours or zoom limits | `src/constants.ts`, `src/index.css` | Light and dark mode |
| Add a keyboard shortcut | `src/useShortcuts.ts`, the manual's shortcut table | It does not clash with typing in a text box |
| Add a new object type (for example an image) | `src/types.ts` (type), `src/components/ObjectNode.tsx` (drawing), `src/components/Toolbar.tsx` and `Canvas.tsx` (tool), `PropertiesPanel.tsx` (options), `realtime/src/validate.ts` (allow the type in the room) | Add and diff tests in `ops.test.ts`; check two windows; the API already accepts unknown fields on objects |
| Add an API route | `api/_lib/core.ts` (route and zod schema), `api/_lib/store.ts` and both stores if data is needed, `src/api.ts` (client call) | Add a test in `api/_tests`; update the API Documentation |
| Change the realtime message format | `realtime/src/protocol.ts` **and** `src/realtime/protocol.ts`; `room.ts`, `validate.ts`, `connection.ts` | Deploy site and Worker together; run the two-window script |
| Add a field to boards or users | `api/_lib/types.ts`, both stores, the zod schema | Old documents lack the field, so give it a default when reading |
| Change a limit (5,000 objects, 3 MB, rate limit) | `api/_lib/core.ts`, `realtime/src/validate.ts`, `room.ts` | Keep the three places consistent and update the SCD |

**Rules specific to this code**

- Never filter or map an array inside a Zustand selector; select the raw value and derive it outside.
- Update objects by making new ones, never by changing them in place (undo and the operation diff depend on this).
- Whether someone may edit is decided on the server too; do not rely on hidden buttons.
- Imports inside `api/` use the `.js` ending.
- The two copies of `protocol.ts` must stay identical.

## 8. Incidents

When something breaks, go in this order and stop when it works.

1. **Confirm.** Reproduce it yourself in a private window. Note the time and the exact message.
2. **Contain.** If data may be exposed or damaged, stop the damage first: turn off sharing for the board, or rotate the secret in question (section 6).
3. **Check the services.** Vercel, Atlas and Cloudflare status pages and dashboards; is the cluster paused, is a limit reached?
4. **Read the logs** (section 4) at the time of the fault.
5. **Roll back** if a recent deployment caused it: Vercel Deployments, promote the last good one; for the Worker, redeploy the earlier commit.
6. **Fix on a branch**, add a test, deploy, and run the smoke test.
7. **Record it** in the incident log below.

| Situation | First action |
| --- | --- |
| Nobody can sign in or save | Check Atlas (paused, network, password) and Vercel variables |
| Live editing is down | The app still works alone; check Worker and variables; tell users to carry on and reload later |
| A user says their board is gone | Check the `boards` collection for the board id; restore from the latest backup if needed |
| A secret was pasted into GitHub | Treat it as leaked: rotate it now, then remove it from the Git history |
| Free daily limit reached on Cloudflare | Wait for the daily reset; boards keep saving normally |

## 9. Known issues, backlog, handover and logs

**Known issues** (from the SCD and the test report; none blocks use)

- Stacking order is not shared between people.
- Every guest is named "Guest".
- Creating a sticky note and typing its text are two undo steps.
- Share rights are checked only when someone joins; turning sharing off does not disconnect people already in.
- Connector anchors ignore rotation.
- Sessions cannot be cancelled from the server; no login attempt limit, e-mail check or password reset.

**Improvement backlog**

| Item | Type | Size |
| --- | --- | --- |
| Login attempt limit; password reset by e-mail | Preventive | Medium |
| Sync stacking order; guest names | Corrective | Small |
| Version snapshots (keep the last 5 per board) | Perfective | Medium |
| Frames, comments, image upload | Perfective (Phase 2) | Large |
| Presentation mode, export to PNG or PDF | Perfective (Phase 2) | Large |
| Timer, voting, reactions, mind map | Perfective (Phase 3) | Large |
| Run the browser scripts automatically on every push (GitHub Actions) | Preventive | Medium |

**Handover checklist**

- [ ] Access to GitHub, Vercel, Atlas and Cloudflare for at least two people
- [ ] Both secrets and the database password stored in a password manager (not in GitHub)
- [ ] The newest backup stored privately, with the date
- [ ] The Deployment Document, this document and the SCD read by the new maintainer
- [ ] A full smoke test run together once

**Incident and change log** (add a row for every incident or release)

| Date | What happened or changed | Cause | Fix | By |
| --- | --- | --- | --- | --- |
| 2026-11-17 | Documents completed; Stage 5 code, 27 automated tests passing |  |  |  |
|  |  |  |  |  |

## Appendix: Update for Stages 6–11

### Limits to know

| Item | Limit |
| --- | --- |
| Picture | 150,000 characters in the browser, 200,000 on the realtime server |
| Other object | 64,000 characters |
| Board | 5,000 objects and 3 MB |
| Comment | 500 characters, 50 messages |
| Votes | 5 per person |
| Reaction | once per 0.4 s, lives 3.5 s |
| Versions | newest 5 per board, 8,000,000 characters total |

### Rule: keep three type lists in sync

When you add an object type, change all three places, or live editing or saving will refuse it:

1. `BoardObject` in `web/src/types.ts`.
2. `ObjType` in both copies of `protocol.ts` (`web/src/realtime/` and `realtime/src/`) and `TYPES` in `realtime/src/validate.ts`.
3. The zod enum in `web/api/_lib/core.ts`.

Then redeploy the Worker. Overlay types (width and height 0) must also be added to `isOverlay()` in `kinds.ts`.

### Routine checks

- Look at the `versions` collection size in Atlas now and then. Each document is for one board and is capped.
- Orphan votes (vote objects whose sticky was deleted) and stale reactions can be removed from a board by hand if they pile up.
- Run `npm test` in `web/` before every deploy. Expect 57 passing.

### Known limitations

Concurrent comment replies are last-write-wins. Private mode is display-only. The timer depends on each computer's clock. Only the owner can save and restore versions. A reaction can linger if the sender closes the tab. Frame contents use a "centre inside" rule and ignore rotation.
