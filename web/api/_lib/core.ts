import { nanoid } from "nanoid";
import { z } from "zod";
import type { Store } from "./store.js";
import type { ApiRequest, ApiResponse, BoardRec, UserRec, Viewport } from "./types.js";
import { SESSION_DAYS, createJoinToken, createToken, hashPassword, readToken, safeEqual, verifyPassword } from "./security.js";

export const COOKIE = "sb_session";
const MAX_BOARD_BYTES = 3_000_000; // Vercel allows 4.5 MB per request; stay below it
const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string) => new HttpError(status, code, message);

// ---------- input rules ----------
const Email = z.string("Enter your email").trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));
const RegisterBody = z.object({
  name: z.string("Enter your name").trim().min(1, "Enter your name").max(60),
  email: Email,
  password: z.string("Enter a password").min(8, "Use at least 8 characters").max(128),
});
const LoginBody = z.object({ email: Email, password: z.string("Enter your password").min(1, "Enter your password").max(128) });

const BoardObject = z.looseObject({
  id: z.string().min(1).max(64),
  type: z.enum(["sticky", "shape", "stroke", "text", "connector"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
});
const ViewportSchema = z.object({ x: z.number(), y: z.number(), scale: z.number().min(0.01).max(100) });
const Name = z.string().trim().min(1).max(100);
const CreateBody = z.object({ name: Name.optional(), objects: z.array(BoardObject).max(5000).optional() });
const SaveBody = z.object({ objects: z.array(BoardObject).max(5000), viewport: ViewportSchema.optional() });
const RenameBody = z.object({ name: Name });
const ShareBody = z.object({ enabled: z.boolean(), right: z.enum(["viewer", "editor"]).optional(), regenerate: z.boolean().optional() });
const JoinBody = z.object({ name: z.string().trim().max(40).optional() });
const StateBody = z.object({ objects: z.array(BoardObject).max(5000) });

// `plain` = show only the message (used for the sign-in forms, where the message is written for people)
function parse<T>(schema: z.ZodType<T>, body: unknown, plain = false): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const first = r.error.issues[0];
    const where = !plain && first.path.length ? `${first.path.join(".")}: ` : "";
    throw fail(400, "invalid_input", `${where}${first.message}`);
  }
  return r.data;
}

// ---------- shaping what we send back ----------
const publicUser = (u: UserRec) => ({ id: u.id, name: u.name, email: u.email });
const publicBoard = (b: BoardRec) => ({
  id: b.id, name: b.name, objects: b.objects, viewport: b.viewport, createdAt: b.createdAt, updatedAt: b.updatedAt,
});

export interface ApiConfig {
  secret: string;
  // Live collaboration. When missing, boards still work alone; share/join endpoints answer "not set up".
  realtime?: { secret: string; url: string }; // url like wss://sketchboard-realtime.<you>.workers.dev
}

