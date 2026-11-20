# Sketchboard – Software Code Documentation (SCD)

Nov 16, 2026 · @Mansoor

Sketchboard is a free online whiteboard (sticky notes, shapes, pen, text, connectors) that several people can edit at the same time. This document explains how the code that builds it is organised and how each part works, so that someone who did not write it can run, debug and extend it.

## 1. Introduction

**Purpose.** Describe the implemented code (not the plan). The earlier documents (SRS, SDA, Database Design, API Documentation, UI/UX Design) say what the system should do; this one says what the code actually does, and section 12 lists where the two differ.

**Scope.** Everything in the repository as of Stage 5: the website (`web/src`), the API (`web/api`) and the realtime service (`realtime`).

**Readers.** The developer, the supervisor who marks the code, and anyone who takes over the project.

**How the code grew.** It was built in five stages, and each stage still runs:

1. Local whiteboard: canvas, sticky notes, shapes, pen, text, select, move, delete, undo/redo.
2. Connectors, marquee selection, moving several objects together, saving in the browser.
3. New interface: dashboard with templates, light and dark mode, board screen controls.
4. Backend: accounts, boards saved to a database.
5. Live collaboration: share links, live edits, cursors, view-only guests.

**Three programs, one repository.**

| Program | Where it runs | Folder | Job |
| --- | --- | --- | --- |
| Website | the user's browser | `web/src` | Draws the board, handles every click and key |
| API | Vercel (serverless function) | `web/api` | Accounts, saving boards, share links, join passes |
| Realtime service | Cloudflare (Worker + Durable Object) | `realtime` | Keeps one live copy of each open board and passes edits between people |

## 2. Technology stack

All code is TypeScript in strict mode (`strict`, `noUnusedLocals`, `noUnusedParameters`). Versions below are the ones installed when this document was written (Node 22).

| Layer | Tool | Version | Why it was chosen |
| --- | --- | --- | --- |
| UI framework | React | 19.3 | Components and state-driven redraw |
| Build tool | Vite | 8.3 | Fast dev server, one-command production build |
| Language | TypeScript | 7.0 | Catches mistakes before running |
| Styling | Tailwind CSS | 4.3 | Utility classes; colours come from CSS variables so light/dark mode is one switch |
| Canvas | Konva + react-konva | 10.9 / 19.3 | Fast 2D canvas with drag, select and transform built in |
| Client state | Zustand | 5.1 | Small store, no boilerplate |
| Ids | nanoid | 6.0 | Short unique ids made in the browser |
| Validation | zod | 4.6 | One schema checks every API request body |
| Database driver | mongodb | 7.9 | Talks to MongoDB Atlas |
| API host | Vercel Functions | Hobby plan | Free, deploys from the same repository |
| Database | MongoDB Atlas | M0 (512 MB) | Free, no card needed |
| Realtime | Cloudflare Workers + Durable Objects | wrangler 4.162 | Free tier, supports WebSockets and per-board state |
| Tests | node:test + tsx, Playwright | tsx 4.23 | No test framework to install; browser checks for the canvas |

**Rules the project follows**

- Everything must be free and must not ask for a card.
- No Render. Vercel hosts the site and the API; Cloudflare hosts only the realtime part, because Vercel functions cannot hold a WebSocket open.
- The API logic is written without any framework (see section 7), so it runs the same on Vercel, in the Vite dev server and inside tests.

## 3. Project structure

Size: about 3,100 lines in `web/src`, 990 in `web/api` and 475 in `realtime/src` (TypeScript and TSX).

```
sketchboard/
  README.md, DEPLOY.md
  web/                      Website + API (deployed to Vercel)
    index.html, vite.config.ts, tsconfig.json
    src/                    Browser code
      main.tsx, App.tsx     Start-up and screen routing
      types.ts, constants.ts, geometry.ts, templates.ts
      store.ts              The board store (all board logic)
      repo.ts, persist.ts   Where boards are saved (browser or cloud)
      api.ts, auth.ts       Calls to the API, login state
      ui.ts, useShortcuts.ts  Theme, view, keyboard
      components/           Canvas, Toolbar, TopBar, Dashboard, ShareDialog ...
      realtime/             protocol.ts, ops.ts, connection.ts, ops.test.ts
    api/                    Server code
      v1/[...path].ts       The single Vercel entry point
      _lib/                 core.ts, security.ts, store.ts, mongo-store.ts,
                            node-adapter.ts, types.ts
      _tests/               api.test.ts, share.test.ts
  realtime/                 Cloudflare project
    wrangler.jsonc
    src/                    index.ts, room.ts, token.ts, validate.ts, protocol.ts
```

