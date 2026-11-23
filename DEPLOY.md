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

## 4. Google sign-in (optional)
"Continue with Google" on the sign-in screen. Free; no card.
1. Go to console.cloud.google.com and create a project (any name).
2. **APIs & Services → OAuth consent screen**: choose **External**, fill the app name (Sketchboard) and your e-mail, save. Then press **Publish app** so that everybody (not only test users) can sign in. Only the basic scopes (name, e-mail, picture) are used, so Google does not ask for a review.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → type **Web application**.
   - **Authorized JavaScript origins**: add `https://sketchboard-ruby.vercel.app` (your own address) and, for local testing, `http://localhost:5173`.
   - Leave **redirect URIs** empty (this sign-in does not use them).
4. Copy the **Client ID** (it ends with `.apps.googleusercontent.com`). It is not a secret.
5. In Vercel add `GOOGLE_CLIENT_ID` = that Client ID, then **Redeploy**.
6. Open the sign-in screen: a Google button should appear above the e-mail form. If you already had an account with the same e-mail, Google links to it (same boards).

How it stays safe: the server checks Google's signature on every sign-in and that the token was made for *your* client id, and refuses unverified e-mail addresses.

## 5. Password reset by e-mail (optional)
Sketchboard sends the reset link through **Brevo** (free: 300 e-mails a day, no domain needed).
1. Create a free account at brevo.com.
2. **Senders & IP → Senders → Add a sender**: use your own e-mail address; Brevo sends you a link to verify it.
3. **SMTP & API → API keys → Generate a new API key**. Copy it.
4. In Vercel add, then **Redeploy**:
   - `BREVO_API_KEY` = the key
   - `MAIL_FROM` = the verified sender, e.g. `Sketchboard <you@gmail.com>`
   - `APP_URL` = your site address, e.g. `https://sketchboard-ruby.vercel.app` (no slash at the end). If you skip it, Vercel's own production address is used.
5. On the sign-in screen "Forgot password?" now appears. Try it with your own e-mail (check the spam folder the first time: mail from a free Gmail sender can land there).

Without these variables the "Forgot password?" link is hidden and the rest of the app works as before. Reset links work once and stop working after 30 minutes. Only a hash of the link's secret is stored.

## If something fails
- Page loads but sign-up shows "The server is missing MONGODB_URI or SESSION_SECRET": the variables are not set (add them, then **Redeploy** — variables only apply to new deployments).
- "Something went wrong on our side": open Vercel → Project → **Logs**. A message like *MongoServerSelectionError* means Atlas is blocking Vercel (re-check step 1.3) or the password in the URI is wrong.
- "Google sign-in failed" right after pressing the button: `GOOGLE_CLIENT_ID` on Vercel does not match the Client ID the button was made with, or your site address is not in the **Authorized JavaScript origins** (step 4.3). The button itself says "origin is not allowed" in that case.
- No reset e-mail arrives: in Brevo check **Transactional → Logs**; the sender must be verified. A wrong `BREVO_API_KEY` shows in Vercel → Logs as "could not send the password reset e-mail".
- For speed, set Vercel's function region (Settings → Functions) near your Atlas cluster region.

## Free-tier limits to remember
Atlas M0: 512 MB storage. Vercel Hobby: personal / non-commercial use only. Ably free plan: 6 million messages per month, 200 connections at once, and a message may be at most 64 KB (a big picture is cut into pieces automatically). Every change and every pointer move counts, once for the sender and once per listener, so a long class with many people can use it up; then live editing stops until the next month while boards keep working alone. Boards are saved as one document each (max 5000 objects, about 3 MB).
