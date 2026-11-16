import type { Role } from "./protocol";

// Join token made by the website API: "<payload>.<signature>" (same idea as the session cookie).
// Signed with REALTIME_SECRET, which only the API and this service know.
export interface JoinClaims {
  b: string; // board id
  u: string; // user id (or a guest id)
  n: string; // display name
  r: Role;
  exp: number; // ms since epoch
}

const enc = new TextEncoder();

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function readJoinToken(token: string | null, secret: string, now = Date.now()): Promise<JoinClaims | "expired" | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", key, fromB64url(sig), enc.encode(payload)); // constant-time compare
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as JoinClaims;
    if (typeof c.b !== "string" || typeof c.u !== "string" || typeof c.n !== "string" || typeof c.exp !== "number") return null;
    if (!["owner", "editor", "viewer"].includes(c.r)) return null;
    return c.exp > now ? c : "expired";
  } catch {
    return null;
  }
}