**Where to look for what**

| If you want to change... | Open |
| --- | --- |
| What a sticky note or shape is | `src/types.ts`, `src/components/ObjectNode.tsx` |
| What a tool does when clicked | `src/components/Canvas.tsx`, `src/store.ts` |
| Colours, zoom limits | `src/constants.ts`, `src/index.css` |
| Keyboard shortcuts | `src/useShortcuts.ts` |
| Connector lines | `src/geometry.ts`, `src/components/ConnectorNode.tsx` |
| Where a board is saved | `src/repo.ts` |
| An API route or its rules | `api/_lib/core.ts` |
| Password and token code | `api/_lib/security.ts` |
| How edits reach other people | `src/realtime/*`, `realtime/src/room.ts` |

**Two rules that keep the folders tidy**

- `src/realtime/protocol.ts` is a copy of `realtime/src/protocol.ts`. The two folders are deployed separately, so they cannot share a file; the copy must be updated by hand when the message format changes.
- Files in `api/` import each other with a `.js` ending (for example `./security.js`) because the compiled functions run as ES modules.

## 4. Coding standards

- **Strict TypeScript.** No unused variables or parameters; the build (`npm run build`) runs `tsc` for the website and again for `api/`, so a type error stops the build.
- **Names.** Files with one React component use `PascalCase.tsx`; everything else uses `camelCase.ts`. Types and components are `PascalCase`, functions and variables are `camelCase`, constants are `UPPER_SNAKE_CASE`.
- **Components stay small.** A component draws and reacts; board rules live in the store (`store.ts`), pure calculations live in `geometry.ts` and `realtime/ops.ts`.
- **Immutable updates.** The store never changes an object in place; it makes a new array or object. This is what lets undo keep simple snapshots and lets React notice changes.
- **Zustand selectors return stored values only.** Filtering or mapping inside a selector creates a new array on every read and causes an endless redraw loop (this happened once; the fix is to select the raw array and filter outside).
- **One place for each rule.** Whether someone may edit is decided in one store helper (`canEditNow`), and on the server in `core.ts` and `room.ts`. The interface hiding a button is a convenience, never the protection.
- **Server input is untrusted.** Every API body goes through a zod schema; every realtime message goes through `validate.ts`.
- **Comments explain why, not what.** Short sentences in plain English at the top of each file say what the file is for.
- **Secrets stay out of the code.** They come from environment variables (section 11) and `.env`, `.dev.vars` and `.data` are in `.gitignore`.

## 5. Data model

A board is a flat list of objects. Every object has the same base fields (`src/types.ts`) plus fields for its type.

```ts
interface Base { id: string; x: number; y: number; width: number; height: number; rotation: number }

Sticky     { type: "sticky";    text; color }
Shape      { type: "shape";     kind: "rect" | "ellipse" | "diamond"; fill; stroke; strokeWidth; text }
Stroke     { type: "stroke";    points: number[]; color; lineWidth }   // [x1,y1,x2,y2...] relative to (x,y)
TextObj    { type: "text";      text; fontSize; color }
Connector  { type: "connector"; fromId; toId; lineStyle: "straight" | "elbow"; endArrow; color }

type Viewport = { x: number; y: number; scale: number }  // pan and zoom
```

A connector stores only the ids of the two objects it joins. Its line is calculated every time it is drawn, so moving a sticky note moves the line with no extra work. Because everything is plain JSON, the same objects are stored in the browser, in MongoDB and in the Durable Object.

**Where the data lives**

| Place | Content | Key |
| --- | --- | --- |
| Browser (guest mode) | board list and each board | `sketchboard.boards.v2`, `sketchboard.board.v2.<id>` |
| MongoDB `users` | `_id`, email, name, password hash, created date | email is unique |
| MongoDB `boards` | `_id`, ownerId, title, objects, viewport, share settings, dates | index on ownerId + updatedAt; sparse index on share.token |
| Durable Object (per board, SQLite) | `objects(id, ord, json)` and `meta(k, v)` | one object per room |

