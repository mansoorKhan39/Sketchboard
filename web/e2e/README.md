# Browser checks (Playwright)

These scripts drive a real Chromium browser against `npm run dev` (http://localhost:5173).
Playwright is not part of the project's dependencies. Install it once, outside the project:

    npm install -g playwright && npx playwright install chromium

Run (start `npm run dev` first; delete `web/.data` before each run to start clean):

    NODE_PATH=$(npm root -g) node e2e/e2e-images.cjs     # pictures + Export PNG (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-frames.cjs      # frames, moving contents, presentation mode (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-comments.cjs    # comment pins, replies, resolve, delete (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-history.cjs     # version history: save, restore, undo, limit of 5 (guest + signed-in)
    NODE_PATH=$(npm root -g) node e2e/e2e-extras.cjs      # timer, voting, emoji reactions (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-stage11.cjs     # templates, mind map keys (Tab/Enter), private mode (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-solo.cjs       # live editing unreachable: falls back to normal saving

Each line printed starts with PASS or FAIL. `e2e-solo` and `e2e-rt` expect the account alice@example.com to exist
(e2e-rt creates it).

## e2e-stage13.cjs
Look and feel (Stage 13): landing page, sign-in card (inline messages, show/hide password), floating bar above the selection, text sizes S/M/L/XL with undo, and a narrow window (Export PNG on one line, "Private" clear of the zoom bar). Needs `npm run dev`.

## Stage 15 (moving around the board)
    NODE_PATH=$(npm root -g) node e2e/e2e-nav.cjs        # wheel, trackpad, middle mouse, Hand tool, arrows, zoom keys/menu, minimap, edge scroll, pinch

## Stage 16 (accounts)
    npm run dev > /tmp/dev.log 2>&1 &                    # the script reads the printed reset e-mail from this file
    NODE_PATH=$(npm root -g) node e2e/e2e-account.cjs    # profile, change/forgot/reset password, delete account, Google button wiring

## Stage 17 (editing tools)
    NODE_PATH=$(npm root -g) node e2e/e2e-edit.cjs       # snapping + guides, grid, align/spread, group, lock, layer order, new shapes, arrow styles (guest mode)

## Stage 18 (tables and text formatting)
    NODE_PATH=$(npm root -g) node e2e/e2e-text.cjs       # table tool, typing in cells (Tab/Enter), rows/columns/header, bold/italic/underline/bullets/align/size, links (guest mode)

## Stage 19 (board management)
    # start the dev server with any Ably key so the Share panel works:  ABLY_API_KEY=app.key:secret npm run dev   (Windows cmd: set ABLY_API_KEY=app.key:secret && npm run dev)
    NODE_PATH=$(npm root -g) node e2e/e2e-manage.cjs     # favourites, folders, search, trash/restore, export PDF/SVG/PNG/JSON, import, embed

### e2e-collab.cjs (Stage 20a)
Two users (alice, and bob who is registered by the script). Checks invite, Shared with me, view-only, 403 on save, mention, bell, leave. Start `npm run dev` without ABLY_API_KEY, register alice first.