export function createApi(store: Store, config: ApiConfig) {
  const json = (status: number, body: unknown, headers?: ApiResponse["headers"]): ApiResponse => ({ status, body, headers });

  const sessionCookie = (token: string, secure: boolean) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
  const clearCookie = (secure: boolean) =>
    `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;

  async function currentUser(req: ApiRequest): Promise<UserRec | null> {
    const uid = readToken(req.cookies[COOKIE], config.secret);
    return uid ? store.findUserById(uid) : null;
  }
  async function requireUser(req: ApiRequest): Promise<UserRec> {
    const u = await currentUser(req);
    if (!u) throw fail(401, "unauthorized", "Sign in to continue.");
    return u;
  }
  // A board that is not yours looks exactly like a board that does not exist.
  async function ownedBoard(id: string, user: UserRec): Promise<BoardRec> {
    const b = await store.getBoard(id);
    if (!b || b.ownerId !== user.id) throw fail(404, "not_found", "Board not found.");
    return b;
  }
  const checkSize = (objects: unknown[]) => {
    if (JSON.stringify(objects).length > MAX_BOARD_BYTES) throw fail(413, "too_large", "This board is too large to save.");
  };

  // Used to make "unknown e-mail" take as long as "wrong password", so timing does not reveal which e-mails exist.
  let dummyHash: Promise<string> | undefined;

  const realtimeOff = () =>
    fail(503, "realtime_not_configured", "Live collaboration is not set up on this server yet.");

  const joinResponse = (board: BoardRec, uid: string, name: string, role: "owner" | "editor" | "viewer") => {
    if (!config.realtime) throw realtimeOff();
    const token = createJoinToken({ b: board.id, u: uid, n: name, r: role }, config.realtime.secret);
    return json(200, { token, wsUrl: `${config.realtime.url.replace(/\/$/, "")}/ws/${board.id}`, role, boardId: board.id, name: board.name });
  };

  async function internal(req: ApiRequest, seg: string[], method: string): Promise<ApiResponse> {
    const key = req.headers["x-realtime-key"];
    if (!config.realtime || !key || !safeEqual(key, config.realtime.secret)) throw fail(401, "unauthorized", "Not allowed.");
    if (seg[1] === "boards" && seg[2] && seg[3] === "state") {
      const board = await store.getBoard(seg[2]);
      if (!board) throw fail(404, "not_found", "Board not found.");
      if (method === "GET") return json(200, { objects: board.objects, name: board.name });
      if (method === "PUT") {
        const { objects } = parse(StateBody, req.body);
        checkSize(objects);
        await store.updateBoard(board.id, { objects, updatedAt: Date.now() });
        return json(200, { ok: true });
      }
    }
    throw fail(404, "not_found", "That address does not exist.");
  }

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const method = req.method.toUpperCase();
    const seg = req.path.split("?")[0].split("/").filter(Boolean);

    // Internal address used only by the realtime service. It proves itself with a shared secret instead of a cookie.
    if (seg[0] === "internal") return internal(req, seg, method);

    // CSRF defence: a page on another site can send our cookie, but it cannot add this custom header
    // without a CORS preflight, which we never allow.
    if (method !== "GET" && method !== "HEAD" && req.headers["x-sketchboard"] !== "1") {
      throw fail(403, "csrf", "Request blocked.");
    }

    // ----- auth -----
    if (seg[0] === "auth") {
      if (seg[1] === "register" && method === "POST") {
        const body = parse(RegisterBody, req.body, true);
        const user: UserRec = {
          id: nanoid(12), email: body.email, name: body.name,
          passwordHash: await hashPassword(body.password), createdAt: Date.now(),
        };
        if (!(await store.createUser(user))) throw fail(409, "email_taken", "An account with this email already exists.");
        return json(201, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(createToken(user.id, config.secret), req.secure) });
      }
      if (seg[1] === "login" && method === "POST") {
        const body = parse(LoginBody, req.body, true);
        const user = await store.findUserByEmail(body.email);
        dummyHash ??= hashPassword("not-a-real-password");
        const ok = await verifyPassword(body.password, user ? user.passwordHash : await dummyHash);
        if (!user || !ok) throw fail(401, "bad_credentials", "Wrong email or password.");
        return json(200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(createToken(user.id, config.secret), req.secure) });
      }
      if (seg[1] === "logout" && method === "POST") {
        return { status: 204, headers: { "Set-Cookie": clearCookie(req.secure) } };
      }
      if (seg[1] === "me" && method === "GET") {
        const user = await requireUser(req);
        return json(200, { user: publicUser(user) });
      }
    }

    // ----- share links (open to anyone who has the secret link) -----
    if (seg[0] === "share" && seg[1]) {
      const board = await store.findBoardByShareToken(seg[1]);
      if (!board?.share?.enabled) throw fail(404, "not_found", "This link is not active.");
      if (method === "GET" && !seg[2]) return json(200, { board: { id: board.id, name: board.name }, right: board.share.right });
      if (method === "POST" && seg[2] === "join") {
        const { name } = parse(JoinBody, req.body);
        const user = await currentUser(req);
        const isOwner = user?.id === board.ownerId;
        const role = isOwner ? "owner" : board.share.right;
        return joinResponse(board, user ? user.id : `g_${nanoid(8)}`, user ? user.name : name || "Guest", role);
      }
    }

    // ----- boards -----
    if (seg[0] === "boards") {
      const user = await requireUser(req);
      const id = seg[1];

      if (!id && method === "GET") {
        return json(200, { boards: (await store.listBoards(user.id)).map(publicBoard) });
      }
      if (!id && method === "POST") {
        const body = parse(CreateBody, req.body);
        checkSize(body.objects ?? []);
        const now = Date.now();
        const board: BoardRec = {
          id: nanoid(12), ownerId: user.id, name: body.name ?? "Untitled board",
          objects: body.objects ?? [], viewport: DEFAULT_VIEWPORT, createdAt: now, updatedAt: now,
        };
        await store.insertBoard(board);
        return json(201, { board: publicBoard(board) });
      }
      if (id && !seg[2]) {
        const board = await ownedBoard(id, user);
        if (method === "GET") return json(200, { board: publicBoard(board) });
        if (method === "PUT") {
          const body = parse(SaveBody, req.body);
          checkSize(body.objects);
          const updatedAt = Date.now();
          await store.updateBoard(id, { objects: body.objects, viewport: body.viewport ?? board.viewport, updatedAt });
          return json(200, { updatedAt });
        }
        if (method === "PATCH") {
          const { name } = parse(RenameBody, req.body);
          await store.updateBoard(id, { name, updatedAt: Date.now() });
          return json(200, { name });
        }
        if (method === "DELETE") {
          await store.deleteBoard(id);
          return { status: 204 };
        }
      }
      if (id && seg[2] === "join" && method === "POST") {
        const board = await ownedBoard(id, user);
        return joinResponse(board, user.id, user.name, "owner");
      }
      if (id && seg[2] === "share") {
        const board = await ownedBoard(id, user);
        if (method === "GET") return json(200, { share: board.share ?? null });
        if (method === "PUT") {
          const body = parse(ShareBody, req.body);
          if (!config.realtime) throw realtimeOff(); // a link is useless without live editing
          const old = board.share;
          const share = {
            enabled: body.enabled,
            right: body.right ?? old?.right ?? "viewer",
            // a new secret on first enable, or when the owner asks to cancel the old link
            token: !old || body.regenerate ? nanoid(24) : old.token,
          };
          await store.updateBoard(id, { share });
          return json(200, { share });
        }
      }
      if (id && seg[2] === "duplicate" && method === "POST") {
        const src = await ownedBoard(id, user);
        const now = Date.now();
        const copy: BoardRec = { ...src, id: nanoid(12), name: `${src.name} copy`.slice(0, 100), createdAt: now, updatedAt: now };
        await store.insertBoard(copy);
        return json(201, { board: publicBoard(copy) });
      }
    }

    throw fail(404, "not_found", "That address does not exist.");
  }

  return async function handle(req: ApiRequest): Promise<ApiResponse> {
    try {
      return await route(req);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: { code: e.code, message: e.message } });
      console.error("API error:", e); // shows up in the Vercel function logs
      return json(500, { error: { code: "server_error", message: "Something went wrong on our side. Try again." } });
    }
  };
}