The `_id` in MongoDB is the app's own string id, not a MongoDB ObjectId, so ids look the same everywhere.

**Share settings** are stored inside the board document as `share: { enabled, right, token }`, where `right` is `view` or `edit` and `token` is the random value in the share link.

**Limits** (checked by the API): at most 5,000 objects per board and 3 MB per save. Board objects are validated loosely (type and id must exist, other fields pass through) so a new object type can be added without a database change.

## 6. Frontend implementation

**Screens.** `App.tsx` starts the login check and then picks a screen from the address after `#`: `#/board/<id>` (board), `#/login` (sign in / register), `#/s/<token>` (shared board) and anything else (dashboard). Hash routing was used because it needs no server rewrite rules on a static host. A small Message screen shows errors such as "board not found".

**The store (`store.ts`).** One Zustand store holds the open board and everything around it:

| Group | Fields |
| --- | --- |
| Board | `objects`, `viewport`, `title`, `boardId`, `loaded` |
| Interaction | `tool`, `selectedIds`, `editingId`, clipboard |
| History | `past`, `future` (snapshots of `objects`) |
| Collaboration | `mode` (own or shared), `role` (owner, editor, viewer), `connection` (off, connecting, live), `peers`, `cursors`, `notice` |

Actions such as `addObject`, `updateObjects`, `removeSelected`, `duplicateSelected`, `copy`, `paste`, `undo`, `redo`, `zoomBy` and `fitToContent` are the only way the board changes. Each one first asks `canEditNow`, so a viewer cannot change anything even if a component forgot to hide a control.

**Canvas (`Canvas.tsx`).** A Konva `Stage` with one `Layer`. Connectors are drawn first (underneath), then objects. The component handles the mouse for the active tool: select and marquee, drag to create shapes, draw pen strokes, click to place sticky notes and text, click two objects to connect them. Space plus drag, or the middle button, pans. The wheel zooms around the pointer.

**Objects.** `ObjectNode.tsx` turns one board object into Konva shapes. A `Transformer` gives resize and rotate handles for editors only. When several objects are selected and one is dragged, Konva moves all of them; the code just reads the final position of every selected node on drag end and writes one update.

**Text editing.** `TextEditor.tsx` puts an HTML `textarea` over the object while editing, because canvas text cannot be typed into directly. Focus is given 30 ms after opening, because the browser's own mouse-down handling would otherwise take the focus back.

**Other components.** `Toolbar` (tools; select-only for viewers), `PropertiesPanel` (colour, font size, line style for the selection), `BottomBars` (zoom, fit, undo/redo), `TopBar` (title, share, avatars, connection state), `Dashboard` and `BoardThumb` (board list and previews, templates), `AuthScreen`, `AccountMenu`, `ThemeToggle`, `PeerCursors`, `ShareDialog`, `EmptyHint`.

**Themes.** Colours are CSS variables defined in `index.css`; the `.dark` class on the page swaps them. Stored choice is read at start-up. Ink colours on the canvas pass through `inkFor()` so dark text on a dark board is flipped to a readable colour.

**Undo and redo.** `withHistory` pushes the old `objects` array onto `past` before every change (clearing `future`). Undo moves one snapshot back. Edits from other people are also applied inside every stored snapshot, so undo only reverts the user's own action and never erases a collaborator's work.

**Saving (`repo.ts`, `persist.ts`).** `getRepo()` returns `localRepo` (browser storage) for guests and `cloudRepo` (the API) when logged in. Saves are debounced: 300 ms for local, 1,200 ms for cloud, and queued so two saves never run at once. While a realtime connection is live, or on a shared board, the browser does not save; the Durable Object does (section 8).

**Shortcuts (`useShortcuts.ts`).** V select, N sticky, S shape, P pen, T text, L connector, Space pan, Shift+1 fit to content, Ctrl+Z / Shift+Z / Y undo and redo, Ctrl+C / V / D copy, paste, duplicate, Delete, Esc.

## 7. Backend implementation

**One core, three hosts.** `api/_lib/core.ts` exports `createApi(store, config)`, which returns one function that takes a plain `ApiRequest` (method, path, headers, cookies, body) and returns a plain `ApiResponse` (status, headers, body). It knows nothing about Vercel. Three small adapters call it:

