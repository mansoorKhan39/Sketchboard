# Sketchboard — Stage 5 (live collaboration)

A Miro-style whiteboard. Works fully in the browser (no login, no server yet). Boards are saved automatically in the browser (localStorage).

## New in this stage
Live collaboration: several people on one board at the same time. Share button (owner): turn a link on, choose
"Can view" or "Can edit", copy it. Visitors need no account. You see each other's changes instantly, live cursors
and avatars, and viewers cannot edit (enforced by the server, not only hidden in the UI). Undo only reverts your own
last action. If the connection drops, your changes are kept and sent again after reconnecting.
If the realtime service is not running, boards simply work alone like before.

## Run
```bash
cd web
npm install
npm run dev        # website AND api on one port. No database needed: data goes to web/.data/db.json
npm test           # 27 tests: API, share links, edit operations
npm run typecheck  # website + api
npm run build      # type-check + production build
```
Needs Node 20+.

## What works
Infinite canvas (wheel = zoom, hold Space + drag = pan), sticky notes, shapes (rect/ellipse/diamond),
pen, text, connectors (L tool: drag from one object to another; straight/elbow, arrow on/off),
marquee selection (drag on empty space), moving several objects together, select / move / resize / rotate, colours, duplicate, delete, copy/paste, undo/redo, fit to content.

## Shortcuts
V select · N sticky · S shape · P pen · T text · L connector · Space+drag pan · wheel zoom · Shift+1 fit ·
Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo · Ctrl/Cmd+C/V/D copy/paste/duplicate · Delete remove · Double-click = edit text

Live collaboration locally (needs a second terminal):
```bash
cd realtime
npm install
cp .dev.vars.example .dev.vars     # the secret; the website uses the same default in development
npm run dev                        # Cloudflare Worker on http://localhost:8787
```
Then use two different browsers (or one normal + one private window): sign in, open a board, press Share, open the link in the other.

Going online: see `DEPLOY.md` (Atlas + Vercel + Cloudflare, free, no card).

## Realtime service (realtime/)
- `src/index.ts` — front door: checks the join token, passes the connection to the board's room
- `src/room.ts` — the room (one Durable Object per board): keeps the board in memory + SQLite, puts edits in one order, sends ack/edits/presence/cursors, rate limits, saves to the database via the API every few seconds
- `src/validate.ts`, `token.ts`, `protocol.ts` — input checks, token check, message types
- Browser side: `web/src/realtime/` (`connection.ts`, `ops.ts`, `protocol.ts`)

## API (web/api/)
- `_lib/core.ts` — all routes: `/auth/register|login|logout|me`, `/boards` (list, create), `/boards/:id` (get, PUT save, PATCH rename, DELETE), `/boards/:id/duplicate`
- `_lib/security.ts` — password hashing (scrypt) and signed session token
- `_lib/store.ts` / `mongo-store.ts` — the database behind one small interface (memory, JSON file, MongoDB)
- `_lib/node-adapter.ts` — plugs the API into `npm run dev`; `v1/[...path].ts` — the Vercel entry
- `_tests/api.test.ts` — tests

## Files (src/)
- types.ts — object model (sticky, shape, stroke, text)
- store.ts — Zustand store: objects, selection, tool, viewport, undo/redo
- components/Canvas.tsx — Konva stage, pan/zoom, creating objects, resize handles
- components/ObjectNode.tsx — how each object type is drawn
- components/TextEditor.tsx — textarea placed over the object being edited
- components/Toolbar.tsx, PropertiesPanel.tsx, BottomBars.tsx — UI
- geometry.ts — where a connector line starts/ends
- persist.ts — boards list + per-board save/load in localStorage
- api.ts, auth.ts, repo.ts — server calls, who is signed in, and "local vs cloud" board storage
- components/AuthScreen.tsx, AccountMenu.tsx — sign in / sign up, account menu
- realtime/ — connection to the room, and turning changes into small operations (and back)
- components/ShareDialog.tsx, PeerCursors.tsx — share panel, other people's cursors
- ui.ts — theme and which screen is open (from the address bar)
- templates.ts — Brainstorm, Kanban, Flowchart
- components/Dashboard.tsx, BoardThumb.tsx, TopBar.tsx, EmptyHint.tsx, ThemeToggle.tsx, Logo.tsx
- components/ConnectorNode.tsx — draws a connector
- useShortcuts.ts — keyboard shortcuts

## Known limits (planned for later stages)
Changing stacking order (bring to front) is not synced. Share rights are checked when someone joins, so changing a link
only affects people who open it afterwards. Guests are all called "Guest". No comments, no board members list, no
password reset. The MongoDB code and the Vercel entry file could not be run against a real Atlas/Vercel here; the
Cloudflare room was tested with the real Workers runtime (workerd) locally, but not on Cloudflare's network.
