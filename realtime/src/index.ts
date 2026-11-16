import { CLOSE } from "./protocol";
import { readJoinToken } from "./token";
import type { Env } from "./room";

export { Room } from "./room";

// The front door. Its only jobs: check the join token, then hand the connection to the room of that board.
// (Rooms are Durable Objects: one tiny single-threaded server per board, which is what keeps edits in one order.)

// A WebSocket must be accepted before it can be closed with a code, so errors are sent that way:
// the browser then sees the code (e.g. 4001 = bad token) and can show a useful message.
function refuse(code: number, reason: string): Response {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");

    const m = url.pathname.match(/^\/ws\/([\w-]{1,64})$/);
    if (!m) return new Response("Not found", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    if (!env.REALTIME_SECRET) return refuse(1011, "server not configured");

    const boardId = m[1];
    const claims = await readJoinToken(url.searchParams.get("token"), env.REALTIME_SECRET);
    if (claims === "expired") return refuse(CLOSE.TOKEN_EXPIRED, "token expired");
    if (!claims) return refuse(CLOSE.BAD_TOKEN, "bad token");
    if (claims.b !== boardId) return refuse(CLOSE.FORBIDDEN, "token is for another board");

    const headers = new Headers(req.headers);
    headers.set("x-board", boardId);
    headers.set("x-peer", JSON.stringify({ userId: claims.u, name: claims.n, role: claims.r }));
    const room = env.ROOMS.get(env.ROOMS.idFromName(boardId));
    return room.fetch(new Request(req, { headers }));
  },
} satisfies ExportedHandler<Env>;