- `api/v1/[...path].ts` (production): the Vercel catch-all function, using `node-adapter.ts` to convert the Node request and response.
- `devApi` plugin in `vite.config.ts` (development): loads the same code inside the Vite dev server, so `npm run dev` serves site and API on one port.
- Tests: call the handler directly with no network at all.

There is one catch-all function instead of one file per route to stay inside Vercel's free function limit.

**Store interface.** `store.ts` defines what the API needs from a database (find user by email, create user, list boards, get/save/delete board, find board by share token, and so on). Three versions exist:

| Store | Used when | Data |
| --- | --- | --- |
| `MemoryStore` | tests | lost when the process ends |
| `FileStore` | local development | `.data/db.json` |
| `mongo-store.ts` | production (when `MONGODB_URI` is set) | MongoDB Atlas |

**Routes** (all under `/api/v1`):

| Method and path | What it does | Who |
| --- | --- | --- |
| POST `auth/register`, `auth/login`, `auth/logout` | Create account, sign in, sign out | anyone |
| GET `auth/me` | Current user or 401 | logged in |
| GET, POST `boards` | List own boards, create one | owner |
| GET, PUT, PATCH, DELETE `boards/:id` | Open, save objects + viewport, rename, delete | owner |
| POST `boards/:id/duplicate` | Copy a board | owner |
| POST `boards/:id/join` | Get a realtime join pass for an own board | owner |
| GET, PUT `boards/:id/share` | Read or change share settings (`enabled`, `right`, `regenerate`) | owner |
| GET `share/:token` | Board title and right for a share link | anyone with link |
| POST `share/:token/join` | Get a join pass (guests allowed) | anyone with link |
| GET, PUT `internal/boards/:id/state` | The room reads and writes the board | realtime secret only |

Routes that need realtime return `503 realtime_not_configured` when `REALTIME_URL` or `REALTIME_SECRET` is missing, so the rest of the app still works.

**Request pipeline.** For every request the core: (1) matches the route, (2) for non-GET requests that are not internal, requires the header `X-Sketchboard: 1` (a cross-site form cannot set it, which blocks CSRF), (3) reads the session cookie, (4) validates the body with zod, (5) runs the action, (6) maps errors to a JSON `{ error, message }`.

**Accounts.** Passwords are hashed with scrypt (N=16384) and a random salt. Login runs a dummy hash when the email is unknown so that the response time does not reveal whether an account exists. The session is a stateless token (section 9) stored in the `sb_session` cookie: `HttpOnly`, `SameSite=Lax`, `Secure` over https, valid 30 days.

**Ownership.** Every board route loads the board by id and compares `ownerId` with the logged-in user. If it is not theirs the answer is 404, not 403, so ids cannot be probed.

## 8. Realtime implementation

**Joining a board.**

1. The browser asks the API for a join pass (`POST boards/:id/join` for the owner, `POST share/:token/join` for a link).
2. The API checks the right and returns a 2-minute token signed with `REALTIME_SECRET`, with claims `{ b: boardId, u: userId, n: name, r: role, exp }`, and the WebSocket address.
3. The browser opens the WebSocket. The Worker (`realtime/src/index.ts`) verifies the token with WebCrypto and forwards the connection to the `Room` Durable Object for that board id. There is exactly one Room per board, so everyone on a board meets in the same place.
4. The Room sends `welcome` with the full board, the connection's own identity and the people present.

**Messages** (`protocol.ts`, JSON text):

| Direction | Message | Meaning |
| --- | --- | --- |
| Client to room | `edit { editId, ops }` | A list of changes, with an id the client chose |
| Client to room | `cursor { x, y }` | Pointer position in board coordinates |
| Room to client | `welcome { you, seq, objects, peers }` | Full state on join and after any problem |
| Room to client | `ack { editId }` | Your edit was accepted |
| Room to others | `edit { seq, from, ops }` | Someone else's accepted edit |
| Room to client | `reject { editId, reason, message }` | Edit refused; a fresh `welcome` follows so the client resyncs |
| Room to all | `presence`, `cursor` | Who is here, where their pointers are |

**Operations.** `add` (whole object), `set` (only the fields that changed), `remove` (id). Two people changing different fields of the same object both win; for the same field the later edit to reach the room wins. Applying an operation twice gives the same result, so resending after a reconnect is safe.

