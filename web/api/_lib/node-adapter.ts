import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { createApi } from "./core.js";
import { FileStore, type Store } from "./store.js";
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
    // in development the realtime service (npm run dev in /realtime) is expected on port 8787
    realtime: {
      secret: process.env.REALTIME_SECRET ?? "dev-realtime-secret-change-me",
      url: process.env.REALTIME_URL ?? "ws://localhost:8787",
    },
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
