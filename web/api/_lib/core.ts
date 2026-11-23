import { nanoid } from "nanoid";
import { z } from "zod";
import type { Store } from "./store.js";
import type { ApiRequest, ApiResponse, BoardRec, UserRec, Viewport } from "./types.js";
import { addVersion } from "./versions.js";
import { SESSION_DAYS, createAblyToken, createToken, hashPassword, readToken, verifyPassword } from "./security.js";
import { createHash, randomBytes } from "node:crypto";
import type { GoogleProfile } from "./google.js";
import type { SendMail } from "./mail.js";

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
const Password = z.string("Enter a password").min(8, "Use at least 8 characters").max(128);
const GoogleBody = z.object({ credential: z.string().min(20).max(4000) });
const ForgotBody = z.object({ email: Email });
const ResetBody = z.object({ token: z.string().min(20).max(200), password: Password });
const ProfileBody = z.object({ name: z.string("Enter your name").trim().min(1, "Enter your name").max(60) });
const PasswordBody = z.object({ current: z.string().max(128).optional(), password: Password });
const DeleteBody = z.object({ confirm: z.string().max(254) });
const LoginBody = z.object({ email: Email, password: z.string("Enter your password").min(1, "Enter your password").max(128) });

const BoardObject = z.looseObject({
  id: z.string().min(1).max(64),
  type: z.enum(["sticky", "shape", "stroke", "text", "image", "frame", "comment", "vote", "timer", "reaction", "settings", "connector"]),
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
const VersionBody = z.object({ label: z.string().trim().max(60).optional(), objects: z.array(BoardObject).max(5000) });
const RenameBody = z.object({ name: Name });
const ShareBody = z.object({ enabled: z.boolean(), right: z.enum(["viewer", "editor"]).optional(), regenerate: z.boolean().optional() });
const JoinBody = z.object({ name: z.string().trim().max(40).optional(), guestId: z.string().regex(/^g_[A-Za-z0-9_-]{6,16}$/).optional() });
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
const publicUser = (u: UserRec) => ({
  id: u.id, name: u.name, email: u.email, avatar: u.avatar,
  hasPassword: !!u.passwordHash, // false for an account that only uses Google
  google: !!u.googleId,
});
const publicBoard = (b: BoardRec) => ({
  id: b.id, name: b.name, objects: b.objects, viewport: b.viewport, createdAt: b.createdAt, updatedAt: b.updatedAt,
});

export interface ApiConfig {
  secret: string;
  // Live collaboration through Ably. When missing, boards still work alone; share/join endpoints answer "not set up".
  ablyKey?: string; // "<appId>.<keyId>:<secret>" from the Ably dashboard
  // "Continue with Google". Needs the client id (public) and a function that checks Google's signed token.
  googleClientId?: string;
  verifyGoogle?: (credential: string) => Promise<GoogleProfile>;
  // Password reset by e-mail. Needs a way to send mail and the web address to put in the link.
  sendMail?: SendMail;
  appUrl?: string; // e.g. https://sketchboard-ruby.vercel.app (no slash at the end)
}

const RESET_MINUTES = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
// only a plain https picture address is kept (it is shown in <img>, never run)
const safeAvatar = (u?: string) => (u && /^https:\/\/[^\s"'<>]{4,480}$/.test(u) ? u : undefined);

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

  // The pass that lets this browser use the board's Ably channels. `clientId` is who they are on the channel.
  const joinResponse = (board: BoardRec, clientId: string, name: string, role: "owner" | "editor" | "viewer") => {
    if (!config.ablyKey) throw realtimeOff();
    const token = createAblyToken(config.ablyKey, { clientId, boardId: board.id, role });
    return json(200, { token, clientId, role, boardId: board.id, name: board.name, you: name });
  };

  async function route(req: ApiRequest): Promise<ApiResponse> {
    const method = req.method.toUpperCase();
    const seg = req.path.split("?")[0].split("/").filter(Boolean);

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
        const ok = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));
        if (user && !user.passwordHash)
          throw fail(401, "use_google", "This account signs in with Google. Use the Google button, or choose “Forgot password” to add a password.");
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

      // what the sign-in screen may offer (the Google client id is public by design)
      if (seg[1] === "config" && method === "GET") {
        return json(200, { google: config.verifyGoogle ? (config.googleClientId ?? null) : null, resetEmail: !!(config.sendMail && config.appUrl) });
      }

      if (seg[1] === "google" && method === "POST") {
        if (!config.verifyGoogle) throw fail(503, "google_not_configured", "Google sign-in is not set up on this server yet.");
        const { credential } = parse(GoogleBody, req.body, true);
        let g: GoogleProfile;
        try {
          g = await config.verifyGoogle(credential);
        } catch {
          throw fail(401, "bad_google_token", "Google sign-in failed. Please try again.");
        }
        const email = g.email.trim().toLowerCase();
        if (!g.emailVerified || !email) throw fail(401, "unverified", "Your Google e-mail address is not verified.");
        let user = await store.findUserByEmail(email);
        if (user) {
          // same e-mail as an existing account: Google has confirmed it is the same person, so link them
          if (user.googleId && user.googleId !== g.sub) throw fail(401, "bad_google_token", "Google sign-in failed. Please try again.");
          const patch: Partial<UserRec> = {};
          if (!user.googleId) patch.googleId = g.sub;
          if (!user.avatar && safeAvatar(g.picture)) patch.avatar = safeAvatar(g.picture);
          if (Object.keys(patch).length) {
            await store.updateUser(user.id, patch);
            user = { ...user, ...patch };
          }
        } else {
          user = {
            id: nanoid(12), email, name: (g.name.trim() || email.split("@")[0]).slice(0, 60), passwordHash: null,
            googleId: g.sub, avatar: safeAvatar(g.picture), createdAt: Date.now(),
          };
          if (!(await store.createUser(user))) throw fail(409, "email_taken", "An account with this email already exists.");
        }
        return json(200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(createToken(user.id, config.secret), req.secure) });
      }

      // Forgot password. The answer is always the same, so nobody can use this to find out who has an account.
      if (seg[1] === "forgot" && method === "POST") {
        if (!config.sendMail || !config.appUrl) throw fail(503, "mail_not_configured", "Password reset by e-mail is not set up on this server yet.");
        const { email } = parse(ForgotBody, req.body, true);
        const user = await store.findUserByEmail(email);
        const now = Date.now();
        if (user && !(user.resetSentAt && now - user.resetSentAt < 60_000)) {
          const secret = randomBytes(32).toString("base64url");
          await store.updateUser(user.id, { resetHash: sha256(secret), resetExp: now + RESET_MINUTES * 60_000, resetSentAt: now });
          try {
            await config.sendMail({
              to: user.email,
              subject: "Reset your Sketchboard password",
              text: `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your Sketchboard password.\nOpen this link within ${RESET_MINUTES} minutes to choose a new one:\n\n${config.appUrl}/#/reset/${secret}\n\nIf you did not ask for this, you can ignore this e-mail. Your password stays the same.`,
            });
          } catch {
            /* the person sees the same answer either way; the server log has the details */
            console.error("could not send the password reset e-mail");
          }
        }
        return json(200, { ok: true });
      }

      if (seg[1] === "reset" && method === "POST") {
        const { token, password } = parse(ResetBody, req.body, true);
        const user = await store.findUserByResetHash(sha256(token));
        if (!user || !user.resetExp || user.resetExp < Date.now()) throw fail(400, "bad_reset", "This reset link is not valid any more. Ask for a new one.");
        await store.updateUser(user.id, { passwordHash: await hashPassword(password), resetHash: undefined, resetExp: undefined });
        return json(200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(createToken(user.id, config.secret), req.secure) });
      }

      // ----- the signed-in person's own account -----
      if (seg[1] === "me" && method === "PATCH") {
        const user = await requireUser(req);
        const { name } = parse(ProfileBody, req.body, true);
        await store.updateUser(user.id, { name });
        return json(200, { user: publicUser({ ...user, name }) });
      }
      if (seg[1] === "password" && method === "POST") {
        const user = await requireUser(req);
        const { current, password } = parse(PasswordBody, req.body, true);
        // someone who already has a password must prove they know it; a Google-only account is setting its first one
        if (user.passwordHash && !(await verifyPassword(current ?? "", user.passwordHash))) throw fail(400, "wrong_password", "Your current password is not correct.");
        await store.updateUser(user.id, { passwordHash: await hashPassword(password) });
        return json(200, { user: publicUser({ ...user, passwordHash: "set" }) });
      }
      if (seg[1] === "me" && method === "DELETE") {
        const user = await requireUser(req);
        const { confirm } = parse(DeleteBody, req.body, true);
        if (confirm.trim().toLowerCase() !== user.email) throw fail(400, "confirm_mismatch", "Type your e-mail address exactly to confirm.");
        await store.deleteUser(user.id);
        return { status: 204, headers: { "Set-Cookie": clearCookie(req.secure) } };
      }
    }

    // ----- share links (open to anyone who has the secret link) -----
    if (seg[0] === "share" && seg[1]) {
      const board = await store.findBoardByShareToken(seg[1]);
      if (!board?.share?.enabled) throw fail(404, "not_found", "This link is not active.");
      if (method === "GET" && !seg[2]) return json(200, { board: { id: board.id, name: board.name }, right: board.share.right });
      // The current content of the board, for someone who opened the link (or for the screen that saves it back).
      if (seg[2] === "state" && method === "GET") return json(200, { objects: board.objects });
      if (seg[2] === "state" && method === "PUT") {
        // Whoever edits through the link saves the board (the owner may not be online). Viewers cannot.
        const user = await currentUser(req);
        if (board.share.right !== "editor" && user?.id !== board.ownerId) throw fail(403, "forbidden", "You can only view this board.");
        const { objects } = parse(StateBody, req.body);
        checkSize(objects);
        await store.updateBoard(board.id, { objects, updatedAt: Date.now() });
        return json(200, { ok: true });
      }
      if (method === "POST" && seg[2] === "join") {
        const { name, guestId } = parse(JoinBody, req.body);
        const user = await currentUser(req);
        const isOwner = user?.id === board.ownerId;
        const role = isOwner ? "owner" : board.share.right;
        // a guest keeps the same id when the pass is renewed (Ably requires it)
        return joinResponse(board, user ? user.id : guestId ?? `g_${nanoid(8)}`, user ? user.name : name || "Guest", role);
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
          if (!config.ablyKey) throw realtimeOff(); // a link is useless without live editing
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
      if (id && seg[2] === "versions") {
        await ownedBoard(id, user);
        const list = await store.getVersions(id);
        const summaries = (l: typeof list) => l.map((v) => ({ id: v.id, at: v.at, label: v.label, count: v.objects.length })).reverse(); // newest first
        if (!seg[3] && method === "GET") return json(200, { versions: summaries(list) });
        if (!seg[3] && method === "POST") {
          const body = parse(VersionBody, req.body);
          checkSize(body.objects);
          const next = addVersion(list, { id: nanoid(10), at: Date.now(), label: body.label || "Saved version", objects: body.objects });
          await store.setVersions(id, next);
          return json(201, { versions: summaries(next) });
        }
        if (seg[3] && method === "GET") {
          const v = list.find((x) => x.id === seg[3]);
          if (!v) throw fail(404, "not_found", "That version does not exist any more.");
          return json(200, { objects: v.objects });
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
