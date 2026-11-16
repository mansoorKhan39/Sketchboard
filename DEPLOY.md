# Putting Sketchboard online (free, no card)

You need three free accounts: **MongoDB Atlas** (database), **Vercel** (website + API) and **Cloudflare** (live collaboration). Cards are not asked for on these free plans. Steps 1 and 2 give you a working app for one person; step 3 adds sharing and live editing.

## 1. Database (MongoDB Atlas)
1. Create a free **M0** cluster at cloud.mongodb.com.
2. **Database Access** → Add a database user (username + password). Remember the password.
3. **Network Access** → Add IP address → **Allow access from anywhere** (`0.0.0.0/0`). Vercel's servers have no fixed IP, so this is required. The password protects the database.
4. **Connect → Drivers** → copy the connection string. Replace `<password>` with your password.
   If the password has special characters (`@ : / ?`), URL-encode them.

## 2. Website + API (Vercel)
1. Put the project on GitHub (the folder that contains `README.md` and `web/`).
2. In Vercel: **Add New → Project** → import the repo.
3. **Root Directory: `web`**. Vercel detects Vite by itself.
4. Add Environment Variables:
   - `MONGODB_URI` = the connection string from step 1
   - `SESSION_SECRET` = a long random text (see `.env.example` for a command that makes one)
5. Deploy. Open the URL, create an account, make a board, refresh. If it is still there, it works.

## 3. Live collaboration (Cloudflare Worker)
1. Create a free account at cloudflare.com (no card needed for Workers).
2. In a terminal: `cd realtime`, `npm install`, `npx wrangler login`.
3. Open `realtime/wrangler.jsonc` and set `API_BASE` to your Vercel address, e.g. `https://sketchboard-xyz.vercel.app` (no slash at the end).
4. Pick a long random text for `REALTIME_SECRET` (same command as `SESSION_SECRET`) and store it in Cloudflare: `npx wrangler secret put REALTIME_SECRET`.
5. `npx wrangler deploy`. It prints an address like `https://sketchboard-realtime.<your-name>.workers.dev`.
6. In Vercel add two more Environment Variables, then **Redeploy**:
   - `REALTIME_URL` = the same address but starting with **wss://** (not https://)
   - `REALTIME_SECRET` = the same text as in step 4
7. Check: open a board while signed in. The top bar should say **Live**. Press Share, turn on the link, open it in a private window: you should see each other's changes and cursors.

If the top bar never says Live, the board still works alone (it just saves normally). Typical causes: `REALTIME_URL` has `https://` instead of `wss://`, the two secrets differ, or `API_BASE` is wrong (Cloudflare cannot reach your Vercel site). `npx wrangler tail` shows the Worker's live logs.

## If something fails
- Page loads but sign-up shows "The server is missing MONGODB_URI or SESSION_SECRET": the variables are not set (add them, then **Redeploy** — variables only apply to new deployments).
- "Something went wrong on our side": open Vercel → Project → **Logs**. A message like *MongoServerSelectionError* means Atlas is blocking Vercel (re-check step 1.3) or the password in the URI is wrong.
- For speed, set Vercel's function region (Settings → Functions) near your Atlas cluster region.

## Free-tier limits to remember
Atlas M0: 512 MB storage. Vercel Hobby: personal / non-commercial use only. Cloudflare Workers free plan: 100,000 requests per day (incoming WebSocket messages count 1 per 20 messages) and 100,000 database rows written per day across all rooms; a busy classroom of editors can reach this, and then live editing stops until the next day (boards keep working alone). Boards are saved as one document each (max 5000 objects, about 3 MB).
