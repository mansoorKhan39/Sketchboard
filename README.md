# Sketchboard — Stage 5 (live collaboration)

A Miro-style whiteboard. Works fully in the browser (no login, no server yet). Boards are saved automatically in the browser (localStorage).

## New in this stage
Live collaboration: several people on one board at the same time. Share button (owner): turn a link on, choose
"Can view" or "Can edit", copy it. Visitors need no account. You see each other's changes instantly, live cursors
and avatars, and viewers cannot edit (enforced by the server, not only hidden in the UI). Undo only reverts your own
last action. If the connection drops, your changes are kept and sent again after reconnecting.
If live collaboration is not set up (no `ABLY_API_KEY`), boards simply work alone like before.

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

## Accounts
- Sign in with **email and password** or **Google** (`POST /auth/google`: the server checks Google's signature, issuer and that the token was made for our client id; an existing account with the same verified e-mail is linked). A Google-only account has no password until it adds one.
- **Forgot password**: `POST /auth/forgot` always answers the same (no way to find out who has an account), mails a one-time link (only its hash is stored, 30 minutes, one mail a minute); `POST /auth/reset` sets the password and signs the person in.
- **Profile page** (`#/profile`): change name, change or add a password, see how you sign in, delete the account (type your e-mail; removes your boards too).
- Code: `web/api/_lib/core.ts` (routes), `google.ts` (token check), `mail.ts` (Brevo / terminal), `web/src/components/` `GoogleButton`, `ForgotScreen`, `ResetScreen`, `ProfileScreen`, `AuthShell`, `Avatar`. Development: reset e-mails are printed in the terminal, and the Google button appears when `GOOGLE_CLIENT_ID` is set in `web/.env`.

## Moving around the board
- **Mouse wheel** zooms about the pointer (smoothly); **trackpad** two-finger swipe scrolls; **pinch** (trackpad or touch screen) zooms. Shift + wheel slides sideways. In the zoom menu, "Mouse wheel: Scrolls" makes a plain wheel scroll instead (Figma style).
- **Pan**: hold Space and drag, press **H** (Hand tool) and drag, drag with the **middle mouse button**, or one finger on an empty spot on a touch screen. Dragging a selection box or connector to the edge of the screen slides the board.
- **Keys**: Ctrl/Cmd + `+` / `-` zoom, Ctrl/Cmd + `0` = 100%, Shift+1 fit everything, Shift+2 zoom to selection. Arrow keys nudge the selected objects (Shift = 10 units); with nothing selected they move the view.
- **Zoom menu** (click the %): presets, fit, selection, wheel behaviour, minimap on/off. The **minimap** (bottom right, wide windows) shows the whole board; click or drag on it to jump.
- Code: `web/src/viewport.ts` (all the maths, tested), `navigation.ts` (smooth gliding), `components/Canvas.tsx` (pointer, wheel and touch handling), `components/Minimap.tsx`, `components/BottomBars.tsx` (zoom menu).

## Shortcuts
V select · H hand · N sticky · S shape · P pen · T text · L connector · Space+drag pan · wheel zoom · Shift+1 fit ·
Ctrl/Cmd+Z undo · Ctrl/Cmd+Shift+Z redo · Ctrl/Cmd+C/V/D copy/paste/duplicate · Delete remove · Double-click = edit text

Live collaboration locally: make a free account at ably.com, copy an API key, and put it in `web/.env`:
```
ABLY_API_KEY=appId.keyId:secret
```
Then `npm run dev` as usual. Use two different browsers (or one normal + one private window): sign in, open a board, press Share, open the link in the other. Without the key everything else still works.

Going online: see `DEPLOY.md` (Atlas + Vercel + Ably, free, no card).

## Live collaboration (Ably)
- Server (`web/api/_lib/`): `security.ts` signs a one-hour Ably pass per person (`createAblyToken`) that allows only that board's two channels; a viewer's pass cannot publish edits. `core.ts` hands it out at `POST /boards/:id/join` and `POST /share/:token/join`, and serves `GET|PUT /share/:token/state` so guests can load and save the board.
- Browser (`web/src/realtime/`): `connection.ts` joins the channels `board:<id>` (edits) and `cur:<id>` (pointers and who is here), loads the board from the server, applies edits from others, and keeps unconfirmed edits until they are sent. `chunks.ts` cuts big edits (pictures) into pieces under Ably's 64 KB message limit. `ops.ts` turns changes into small operations and back; `validate.ts` checks every edit that arrives.
- Saving: whoever edits saves the whole board to the server a moment after their own change (`flushSave` in `store.ts`). Changes that came from other people are saved by those people.

## API (web/api/)
- `_lib/core.ts` — all routes: `/auth/register|login|logout|me`, `/boards` (list, create), `/boards/:id` (get, PUT save, PATCH rename, DELETE), `/boards/:id/duplicate`
- `_lib/security.ts` — password hashing (scrypt) and signed session token
- `_lib/store.ts` / `mongo-store.ts` — the database behind one small interface (memory, JSON file, MongoDB)
- `_lib/node-adapter.ts` — plugs the API into `npm run dev`; `v1.ts` — the Vercel entry
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
- realtime/ — Ably connection, big-message pieces, and turning changes into small operations (and back)
- components/ShareDialog.tsx, PeerCursors.tsx — share panel, other people's cursors
- ui.ts — theme and which screen is open (from the address bar)
- templates.ts — Brainstorm, Kanban, Flowchart
- components/Dashboard.tsx, BoardThumb.tsx, TopBar.tsx, EmptyHint.tsx, ThemeToggle.tsx, Logo.tsx
- components/ConnectorNode.tsx — draws a connector
- useShortcuts.ts — keyboard shortcuts

## Known limits (planned for later stages)
Changing stacking order (bring to front) is not synced. Share rights are checked when someone joins, so changing a link
only affects people who open it afterwards. Guests are all called "Guest". No comments, no board members list, no
password reset. The live connection code was tested against a fake Ably (65 unit tests in all), not against the real Ably network. Edits
from two people at once are merged field by field (last one wins for the same field), and the stacking order of objects
can differ slightly between screens because there is no single server putting edits in one order.

## Editing tools (Stage 17)
- **Smart guides:** dragging snaps to the edges and middles of other objects (red dashed lines show what lines up). Hold **Alt** to move freely. "Snap to other objects" and "Snap to grid" are in the zoom menu (the % button).
- **Arrange menu** (on the bar above a selection): layer order (to front / forward / backward / to back), align (left, centre, right, top, middle, bottom), spread out (3+ objects), group, lock.
- **Shortcuts:** Ctrl+G group, Ctrl+Shift+G ungroup, Ctrl+Shift+L lock/unlock, Ctrl+] / Ctrl+[ forward / backward (add Shift for front / back).
- **Layers sync** because each object has an optional `z` number (higher = drawn on top); `locked` and `group` are also plain fields, so other people see them at once.
- **Shapes:** rectangle, ellipse, diamond, triangle, hexagon, star, block arrow, speech bubble, cloud, cylinder. **Connectors:** solid / dashed / dotted, arrow at either end or both.
