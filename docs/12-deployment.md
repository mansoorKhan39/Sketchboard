# Sketchboard – Deployment Document

Nov 17, 2026 · @Mansoor

## 1. At a glance

Sketchboard runs on three free services: Vercel hosts the website and the API, MongoDB Atlas stores users and boards, and a Cloudflare Worker adds live collaboration.

&#91;embedded content: hosting map · 4 parts, 4 links\]

The browser loads the site and talks to the API over HTTPS. For a shared board it asks the API for a short-lived join pass, then opens a WebSocket to the Worker. The Worker keeps one Room per board and saves the board back through the API, so the database is never reached from Cloudflare.

## 2. Before you start

Three free accounts and about one hour are enough; none of the three free plans asks for a card.

| Account | Used for | Free plan |
| --- | --- | --- |
| GitHub | Holds the code; Vercel deploys from it | Free |
| MongoDB Atlas | Database | M0 cluster, 512 MB |
| Vercel | Website and API | Hobby (personal, non-commercial use only) |
| Cloudflare | Live collaboration (Worker + Durable Object) | Workers free plan |

**Tools on your computer:** Node 22, Git, a terminal. Check with `node -v` and `git --version`.

**Make two secrets.** Run this twice and keep both results; they must be different values and must never be put in GitHub or in a document:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

First result is `SESSION_SECRET`, second is `REALTIME_SECRET`.

**Order matters.** The website needs the Worker's address, and the Worker needs the website's address. The steps below break the circle by deploying the website first (works alone), then the Worker, then adding the Worker's address to the website.

**Free-tier limits to remember**

- Atlas M0 stores 512 MB. A board is one document, at most 5,000 objects and about 3 MB.
- Vercel Hobby is for non-commercial use.
- Cloudflare free plan: 100,000 requests per day; incoming WebSocket messages count 1 per 20 messages; 100,000 database rows written per day across all rooms. A busy classroom can reach this, and then live editing pauses until the next day while boards keep working alone.

## 3. Step 1: database (MongoDB Atlas)

1. Create a free **M0** cluster at cloud.mongodb.com.
2. **Database Access**: add a database user with a username and password. Keep the password.
3. **Network Access**: add IP address and choose **Allow access from anywhere** (`0.0.0.0/0`). Vercel's servers have no fixed address, so this is required. The user password is what protects the database.
4. **Connect, then Drivers**: copy the connection string and replace `<password>` with your password. If the password has special characters such as `@ : / ?`, URL-encode them (or choose a password with letters and digits only).

The result is `MONGODB_URI`. The app creates its collections and indexes itself on first use, so nothing else is needed in Atlas.

**Done when:** you hold a connection string that starts with `mongodb+srv://`.

## 4. Steps 2 and 3: website, then live collaboration

**Step 2: website and API (Vercel)**

1. Push the project to GitHub (the folder that holds `README.md`, `web/` and `realtime/`).
2. In Vercel: **Add New, then Project**, and import the repository.
3. Set **Root Directory** to `web`. Vercel detects Vite on its own.
4. Add two Environment Variables: `MONGODB_URI` (from step 1) and `SESSION_SECRET` (the first secret you made).
5. Click **Deploy**. Note the address, for example `https://sketchboard-xyz.vercel.app`.
6. Open it, create an account, make a board, refresh. If the board is still there, the website, API and Atlas work.

At this point the app works for one person. Sharing and live editing need step 3.

**Step 3: live collaboration (Cloudflare Worker)**

1. In a terminal: `cd realtime`, then `npm install`, then `npx wrangler login` (a browser window opens to sign in).
2. Open `realtime/wrangler.jsonc` and change `API_BASE` to your Vercel address, with no slash at the end. Example: `https://sketchboard-xyz.vercel.app`.
3. Store the second secret in Cloudflare: `npx wrangler secret put REALTIME_SECRET`, and paste it when asked.
4. Run `npx wrangler deploy`. It prints an address such as `https://sketchboard-realtime.<your-name>.workers.dev`.
5. In Vercel, add two more Environment Variables: `REALTIME_URL` = the same address but starting with `wss://`, and `REALTIME_SECRET` = the same second secret.
6. In Vercel choose **Redeploy**. Variables only apply to new deployments, so this step cannot be skipped.

**Why a separate Worker:** Vercel functions cannot hold a WebSocket open, and Durable Objects can, so one Room per board lives on Cloudflare. The Worker saves boards back to Vercel through `API_BASE`, so that address must be reachable from the internet.

**Done when:** `https://<worker-address>/health` answers `ok` and a signed-in board shows **Live** in the top bar.

## 5. Environment variables

Values are never written in this document or in GitHub; only their names and where they come from.

| Name | Where it goes | Comes from | Required |
| --- | --- | --- | --- |
| `MONGODB_URI` | Vercel | Atlas, Connect, Drivers | Yes |
| `SESSION_SECRET` | Vercel | First random secret | Yes |
| `MONGODB_DB` | Vercel | Your choice; default `sketchboard` | No |
| `REALTIME_URL` | Vercel | Worker address, starting with `wss://` | For live editing |
| `REALTIME_SECRET` | Vercel **and** Cloudflare (`wrangler secret put`) | Second random secret; identical in both places | For live editing |
| `API_BASE` | `realtime/wrangler.jsonc` (a plain variable, not secret) | Vercel address, no trailing slash | For live editing |

**Rules**

- If `MONGODB_URI` or `SESSION_SECRET` is missing, the API refuses to start and sign-up shows "The server is missing MONGODB\_URI or SESSION\_SECRET".
- If only one of `REALTIME_URL` and `REALTIME_SECRET` is set, live editing stays off and the rest of the app still works (share and join routes answer 503).
- Change a variable in Vercel, then **Redeploy**. Change `API_BASE`, then `npx wrangler deploy` again.
- Do not reuse the same value for the two secrets, and rotate them if one leaks (rotating `SESSION_SECRET` signs everyone out).

