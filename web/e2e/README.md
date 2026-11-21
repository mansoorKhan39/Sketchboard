# Browser checks (Playwright)

These scripts drive a real Chromium browser against `npm run dev` (http://localhost:5173).
Playwright is not part of the project's dependencies. Install it once, outside the project:

    npm install -g playwright && npx playwright install chromium

Run (start `npm run dev` first; delete `web/.data` before each run to start clean):

    NODE_PATH=$(npm root -g) node e2e/e2e-images.cjs     # pictures + Export PNG (guest mode, no Worker needed)
    NODE_PATH=$(npm root -g) node e2e/e2e-frames.cjs      # frames, moving contents, presentation mode (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-comments.cjs    # comment pins, replies, resolve, delete (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-history.cjs     # version history: save, restore, undo, limit of 5 (guest + signed-in)
    NODE_PATH=$(npm root -g) node e2e/e2e-extras.cjs      # timer, voting, emoji reactions (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-stage11.cjs     # templates, mind map keys (Tab/Enter), private mode (guest mode)
    NODE_PATH=$(npm root -g) node e2e/e2e-solo.cjs       # live editing unreachable: falls back to normal saving
    NODE_PATH=$(npm root -g) node e2e/e2e-rt.cjs         # two windows, share link, viewer rules (needs `wrangler dev` in realtime/)

Each line printed starts with PASS or FAIL. `e2e-solo` and `e2e-rt` expect the account alice@example.com to exist
(e2e-rt creates it).

## e2e-stage13.cjs
Look and feel (Stage 13): landing page, sign-in card (inline messages, show/hide password), floating bar above the selection, text sizes S/M/L/XL with undo, and a narrow window (Export PNG on one line, "Private" clear of the zoom bar). Needs `npm run dev`.
