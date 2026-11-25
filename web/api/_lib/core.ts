import { nanoid } from "nanoid";
import { z } from "zod";
import type { Store } from "./store.js";
import type { ApiRequest, ApiResponse, BoardRec, UserRec, Viewport } from "./types.js";
import { addVersion } from "./versions.js";
import { SESSION_DAYS, createAblyToken, createToken, hashPassword, readToken, verifyPassword } from "./security.js";
import { createHash, randomBytes } from "node:crypto";
import type { GoogleProfile } from "./google.js";
import type { SendMail } from "./mail.js";
import { addActivity, addNotification, atLeast, findMentioned, MAX_INVITES, MAX_MEMBERS, roleOf, type BoardRole } from "./collab.js";

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
  type: z.enum(["sticky", "shape", "stroke", "text", "image", "frame", "comment", "vote", "timer", "reaction", "settings", "connector", "table"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  z: z.number().optional(),
  locked: z.boolean().optional(),
  group: z.string().max(64).optional(),
});
const ViewportSchema = z.object({ x: z.number(), y: z.number(), scale: z.number().min(0.01).max(100) });
const Name = z.string().trim().min(1).max(100);
const CreateBody = z.object({ name: Name.optional(), objects: z.array(BoardObject).max(5000).optional() });
const SaveBody = z.object({ objects: z.array(BoardObject).max(5000), viewport: ViewportSchema.optional() });
const VersionBody = z.object({ label: z.string().trim().max(60).optional(), objects: z.array(BoardObject).max(5000) });
// PATCH on a board: any of these. "trashed" moves it to / back from the trash.
const PatchBody = z
  .object({ name: Name.optional(), favorite: z.boolean().optional(), folder: z.string().trim().max(40).optional(), trashed: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");
export const TRASH_DAYS = 30;
const InviteBody = z.object({ email: z.string().trim().toLowerCase().email().max(200), role: z.enum(["editor", "viewer"]) });
const MentionBody = z.object({ handles: z.array(z.string().max(60)).min(1).max(10), text: z.string().trim().max(500) });
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
  favorite: !!b.favorite, folder: b.folder ?? "", deletedAt: b.deletedAt ?? 0,
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
  // A board you may open: yours, or one somebody shared with you. `min` is the least right the action needs.
  async function accessBoard(id: string, user: UserRec, min: BoardRole): Promise<{ board: BoardRec; role: BoardRole }> {
    const board = await store.getBoard(id);
    const role = board ? roleOf(board, user.id) : null;
    if (!board || !role) throw fail(404, "not_found", "Board not found.");
    if (!atLeast(role, min)) throw fail(403, "forbidden", min === "owner" ? "Only the owner can do this." : "You can only view this board.");
    return { board, role };
  }
  const log = (board: BoardRec, by: string, text: string) => store.updateBoard(board.id, { activity: addActivity(board.activity, by, text) });
  const notify = async (userId: string, text: string, boardId?: string) => {
    const u = await store.findUserById(userId);
    if (u) await store.updateUser(userId, { notifications: addNotification(u.notifications, { id: nanoid(10), at: Date.now(), text: text.slice(0, 240), boardId }) });
  };
  const mailTo = async (to: string, subject: string, text: string): Promise<boolean> => {
    if (!config.sendMail) return false;
    try {
      await config.sendMail({ to, subject, text });
      return true;
    } catch {
      return false; // the invitation still counts; e-mail is a bonus
    }
  };
  // the people list of one board, shaped for the People panel (e-mail addresses and pending invites are for the owner only)
  async function peopleOf(board: BoardRec, role: BoardRole) {
    const ids = [board.ownerId, ...(board.members ?? []).map((m) => m.userId)];
    const users = new Map((await store.findUsersByIds(ids)).map((u) => [u.id, u]));
    const owner = users.get(board.ownerId);
    return {
      you: role,
      owner: { id: board.ownerId, name: owner?.name ?? "Owner" },
      members: (board.members ?? []).map((m) => ({ userId: m.userId, name: users.get(m.userId)?.name ?? "Someone", email: role === "owner" ? users.get(m.userId)?.email : undefined, role: m.role })),
      invites: role === "owner" ? (board.invites ?? []).map((i) => ({ email: i.email, role: i.role })) : [],
    };
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
      if (!board?.share?.enabled || board.deletedAt) throw fail(404, "not_found", "This link is not active.");
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

    // ----- notifications -----
    if (seg[0] === "notifications") {
      const user = await requireUser(req);
      if (method === "GET" && !seg[1]) {
        const list = user.notifications ?? [];
        return json(200, { notifications: list, unread: list.filter((n) => !n.read).length });
      }
      if (method === "POST" && seg[1] === "read") {
        await store.updateUser(user.id, { notifications: (user.notifications ?? []).map((n) => ({ ...n, read: true })) });
        return json(200, { ok: true });
      }
    }

    // ----- boards -----
    if (seg[0] === "boards") {
      const user = await requireUser(req);
      const id = seg[1];

      if (!id && method === "GET") {
        // boards that have been in the trash for 30 days are removed for good
        const limit = Date.now() - TRASH_DAYS * 86400_000;
        const all = await store.listBoards(user.id);
        const old = all.filter((b) => b.deletedAt && b.deletedAt < limit);
        for (const b of old) await store.deleteBoard(b.id);
        // pending e-mail invitations for this address become real memberships now that the person has an account
        for (const b of await store.findBoardsByInvite(user.email)) {
          const inv = b.invites?.find((i) => i.email === user.email);
          if (!inv || b.ownerId === user.id) continue;
          const members = [...(b.members ?? []).filter((m) => m.userId !== user.id), { userId: user.id, role: inv.role, addedAt: Date.now() }];
          await store.updateBoard(b.id, { members, invites: (b.invites ?? []).filter((i) => i.email !== user.email), activity: addActivity(b.activity, user.name, `${user.name} joined as ${inv.role}`) });
        }
        const shared = (await store.listSharedBoards(user.id)).filter((b) => !b.deletedAt);
        const owners = new Map((await store.findUsersByIds([...new Set(shared.map((b) => b.ownerId))])).map((u) => [u.id, u.name]));
        return json(200, {
          boards: all.filter((b) => !old.includes(b)).map(publicBoard),
          shared: shared.map((b) => ({ ...publicBoard(b), role: roleOf(b, user.id), ownerName: owners.get(b.ownerId) ?? "Someone" })),
        });
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
        const { board, role } = await accessBoard(id, user, method === "GET" ? "viewer" : method === "PUT" ? "editor" : "owner");
        if (method === "GET") return json(200, { board: { ...publicBoard(board), role } });
        if (method === "PUT") {
          const body = parse(SaveBody, req.body);
          checkSize(body.objects);
          const updatedAt = Date.now();
          await store.updateBoard(id, { objects: body.objects, viewport: body.viewport ?? board.viewport, updatedAt });
          return json(200, { updatedAt });
        }
        if (method === "PATCH") {
          const body = parse(PatchBody, req.body);
          const patch: Partial<BoardRec> = {};
          if (body.name !== undefined) {
            patch.name = body.name;
            patch.updatedAt = Date.now();
            patch.activity = addActivity(board.activity, user.name, `${user.name} renamed the board to "${body.name}"`);
          }
          if (body.favorite !== undefined) patch.favorite = body.favorite;
          if (body.folder !== undefined) patch.folder = body.folder;
          if (body.trashed !== undefined) {
            patch.deletedAt = body.trashed ? Date.now() : 0;
            patch.activity = addActivity(patch.activity ?? board.activity, user.name, body.trashed ? `${user.name} moved the board to the trash` : `${user.name} restored the board`);
            if (body.trashed && board.share?.enabled) patch.share = { ...board.share, enabled: false }; // a trashed board is no longer public
          }
          await store.updateBoard(id, patch);
          const now = { ...board, ...patch };
          return json(200, { name: now.name, favorite: !!now.favorite, folder: now.folder ?? "", deletedAt: now.deletedAt ?? 0 });
        }
        if (method === "DELETE") {
          await store.deleteBoard(id);
          return { status: 204 };
        }
      }
      if (id && seg[2] === "join" && method === "POST") {
        const { board, role } = await accessBoard(id, user, "viewer");
        if (board.deletedAt && role !== "owner") throw fail(404, "not_found", "Board not found.");
        return joinResponse(board, user.id, user.name, role);
      }
      if (id && seg[2] === "share") {
        const { board } = await accessBoard(id, user, "owner");
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
          await store.updateBoard(id, { share, activity: addActivity(board.activity, user.name, body.enabled ? `${user.name} turned the share link on (${share.right === "editor" ? "can edit" : "can view"})` : `${user.name} turned the share link off`) });
          return json(200, { share });
        }
      }
      if (id && seg[2] === "versions") {
        const { board: vb } = await accessBoard(id, user, method === "POST" ? "editor" : "viewer");
        const list = await store.getVersions(id);
        const summaries = (l: typeof list) => l.map((v) => ({ id: v.id, at: v.at, label: v.label, count: v.objects.length })).reverse(); // newest first
        if (!seg[3] && method === "GET") return json(200, { versions: summaries(list) });
        if (!seg[3] && method === "POST") {
          const body = parse(VersionBody, req.body);
          checkSize(body.objects);
          const next = addVersion(list, { id: nanoid(10), at: Date.now(), label: body.label || "Saved version", objects: body.objects });
          await store.setVersions(id, next);
          await log(vb, user.name, `${user.name} saved a version${body.label ? ` "${body.label}"` : ""}`);
          return json(201, { versions: summaries(next) });
        }
        if (seg[3] && method === "GET") {
          const v = list.find((x) => x.id === seg[3]);
          if (!v) throw fail(404, "not_found", "That version does not exist any more.");
          return json(200, { objects: v.objects });
        }
      }
      // ----- people: members, invitations, activity, mentions -----
      if (id && seg[2] === "members") {
        const { board, role } = await accessBoard(id, user, "viewer");
        if (!seg[3] && method === "GET") return json(200, await peopleOf(board, role));
        if (!seg[3] && method === "PUT") {
          if (role !== "owner") throw fail(403, "forbidden", "Only the owner can invite people.");
          const { email, role: newRole } = parse(InviteBody, req.body);
          if (email === user.email) throw fail(400, "invalid_input", "That is your own address.");
          const target = await store.findUserByEmail(email);
          const link = config.appUrl ? `${config.appUrl}/#/board/${board.id}` : "";
          let emailed = false;
          if (target) {
            if ((board.members?.length ?? 0) >= MAX_MEMBERS && !board.members?.some((m) => m.userId === target.id)) throw fail(400, "limit", `A board can have up to ${MAX_MEMBERS} people.`);
            const had = board.members?.find((m) => m.userId === target.id);
            const members = [...(board.members ?? []).filter((m) => m.userId !== target.id), { userId: target.id, role: newRole, addedAt: had?.addedAt ?? Date.now() }];
            board.members = members;
            board.invites = (board.invites ?? []).filter((i) => i.email !== email);
            board.activity = addActivity(board.activity, user.name, had ? `${user.name} changed ${target.name} to ${newRole}` : `${user.name} added ${target.name} as ${newRole}`);
            await store.updateBoard(id, { members, invites: board.invites, activity: board.activity });
            if (!had) {
              await notify(target.id, `${user.name} invited you to "${board.name}" (${newRole === "editor" ? "can edit" : "can view"})`, board.id);
              emailed = await mailTo(email, `${user.name} invited you to a Sketchboard board`, `${user.name} invited you to "${board.name}" as ${newRole === "editor" ? "an editor" : "a viewer"}.\n\n${link ? `Open it: ${link}\n` : "Sign in to Sketchboard to open it.\n"}`);
            }
          } else {
            const others = (board.invites ?? []).filter((i) => i.email !== email);
            if (others.length >= MAX_INVITES) throw fail(400, "limit", `A board can have up to ${MAX_INVITES} pending invitations.`);
            const invites = [...others, { email, role: newRole, at: Date.now() }];
            board.invites = invites;
            board.activity = addActivity(board.activity, user.name, `${user.name} invited ${email} as ${newRole}`);
            await store.updateBoard(id, { invites, activity: board.activity });
            emailed = await mailTo(email, `${user.name} invited you to a Sketchboard board`, `${user.name} invited you to "${board.name}" as ${newRole === "editor" ? "an editor" : "a viewer"}.\n\nCreate a free account with this e-mail address and the board will be waiting for you.\n${config.appUrl ? `\n${config.appUrl}\n` : ""}`);
          }
          return json(200, { ...(await peopleOf(board, "owner")), emailed });
        }
        if (seg[3] && method === "DELETE") {
          const targetId = seg[3];
          if (role !== "owner" && targetId !== user.id) throw fail(403, "forbidden", "Only the owner can remove people.");
          const gone = board.members?.find((m) => m.userId === targetId);
          if (!gone) throw fail(404, "not_found", "That person is not on this board.");
          const who = (await store.findUserById(targetId))?.name ?? "Someone";
          board.members = (board.members ?? []).filter((m) => m.userId !== targetId);
          board.activity = addActivity(board.activity, user.name, targetId === user.id ? `${user.name} left the board` : `${user.name} removed ${who}`);
          await store.updateBoard(id, { members: board.members, activity: board.activity });
          return json(200, await peopleOf(board, role));
        }
      }
      if (id && seg[2] === "invites" && seg[3] && method === "DELETE") {
        const { board } = await accessBoard(id, user, "owner");
        const email = decodeURIComponent(seg[3]).toLowerCase();
        await store.updateBoard(id, { invites: (board.invites ?? []).filter((i) => i.email !== email) });
        board.invites = (board.invites ?? []).filter((i) => i.email !== email);
        return json(200, await peopleOf(board, "owner"));
      }
      if (id && seg[2] === "activity" && method === "GET") {
        const { board } = await accessBoard(id, user, "viewer");
        return json(200, { activity: board.activity ?? [] });
      }
      if (id && seg[2] === "mentions" && method === "POST") {
        const { board } = await accessBoard(id, user, "editor");
        const { handles, text } = parse(MentionBody, req.body);
        const people = (await store.findUsersByIds([board.ownerId, ...(board.members ?? []).map((m) => m.userId)])).map((u) => ({ id: u.id, name: u.name }));
        const hit = findMentioned(handles, people).filter((uid) => uid !== user.id);
        for (const uid of hit) await notify(uid, `${user.name} mentioned you in "${board.name}": ${text}`, board.id);
        return json(200, { notified: hit.length });
      }
      if (id && seg[2] === "duplicate" && method === "POST") {
        const { board: src } = await accessBoard(id, user, "owner");
        const now = Date.now();
        // (the copy is a new board: no share link of its own yet, not starred, not in the trash)
        const copy: BoardRec = { ...src, id: nanoid(12), name: `${src.name} copy`.slice(0, 100), share: undefined, members: [], invites: [], activity: [], favorite: false, deletedAt: 0, createdAt: now, updatedAt: now };
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