**Room (`room.ts`).** Uses the hibernation API, so an idle room costs nothing and each socket keeps a small attachment (user, role). State is kept in SQLite tables `objects(id, ord, json)` and `meta(k, v)`. The Room checks the role (viewers may only send `cursor`), validates every message (`validate.ts`: size up to 256 KB, up to 200 ops per edit, known types only), applies it, saves it, acknowledges the sender and broadcasts to the others.

**Rate limit.** Each socket has a token bucket: 20 edits per second and 10 cursor moves per second, with bursts up to double. Past the limit the edit is rejected and the client is resynced.

**Saving to the database.** The Room does not talk to MongoDB. After the first unsaved edit it sets an alarm for 5 seconds later, then sends the board to the API with `PUT internal/boards/:id/state` (secret in the `x-realtime-key` header). On failure it retries after 10 seconds. When the last person leaves it saves after 300 ms. On start, an empty Room loads the board from `GET internal/boards/:id/state`.

**Close codes.** 4001 bad token, 4003 forbidden, 4004 board not found, 4010 token expired. 4008 is defined but not used (the rate limit uses `reject` instead).

**Client side (`src/realtime/connection.ts`).**

- `startRealtime` fetches a join pass and opens the socket; `stopRealtime` closes it.
- When the store changes locally, `sendOps(diffOps(prev, next))` queues the edit. Unacknowledged edits are kept and sent again after the next `welcome`.
- Remote edits go through `applyRemoteOps`, which updates `objects` and also the undo and redo snapshots.
- Reconnect uses growing waits. If the first two attempts both fail, the client stops trying and goes back to normal saving through `PUT boards/:id`, so a missing realtime service never blocks the user. Codes 4001, 4003 and 4004 are final and are not retried.
- Cursor messages are throttled; `PeerCursors` draws other people's pointers with names and colours, and `TopBar` shows avatars.

## 9. Key algorithms

Excerpts are copied from the source; comments are shortened.

**9.1 Zoom around the pointer** (`store.ts`). The point of the board under the mouse must stay under the mouse while the scale changes. With scale factor `k = newScale / oldScale`, the new offset is `cx - (cx - x) * k`.

```ts
zoomBy: (factor, cx, cy) =>
  set((s) => {
    const scale = clampScale(s.viewport.scale * factor);   // 0.1 to 4
    const k = scale / s.viewport.scale;
    return { viewport: { scale, x: cx - (cx - s.viewport.x) * k, y: cy - (cy - s.viewport.y) * k } };
  }),
```

The wheel in `Canvas.tsx` calls it with `1.1` or `1/1.1` per step, or `Math.exp(-deltaY * 0.01)` for pinch and Ctrl+wheel.

**9.2 Connector line** (`geometry.ts`). Each object has four anchor points (middle of top, right, bottom, left). The connector tries all 16 pairs and uses the pair with the smallest squared distance. An elbow connector goes horizontally to the middle, vertically, then horizontally again.

```ts
for (const a of anchors(from)) for (const b of anchors(to)) {
  const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  if (d < bestD) { bestD = d; best = [a, b]; }
}
if (c.lineStyle === "elbow") {
  const mx = (a.x + b.x) / 2;
  return [a.x, a.y, mx, a.y, mx, b.y, b.x, b.y];
}
return [a.x, a.y, b.x, b.y];
```

Rotation is ignored for anchor points (known limit).

**9.3 Turning a change into operations** (`realtime/ops.ts`). Compare the board before and after. New ids become `add`, missing ids become `remove`, and objects that changed become `set` with only the changed fields. Applying is the reverse, and a `set` for a deleted object is skipped.

```ts
for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
  if (a[k] !== b[k]) fields[k] = b[k];        // only changed fields
if (Object.keys(fields).length) ops.push({ op: "set", id: o.id, fields });
```

Because objects are never changed in place, `old !== o` is a cheap test for "this object changed".

**9.4 Token bucket** (`room.ts`). A bucket holds up to `2 x perSecond` tokens and refills at `perSecond` tokens per second; each message costs one token.

```ts
b.tokens = Math.min(perSecond * 2, b.tokens + ((now - b.at) / 1000) * perSecond);
b.at = now;
if (b.tokens < 1) return false;   // too fast: reject
b.tokens -= 1; return true;
```

