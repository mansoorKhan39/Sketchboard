import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApi } from "./_lib/core.js";
import { createMongoStore } from "./_lib/mongo-store.js";
import { createGoogleVerifier } from "./_lib/google.js";
import { createBrevoMailer } from "./_lib/mail.js";
import type { ApiRequest } from "./_lib/types.js";

// The one serverless function that handles every /api/v1/... address.
// (Vercel's free plan allows only 12 functions, so one router is better than one file per endpoint.)

const uri = process.env.MONGODB_URI;
const secret = process.env.SESSION_SECRET;
// optional: live collaboration through Ably (see DEPLOY.md)
const ablyKey = process.env.ABLY_API_KEY;
// optional: "Continue with Google" (GOOGLE_CLIENT_ID) and password reset by e-mail (BREVO_API_KEY + MAIL_FROM)
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const verifyGoogle = googleClientId ? createGoogleVerifier(googleClientId) : undefined;
const sendMail = process.env.BREVO_API_KEY && process.env.MAIL_FROM ? createBrevoMailer(process.env.BREVO_API_KEY, process.env.MAIL_FROM) : undefined;
// the address put in reset e-mails: set APP_URL, or Vercel's own production address is used
const appUrl = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);

// Built once per warm instance and reused, so the database connection is reused too.
const handle =
  uri && secret
    ? createApi(createMongoStore(uri, process.env.MONGODB_DB ?? "sketchboard"), { secret, ablyKey, googleClientId, verifyGoogle, sendMail, appUrl })
    : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!handle) {
    res.status(500).json({
      error: { code: "not_configured", message: "The server is missing MONGODB_URI or SESSION_SECRET." },
    });
    return;
  }
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(",") : v;

  const apiReq: ApiRequest = {
    method: req.method ?? "GET",
    path: (req.url ?? "/").replace(/^\/api\/v1/, ""),
    headers,
    cookies: (req.cookies ?? {}) as Record<string, string>,
    body: req.body,
    secure: headers["x-forwarded-proto"] === "https",
  };
  const out = await handle(apiReq);
  for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
  res.status(out.status);
  if (out.body === undefined) res.end();
  else res.json(out.body);
}
