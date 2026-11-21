# Putting Sketchboard online (free, no card)

You need three free accounts: **MongoDB Atlas** (database), **Vercel** (website + API) and **Ably** (live collaboration). Cards are not asked for on these free plans. Steps 1 and 2 give you a working app for one person; step 3 adds sharing and live editing.

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

## 3. Live collaboration (Ably)
Ably carries the live edits between people. It is built for bad networks: if a WebSocket is blocked or keeps dropping, it switches to plain HTTPS by itself and fetches what you missed after a reconnect. There is nothing to deploy besides Vercel.
1. Create a free account at ably.com (no card needed).
2. Open your app, then **API Keys**. The default key is fine for a start. Copy the whole key: it looks like `abc123.xyz789:longSecretText`.
3. In Vercel add one Environment Variable, then **Redeploy** (variables only apply to new deployments):
   - `ABLY_API_KEY` = the whole key from step 2
4. Check: open a board while signed in. The top bar should say **Live**. Press Share, turn on the link, open it in a private window: you should see each other's changes and cursors.

How it stays safe: the browser never receives the key. The server hands out a one-hour pass that works only for that one board's channels, and a viewer's pass has no right to publish edits. Rotating the key (Ably dashboard) cuts off everyone's passes at once.

If the top bar never says Live, the board still works alone (it just saves normally). Typical causes: `ABLY_API_KEY` is missing or has a typo (Vercel → Logs; the join request answers 503 when it is missing), or you did not Redeploy after adding it.

Old setup: earlier versions used a Cloudflare Worker (`realtime/`, `REALTIME_URL`, `REALTIME_SECRET`, `API_BASE`). None of that is needed any more. You can delete the Worker in the Cloudflare dashboard and remove those three variables from Vercel.

## If something fails
- Page loads but sign-up shows "The server is missing MONGODB_URI or SESSION_SECRET": the variables are not set (add them, then **Redeploy** — variables only apply to new deployments).
- "Something went wrong on our side": open Vercel → Project → **Logs**. A message like *MongoServerSelectionError* means Atlas is blocking Vercel (re-check step 1.3) or the password in the URI is wrong.
- For speed, set Vercel's function region (Settings → Functions) near your Atlas cluster region.

## Free-tier limits to remember
Atlas M0: 512 MB storage. Vercel Hobby: personal / non-commercial use only. Ably free plan: 6 million messages per month, 200 connections at once, and a message may be at most 64 KB (a big picture is cut into pieces automatically). Every change and every pointer move counts, once for the sender and once per listener, so a long class with many people can use it up; then live editing stops until the next month while boards keep working alone. Boards are saved as one document each (max 5000 objects, about 3 MB).