**9.5 Signed tokens** (`security.ts`). A session token is `<payload>.<signature>`: the payload is base64 JSON `{ uid, exp }` and the signature is HMAC-SHA256 of the payload with `SESSION_SECRET`. Reading it recomputes the signature and compares in constant time (`timingSafeEqual`) before looking at the payload, then checks `exp`. The join pass has the same shape with claims `{ b, u, n, r, exp }` and a 2-minute life, and the Worker re-implements the check with WebCrypto.

```ts
const good = Buffer.from(sign(payload, secret));
const got = Buffer.from(sig);
if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
```

Passwords use `scrypt` with a random salt (N=16384) and are compared with `timingSafeEqual` as well.

## 10. Security and error handling

| Risk | What the code does |
| --- | --- |
| Stolen database | Passwords stored only as scrypt hashes with a random salt |
| Guessing which emails have accounts | Same answer and same timing for wrong email and wrong password |
| Cross-site request forgery | Non-GET requests need `X-Sketchboard: 1`; cookie is `SameSite=Lax` |
| Script reading the session | Cookie is `HttpOnly`; `Secure` over https |
| Forged or old tokens | HMAC signature, constant-time compare, expiry (30 days session, 2 minutes join pass) |
| Opening someone else's board | Ownership check; the answer is 404 |
| Viewer editing through a modified client | The Room checks the role from the signed token and refuses edits |
| Oversized or malformed input | zod schemas, 3 MB and 5,000-object limits; realtime messages up to 256 KB and 200 ops |
| Flooding the room | Token bucket per socket (section 9.4) |
| Calling internal routes from outside | Need `x-realtime-key`, compared in constant time |
| Leaking secrets | Only environment variables; `.env`, `.dev.vars`, `.data` are ignored by git |

**Errors.** The API always answers `{ error: <code>, message: <text> }` with a fitting status (400 invalid input with a friendly message, 401 not logged in, 404, 409 email already used, 503 realtime not configured). The website turns these into messages on the form or a Message screen. If saving fails the user sees a notice and the next change retries. Realtime failures never block drawing: the client falls back to normal saving.

**Not protected yet** (see section 12): no limit on login attempts, no email check, no password reset, sessions cannot be cancelled from the server, share rights are checked only when someone joins.

## 11. Build, run and test

**Run on your computer** (Node 22). No accounts needed; data goes to `web/.data/db.json`, and realtime is off unless the Worker runs too.

```
cd web
npm install
npm run dev          # site + API at http://localhost:5173

# optional, for live collaboration (second terminal)
cd realtime
npm install
cp .dev.vars.example .dev.vars
npx wrangler dev --port 8787     # http://127.0.0.1:8787/health answers ok
```

For realtime in development, `web/.env` needs `REALTIME_URL=ws://127.0.0.1:8787` and `REALTIME_SECRET` equal to the value in `realtime/.dev.vars`.

**Commands** (inside `web/`)

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with the API plugin |
| `npm run build` | Type-checks the site and `api/`, then builds `dist/` |
| `npm run typecheck` | Type-check only |
| `npm test` | Runs all unit and API tests |

**Environment variables**

| Name | Where | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Vercel | Atlas connection string; without it the file store is used |
| `MONGODB_DB` | Vercel | Database name |
| `SESSION_SECRET` | Vercel | Signs session cookies and join passes |
| `REALTIME_URL` | Vercel | `wss://` address of the Worker |
| `REALTIME_SECRET` | Vercel and Cloudflare | Same value in both; signs join passes and protects internal routes |
| `API_BASE` | Cloudflare (`wrangler.jsonc`) | Address of the deployed site, used when the Room saves |

Full deployment steps are in `DEPLOY.md` and in the Deployment Document.

**Tests that exist** (`npm test` runs `tsx --test api/_tests/*.test.ts src/realtime/*.test.ts`)

| File | Tests | Covers |
| --- | --- | --- |
| `api/_tests/api.test.ts` | 12 | Register, login, logout, wrong password, CSRF header, board create/save/rename/delete/duplicate, ownership |
| `api/_tests/share.test.ts` | 7 | Share settings, join passes, link rights, guest join, 503 when realtime is missing |
| `src/realtime/ops.test.ts` | 8 | `diffOps` and `applyOps`: add, set, remove, repeat-safe, per-field merge |

