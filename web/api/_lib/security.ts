import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// ---------- passwords ----------
// scrypt ships with Node, so there is nothing native to install (bcrypt would need a build step on Vercel).
function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---------- session token ----------
// "<payload>.<signature>". The payload says who the user is and when the token expires.
// Only the server knows SESSION_SECRET, so nobody can forge or edit a token.
export const SESSION_DAYS = 30;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function createToken(userId: string, secret: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ uid: userId, exp: now + SESSION_DAYS * 86_400_000 }));
  return `${payload}.${sign(payload, secret)}`;
}

export function readToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof uid === "string" && typeof exp === "number" && exp > now ? uid : null;
  } catch {
    return null;
  }
}

// ---------- live collaboration pass (Ably) ----------
// Ably is the service that carries live edits. The browser never sees our Ably API key; instead the server signs a
// short-lived JWT that says "this person may use THESE channels, and only do THESE things". Ably checks the signature.
export const ABLY_TOKEN_MINUTES = 60;

export type Role = "owner" | "editor" | "viewer";

// Channels per board:
//   board:<id>  — the edits. Everybody may listen; only owners and editors may publish (so a viewer cannot change anything).
//   cur:<id>    — pointer positions and "who is here". Everybody may take part.
export function ablyCapability(boardId: string, role: Role): Record<string, string[]> {
  const canEdit = role !== "viewer";
  return {
    [`board:${boardId}`]: canEdit ? ["subscribe", "publish", "history"] : ["subscribe", "history"],
    [`cur:${boardId}`]: ["subscribe", "publish", "presence"],
  };
}

export function createAblyToken(apiKey: string, claims: { clientId: string; boardId: string; role: Role }, now = Date.now()): string {
  const sep = apiKey.indexOf(":");
  const keyName = apiKey.slice(0, sep), keySecret = apiKey.slice(sep + 1);
  const iat = Math.floor(now / 1000);
  const header = b64(JSON.stringify({ typ: "JWT", alg: "HS256", kid: keyName }));
  const body = b64(
    JSON.stringify({
      iat,
      exp: iat + ABLY_TOKEN_MINUTES * 60,
      "x-ably-capability": JSON.stringify(ablyCapability(claims.boardId, claims.role)),
      "x-ably-clientId": claims.clientId,
    }),
  );
  return `${header}.${body}.${createHmac("sha256", keySecret).update(`${header}.${body}`).digest("base64url")}`;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