## 6. Verification

Run these eight checks after deploying. They are the same cases as TC-D01 to TC-D08 in the Test Cases and Reports document; write each result there.

| Id | Do this | You should see |
| --- | --- | --- |
| TC-D01 | Open the Vercel address | Site loads, dashboard shown, no errors in the browser console |
| TC-D02 | Register, reload the page | Still signed in; in the browser's cookie list `sb_session` has the Secure flag |
| TC-D03 | Create a board, draw, reload | The board comes back with its objects (read from Atlas) |
| TC-D04 | Open `https://<worker-address>/health` | The word `ok` |
| TC-D05 | Open a board while signed in | Top bar says **Live** |
| TC-D06 | Press Share, turn the link on, open it in a private window | Each window shows the other's changes and cursor |
| TC-D07 | Edit, close every window, wait 10 seconds, open the board again | Your edits are still there (the room saved them to Atlas) |
| TC-D08 | Put a wrong `REALTIME_SECRET` on one side, then open a board | Join fails with a message, and the board still works alone; restore the right value after |

If TC-D01 to TC-D03 pass and the rest fail, the website is fine and the problem is only in step 3 (section 7).

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Sign-up says "The server is missing MONGODB\_URI or SESSION\_SECRET" | Variables not set, or set but not redeployed | Add them in Vercel, then Redeploy |
| "Something went wrong on our side" | Server error | Vercel, Project, **Logs**, read the message |
| Log shows `MongoServerSelectionError` | Atlas blocks Vercel, or wrong password in the URI | Re-check Network Access `0.0.0.0/0`; check the password and URL-encode special characters |
| Site is slow | Vercel function region far from Atlas | Vercel, Settings, Functions: choose a region near the Atlas cluster |
| Top bar never says Live | Wrong `REALTIME_URL` (`https://` instead of `wss://`) | Use `wss://` and redeploy Vercel |
| Top bar never says Live | The two `REALTIME_SECRET` values differ | Set the same value in Vercel and with `wrangler secret put`; redeploy both |
| Live works but edits are lost after everyone leaves | `API_BASE` wrong, so the Worker cannot reach Vercel | Fix `API_BASE` (no trailing slash), run `npx wrangler deploy` |
| Share or join answers 503 | Realtime variables missing in Vercel | Add `REALTIME_URL` and `REALTIME_SECRET`, redeploy |
| Live editing stops during heavy use | Cloudflare free daily limit reached | Wait for the next day; boards keep working alone |
| `wrangler deploy` fails on Durable Objects | Account or plan setting | Read the error text; the config already uses SQLite-backed objects, which the free plan needs |

**Watch the Worker live:** `npx wrangler tail` in the `realtime` folder prints its logs while you test.

**If the top bar never says Live,** the board still works alone and saves normally. The site is usable while you fix step 3.

## 8. Updating, rollback and security notes

**Updating the website or API.** Push to GitHub; Vercel builds and deploys by itself. Run `npm test` and `npm run build` in `web/` before pushing.

**Updating the Worker.** Run `npx wrangler deploy` in `realtime/`. If the message format changes, update both copies of `protocol.ts` (`web/src/realtime` and `realtime/src`) and deploy both sides together.

**Rollback.** In Vercel, open **Deployments**, pick the last good one and choose **Promote to Production** (or Instant Rollback where offered). For the Worker, check out the earlier commit and run `npx wrangler deploy` again. Data in Atlas is not changed by a rollback.

**Backups.** The free M0 cluster has no scheduled backups; export important boards from Atlas (Collections, Export) before risky changes.

**Security notes**

- Secrets live only in Vercel and Cloudflare. `.env`, `.dev.vars` and `.data` are in `.gitignore`; check `git status` before every push.
- Atlas must allow `0.0.0.0/0` because Vercel has no fixed address; use a long database password and a user that only has access to this database.
- Cookies are `HttpOnly` and `Secure` on https.
- Sessions cannot be cancelled from the server and there is no login attempt limit yet (see the SCD, section 12).
- Vercel Hobby is non-commercial. Move to a paid plan if the project ever earns money.

## Appendix: Update for Stages 6–11

### What changed for deployment

- **Redeploy the Worker.** The list of object types grew from 8 to 12. Run `npx wrangler deploy` in `realtime/`. If you forget, live editing refuses the new types (comment, vote, timer, reaction, settings, connector).
- **No new environment variables.**
- **The `versions` collection is created automatically** in MongoDB Atlas on the first save of a version. You do not create it by hand.
- Redeploy Vercel as usual by pushing to the repository.

### New verification checks

| ID | Check | Expected |
| --- | --- | --- |
| TC-D09 | Owner saves a version, reloads, opens History | Version listed; "The last 5 saved versions are kept." |
| TC-D10 | Restore the version (two presses) | Board replaced; Undo brings it back |
| TC-D11 | Add a picture in window 1 | Appears in window 2 within seconds |
| TC-D12 | Draw a frame, press Present | Frames step in order, Esc exits |
| TC-D13 | Comment in window 1 | Appears in window 2; viewer cannot add |
| TC-D14 | Vote from two windows at once | Both votes counted |

Record results in the Test Cases document (group TC-D, status currently Not run).

### Free-tier notes

Versions use at most about 9 MB per board (newest 5, 8,000,000 characters cap). Atlas free tier is 512 MB, so roughly 50 boards at the maximum. Most boards are far smaller. Pictures are stored inside the board, so no file storage service is needed.