All 27 pass. Browser checks use Playwright with headless Chromium (two windows editing one board, reconnect fallback). These scripts are kept outside the zip and are described in the Test Cases document. The Worker was also run on the real Workers runtime locally with `wrangler dev`.

## 12. Differences from the design documents, limits and unverified parts

**Where the code differs from the earlier documents**

| Design said | Code does | Reason |
| --- | --- | --- |
| One function per API route | One catch-all Vercel function | Stays inside the free function limit; same handler runs in dev and tests |
| Server-side sessions | Stateless signed token in a cookie | No session table to store or clean up |
| bcrypt or argon2 | scrypt (built into Node) | No native package to install on Vercel |
| Edits with sequence numbers and catch-up from `lastSeq` | Per-field `set` operations; any problem triggers a full `welcome` resync | Simpler and correct for boards of this size |
| `snapshots` collection (last 5) and an `edits` table in the Room | Not built | Phase 2; the Room keeps only current state |
| Room writes to MongoDB | Room calls internal API routes | MongoDB cannot be reached from the Worker on the free plan |
| Separate `shares` data | Share settings inside the board document | One read gives the board and its share state |
| Frames, comments, `boardMembers` | Not built | Phase 2 |

**Known limits**

- Stacking order (which object is on top) is not synced between people.
- Every guest is shown as "Guest".
- Creating a sticky note and typing its text are two undo steps.
- No password reset, email check, or login attempt limit.
- Sessions cannot be cancelled from the server; they end after 30 days.
- Share rights are checked only when someone joins; turning sharing off does not disconnect people already in.
- Connector anchors ignore rotation.
- Cloudflare free tier allows about 100,000 requests and 100,000 SQLite row writes per day, and incoming WebSocket messages count 20 to 1, so heavy use by many people can reach the limit. Atlas M0 holds 512 MB.
- Vercel Hobby is for non-commercial use.

**Verified and not yet verified**

| Part | Status |
| --- | --- |
| Unit and API tests (27) | Run and passing |
| Drawing, selecting, connectors, undo, save and reload | Checked in a real browser |
| Realtime on the real Workers runtime, two browser windows, cursors, avatars, share link, view-only | Checked locally, and confirmed by the developer with screenshots |
| Fallback when realtime is unreachable | Checked in a browser |
| MongoDB Atlas store | Written to the same interface as the tested stores, not yet run against a real Atlas cluster |
| Vercel production deployment | Not yet done |
| Cloudflare production deployment | Not yet done |

The three unchecked rows are the first things to test after following `DEPLOY.md`.

## Appendix: Update for Stages 6–11

This appendix lists the code added after the main document. All paths are inside `web/` unless they start with `realtime/`.

### A. New and changed files

| File | What it does |
| --- | --- |
| `src/types.ts` | Added `ImageObj`, `FrameObj`, `CommentObj`, `CommentMessage`, `VoteObj`, `TimerObj`, `ReactionObj`, `SettingsObj`; sticky got optional `by` |
| `src/kinds.ts` | `isOverlay()` (comment, vote, timer, reaction, settings), `isTransient()`, `withLiveParts()` |
| `src/extras.ts` | Timer maths (`timerLeft`, `startTimer`, `pauseTimer`, `resetTimer`), votes (`votesOn`, `myVotes`, `newVote`, `MAX_VOTES`), reactions, private mode (`isPrivate`, `togglePrivate`, `isHiddenFrom`), `voterId()` |
| `src/comments.ts` | Message limits (`MAX_COMMENT_CHARS` 500, `MAX_THREAD` 50), `newMessage()` |
| `src/image.ts` | Shrinks and stores pictures (`fileToImage`, `placeImages`, `MAX_IMAGE_CHARS` 150,000) |
| `src/exportPng.ts` | `registerStage()` and `exportPng()` |
| `src/geometry.ts` | Added `fitInside`, `contentBounds`, `sortedFrames`, `frameFit`, `insideFrame` |
| `src/store.ts` | Added `present`, `commentId`; actions `startPresent`, `stepPresent`, `stopPresent`, `setCommentId`, `restoreObjects`, `liveEdit`, `castVotes`, `withdrawVotes`, `addChildNode`, `addSiblingNode`; a board that was never moved opens fitted |
| `src/templates.ts` | 9 templates (5 new) |
| `src/repo.ts`, `src/persist.ts`, `src/api.ts` | Version history for guest and signed-in boards |
| `src/useShortcuts.ts` | Keys F, C, Tab, Enter, paste of pictures, presentation keys |
| `src/components/Presenter.tsx` | Presentation overlay and bar |
| `src/components/CommentLayer.tsx` | Comment pins and threads |
| `src/components/HistoryPanel.tsx` | Version list, save and restore |
| `src/components/Extras.tsx` | `VoteLayer`, `ReactionLayer`, `ExtrasBar`, `TimerBar`, `VoteButtons` |
| `src/components/Canvas.tsx`, `ObjectNode.tsx`, `Toolbar.tsx`, `TopBar.tsx`, `PropertiesPanel.tsx`, `BoardThumb.tsx`, `TextEditor.tsx`, `EmptyHint.tsx`, `App.tsx` | Frame and comment tools, frame drag, private-mode masking, new buttons, overlay handling |
| `api/_lib/versions.ts` | `addVersion()`, `MAX_VERSIONS` 5, `MAX_VERSION_BYTES` 8,000,000 |
| `api/_lib/types.ts`, `store.ts`, `mongo-store.ts`, `core.ts` | `VersionRec`, `getVersions`/`setVersions` (memory, file and MongoDB), three version routes, 12-type list |
| `realtime/src/validate.ts`, `protocol.ts` | 12-type list; image limit 200,000 characters |

