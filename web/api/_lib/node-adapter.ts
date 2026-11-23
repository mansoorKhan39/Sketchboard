import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { createApi } from "./core.js";
import { FileStore, type Store } from "./store.js";
import { createGoogleVerifier } from "./google.js";
import { consoleMailer, createBrevoMailer } from "./mail.js";
import type { ApiRequest } from "./types.js";

// Connects the framework-free API to a plain Node request. Used by the dev server (vite.config.ts).

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req: IncomingMessage, limit = 4_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Symbol.for("bad-json");
  }
}

let devStore: Store | undefined;

export function createNodeHandler(store?: Store) {
  devStore = store ?? devStore ?? new FileStore(join(process.cwd(), ".data", "db.json"));
  const handle = createApi(devStore, {
    secret: process.env.SESSION_SECRET ?? "dev-only-secret-change-me",
    // live collaboration needs an Ably key (ABLY_API_KEY); without it boards work alone
    ablyKey: process.env.ABLY_API_KEY,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    verifyGoogle: process.env.GOOGLE_CLIENT_ID ? createGoogleVerifier(process.env.GOOGLE_CLIENT_ID) : undefined,
    // development: reset e-mails are printed in the terminal unless a Brevo key is set
    sendMail: process.env.BREVO_API_KEY && process.env.MAIL_FROM ? createBrevoMailer(process.env.BREVO_API_KEY, process.env.MAIL_FROM) : consoleMailer,
    appUrl: process.env.APP_URL ?? "http://localhost:5173",
  });

  return async (req: IncomingMessage, res: ServerResponse) => {
    let body: unknown;
    try {
      body = await readBody(req);
    } catch {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: { code: "too_large", message: "Request is too large." } }));
      return;
    }
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(",") : v;
    const apiReq: ApiRequest = {
      method: req.method ?? "GET",
      path: (req.url ?? "/").replace(/^\/api\/v1/, "").replace(/^\/v1/, ""),
      headers,
      cookies: parseCookies(req.headers.cookie),
      body: typeof body === "symbol" ? { __bad: true } : body,
      secure: headers["x-forwarded-proto"] === "https",
    };
    const out = await handle(apiReq);
    res.statusCode = out.status;
    for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
    if (out.body === undefined) return void res.end();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(out.body));
  };
}