### B. Store rules worth knowing

- `addChildNode(parentId, voter)` puts a 180 × 110 note 100 px right of the parent, under earlier children, and links it with a connector. `addSiblingNode(id, voter)` finds the parent through the connector that ends at the note and adds a child there; with no parent it returns null.
- `castVotes(ids, voter)` adds one vote per selected object until the person has 5 in total; connectors, frames and overlay objects cannot be voted on. `withdrawVotes` removes one of the person's votes from each selected object.
- `restoreObjects(objects)` is a normal undoable edit that keeps the current timer and reactions.
- `removeSelected` also removes connectors and votes that pointed at a removed object.
- Viewers are blocked by `canEditNow` in every action above.

### C. Tests

`npm test` runs **57** tests (all pass). The 30 added after the first version of this document are in `api/_tests/api.test.ts` (1: picture round trip), `api/_tests/versions.test.ts` (5), `src/pictures.test.ts` (4), `src/frames.test.ts` (4), `src/comments.test.ts` (4), `src/extras.test.ts` (7) and `src/mindmap.test.ts` (5). `mindmap.test.ts` gives Node a small pretend browser (`window`, `localStorage`) so the store and the templates can be loaded.

Browser scripts in `web/e2e/` (run `npm run dev` first, then `NODE_PATH=$(npm root -g) node e2e/<name>.cjs`): `e2e-images.cjs` (pictures and PNG), `e2e-frames.cjs` (20 checks), `e2e-comments.cjs` (11), `e2e-history.cjs` (19, guest and signed-in), `e2e-extras.cjs` (21), `e2e-stage11.cjs` (13), plus `e2e-solo.cjs` and `e2e-rt.cjs` from before (`e2e-rt.cjs` needs the Worker running).

### D. Checklist: adding a new object type

1. Add the interface and put it in `BoardObject` in `src/types.ts`.
2. Add the type name in the three lists: `ObjType` in both copies of `protocol.ts` (`web/src/realtime/` and `realtime/src/`), `TYPES` in `realtime/src/validate.ts`, and the zod list in `api/_lib/core.ts`.
3. If it has no size or is drawn as HTML, add it to `OVERLAY` in `src/kinds.ts` (and to `Overlay`); if it belongs to the present moment rather than the drawing, also to `isTransient`.
4. Draw it: `ObjectNode.tsx` for canvas objects, or a layer component for overlays; handle it in `BoardThumb.tsx` and `TextEditor.tsx`.
5. Decide what select, copy, delete and export should do with it (`Canvas.tsx`, `store.ts`, `geometry.ts`).
6. If the object can be large, check the per-object limit in `realtime/src/validate.ts`.
7. Add unit tests and, if it has screens, a browser script; run `npm test`, `npx tsc -b` and `npm run build`; redeploy the Worker.
