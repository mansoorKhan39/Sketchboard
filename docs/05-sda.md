# Sketchboard — Software Design and Architecture (SDA)

Nov 14, 2026 · @Mansoor

## 1. Introduction and design goals

This document says how Sketchboard is built to meet the SRS: which parts exist, how they talk to each other, where data lives, and why each choice was made. The Database Design, API Documentation and UI/UX documents add detail to the parts named here.

The design is driven by five goals. Each one comes from a requirement in the SRS.

| Goal | From SRS | Design response |
| --- | --- | --- |
| Edits appear for others almost at once | NFR-1, FR-R1 | Direct WebSocket link to one live room per board |
| Everyone sees the same board, even with simultaneous edits | NFR-6, FR-R4 | The room puts every edit in one order, so all users end with the same state |
| Nothing is lost on reload, restart or reconnect | NFR-5, FR-B4, FR-R5 | Live state stored by the room; clients resend what was not confirmed |
| Only allowed people can read or change a board | NFR-9, FR-S4 | Server checks on every request and every edit, using a signed join token |
| The whole system costs nothing | NFR-16 | Only free plans with no credit card; the realtime part can be moved to another host |

## 2. Architecture overview

&#91;embedded content: architecture overview · 4 parts, 2 paths from the browser\]

The browser reaches the system by two paths. The REST API on Vercel handles accounts, board lists, sharing and the signed join token, and is the only part that talks to MongoDB Atlas. The live board runs through a Cloudflare Worker into one board room per board, which orders edits and keeps the live state. The browser gets the join token from the REST API and shows it to the Worker; the Worker only checks that the token is valid, so the room never needs to call the REST API to decide who may join. The room sends board snapshots back to the REST API for storage.

The client and the REST API form one codebase (a modular monolith). The board room is a second, small deployable. There are no further services.

## 3. Key design decisions

Each decision lists what else could have been chosen, so the reasons can be explained in a viva or interview. D2 and D3 are still marked in the SRS as open items for the author to confirm.

| ID | Decision | Chosen | Alternatives | Why |
| --- | --- | --- | --- | --- |
| D1 | Overall style | Modular monolith (client and REST API) plus one small realtime service | Microservices | One or two developers cannot carry the deployment and network work of many services; modules in one codebase are enough |
| D2 | Backend language | TypeScript | FastAPI (Python) | Shape, board and message types are shared between client, API and room, so no type is written twice |
| D3 | Realtime host | Cloudflare Workers with Durable Objects | Socket.io on a free container host; managed realtime such as Ably | Free plan without a credit card, and one Durable Object per board matches "one room per board"; Vercel cannot hold WebSockets |
| D4 | Sync model | The room puts edits in one order and applies them; the last edit to a field wins | CRDT library such as Yjs; operational transform | A Durable Object runs one board at a time, so it gives one order for free, which is simpler to build and explain. A CRDT can be added later for rich text in sticky notes |
| D5 | Canvas library | Konva with react-konva | Fabric.js; tldraw; raw HTML canvas | Konva has shapes, drag, transform handles and layers ready, and fits React; raw canvas means building all of that by hand |
| D6 | Client state | Zustand | Redux | Small API and little code for one store of board objects |
| D7 | Where board content lives | In the board room's own storage; snapshots copied to MongoDB | Everything in MongoDB | Reads and writes while editing stay inside one place with no database call per edit; MongoDB holds users, board list and snapshots |
| D8 | Login and room access | Hashed passwords; session token for the REST API; short-lived signed join token for a board room | Third-party login such as Google | No extra service needed; the join token lets the room trust who may join without calling the API |

Updated for Stages 6–11. These decisions were added when pictures, frames, comments, versions, votes, timer, reactions, mind map and private mode were built.

| ID | Decision | Chosen | Alternatives | Why |
| --- | --- | --- | --- | --- |
| D9 | Where pictures are stored | Inside the board, as a compressed data URL in the image object (`src`) | A file store such as an object bucket | Free hosting here has no file storage. A picture inside the board syncs, saves, exports and restores like any other object. The browser shrinks it first (stored text at most 150,000 characters; the room accepts up to 200,000) |
| D10 | How votes are counted | One small vote object per vote (`targetId`, `voter`) | A counter field on the voted object | Two people voting at the same moment would overwrite each other in a counter, because the last edit to a field wins (D4). Separate objects never collide. The badge number is the count of vote objects for that target |
| D11 | How a version is restored | As a normal edit: the old objects are put on the board with the usual history step (`restoreObjects`) | A special server command that swaps the whole board | A normal edit reaches everyone live through the same path as any other edit, and Ctrl+Z brings the current board back. No new message type is needed. A "Before restore" copy is saved first |
| D12 | Where versions are stored | Their own `versions` collection, one document per board | Inside the board record | Versions can be large (up to 8,000,000 characters per board) and are read rarely. Keeping them apart keeps the board list and board saves small, and stays under the MongoDB 16 MB document limit |
| D13 | Private mode | Display only: a settings object makes other people's sticky notes show "• • •" | Server-side hiding of the text | Hiding on the server would need the room to filter every message per user. The simple version only changes what is drawn. The hidden text still reaches every browser, so it is not a security feature |
| D14 | Comments, votes, timer and reactions | Board objects drawn as HTML layers over the Konva canvas ("overlay objects") | Drawing them inside Konva; a separate sync channel | They sync with the existing edit path, and HTML gives sharp text, inputs and a pin size that stays the same at any zoom |
| D15 | Timer and reactions in undo | Kept out of undo, redo and restore ("live parts") | Treat them like drawing objects | They belong to the present moment. Undo must not stop a running timer or bring back an old reaction |

## 4. Component design

The repository keeps the three deployable parts separate and puts shared types in one package. The SCD will show the real folders.

### 4.1 Client modules

| Module | Responsibility | SRS |
| --- | --- | --- |
| Screens | Landing, sign up, log in, dashboard, board page | FR-A, FR-B |
| Canvas | Konva stage, zoom, pan, grid, drawing and selection | FR-C, FR-T |
| Tools | One handler per tool: sticky note, shape, pen, text, connector, frame, comment | FR-T1 to FR-T6 |
| Board store | All objects of the open board, current selection, tool, viewport, presentation state (present) and the open comment | FR-T, FR-C |
| History | Per-user undo and redo of own edits (the timer and reactions are left out, see 4.4) | FR-T11 |
| Sync client | Opens the WebSocket, sends edits, applies edits from others, reconnects | FR-R |
| Presence | Live cursors and the list of people on the board | FR-R2, FR-R3 |
| API client | Typed calls to the REST API | FR-A, FR-B, FR-S |

### 4.2 REST API modules

| Module | Responsibility | SRS |
| --- | --- | --- |
| Auth | Sign up, log in, log out, password hashing, session check | FR-A1 to FR-A3 |
| Boards | Create, list, rename, delete; owner checks | FR-B |
| Sharing | Create and turn off share links, set view or edit | FR-S |
| Join token | Issues the signed token that lets a user into a board room with a role | FR-S4 |
| Snapshots | Receives snapshots from the room and stores them | FR-B4, FR-P3 |
| Shared types | Request, response and message types used by all parts | NFR-15 |

### 4.3 Realtime service parts

| Part | Responsibility | SRS |
| --- | --- | --- |
| Worker | Accepts the WebSocket request, checks the join token, passes the connection to the right board room | NFR-9 |
| Board room | Keeps the board state, gives each edit its order number, rejects edits from viewers, sends edits to everyone | FR-R, FR-S4 |
| Room storage | Saves the board state so a restart loses nothing | NFR-5 |
| Presence relay | Passes cursor positions between users without storing them | FR-R2 |

### 4.4 Modules added in Stages 6–11

Updated for Stages 6–11. The board now has 12 object types: sticky, shape, stroke, text, image, frame, comment, vote, timer, reaction, settings and connector. Five of them (comment, vote, timer, reaction, settings) are overlay objects. An overlay object is a normal board object that syncs, saves and is validated like the others, but it has width and height 0 and is not drawn on the Konva canvas. `isOverlay()` in `kinds.ts` is the one place that names them. Overlay objects are skipped by the selection box, copy, paste and duplicate, Export PNG, Fit, dashboard thumbnails, and they do not count as board content (the empty-board hint and "This board is empty" ignore them).

Comment pins, vote badges, floating reactions and the timer are HTML layers placed over the Konva canvas, so they keep a constant size at any zoom. The settings object has no visible part; it only holds the private-mode switch.

| Module (file) | Responsibility |
| --- | --- |
| Object kinds (`kinds.ts`) | `isOverlay`, `isTransient` and `withLiveParts`. The "live parts" are the timer and reactions |
| Extras (`extras.ts`, `components/Extras.tsx`) | Vote and timer helpers, limits (`MAX_VOTES` 5, `REACTION_LIFE` 3.5 s). Components VoteLayer, ReactionLayer, ExtrasBar, TimerBar, VoteButtons |
| Comments (`comments.ts`, `components/CommentLayer.tsx`) | Pins and threads as HTML over the canvas. Limits `MAX_COMMENT_CHARS` 500, `MAX_THREAD` 50 |
| Pictures and export (`image.ts`, `exportPng.ts`) | Shrinks pictures before storing; draws all content to a PNG at 1:1 on the page colour |
| Presenter (`components/Presenter.tsx`) | Presentation mode: bottom bar, keys, gliding view. Uses `sortedFrames`, `frameFit` and `insideFrame` from `geometry.ts` |
| History panel (`components/HistoryPanel.tsx`) | Owner-only list of saved versions, save and restore, through the Repo |
| Templates (`templates.ts`) | 9 starting boards, including Mind map, SWOT analysis, Retrospective, Weekly planner and Presentation |
| Repo (`repo.ts`) | Now also `listVersions`, `saveVersion` and `getVersion` (see 6.4) |
| Server versions (`api/_lib/versions.ts`) | `addVersion` keeps the newest 5 versions and the size cap. `VersionRec` is in `api/_lib/types.ts` |

The board store gained these state fields and actions:

| Name | Meaning |
| --- | --- |
| `present` | Presentation state `{index, back}`: the frame shown and the view to return to. Empty when not presenting |
| `commentId` | The comment whose thread is open (`setCommentId`) |
| `startPresent`, `stepPresent`, `stopPresent` | Enter, move through and leave presentation mode. Editing is blocked and toolbars are hidden while it runs; viewers can present |
| `restoreObjects` | Restore a version as a normal undoable edit (see 5.3) |
| `liveEdit` | A change that is not part of undo history; used by the timer and reactions |
| `castVotes`, `withdrawVotes` | Add or remove the current person's votes, up to 5 per person |
| `addChildNode`, `addSiblingNode` | Mind map: Tab adds a linked child note, Enter adds a sibling. Each is one undo step |
| `fitToContent` | Opens a never-moved board fitted to its content |

## 5. Realtime sync design

&#91;embedded content: one edit from Client A to Client B · 5 steps\]

The board room is the single place where edits are put in order. Because it handles one board at a time, every user ends with the same board, even when two people change the same object together: the edit that reaches the room last wins for the fields it touches. A change to an object that was already deleted is ignored.

### 5.1 Messages

All messages are typed JSON and are defined once in the shared types package.

| Message | Direction | Content | Purpose |
| --- | --- | --- | --- |
| hello | Client to room | Join token, last order number the client has | Join the room and catch up |
| welcome | Room to client | Role, board state or the edits the client missed | Start the session |
| edit | Client to room | Unique edit id, add, change or delete of one object | Send a change |
| edit | Room to clients | The same edit plus its order number | Apply a change in the same order everywhere |
| ack | Room to sender | Edit id, order number | Confirm the edit was accepted |
| reject | Room to sender | Edit id, reason | Tell a viewer or a bad edit that it was refused |
| cursor | Both ways | User, position on the canvas | Show live cursors; never stored |
| presence | Room to clients | List of people on the board | Show who is online |

### 5.2 Rules

- **Own view first.** The client draws its own edit immediately and marks it unconfirmed until the ack arrives, so drawing never waits for the network.
- **Roles on the server.** The room checks the role from the join token on every edit; a viewer's edit gets a reject (FR-S4).
- **Undo is an edit.** Undo and redo create new edits that reverse the user's own earlier edits, so they are ordered like any other edit.
- **Reconnect.** The client keeps unconfirmed edits. After a drop it sends hello with its last order number, receives the edits it missed (or the full state if it is far behind), then resends unconfirmed edits. Edit ids are unique, so a repeated edit is applied only once.
- **Free-plan limit.** Pen strokes are sent in small batches, not point by point, to stay inside the free daily request limit described in the Feasibility Study.

### 5.3 Rules added in Stages 6–11

Updated for Stages 6–11. The message types in 5.1 did not change. The new object types travel inside the same add, change and delete edits.

- **Live parts are not in undo.** The timer and reactions change through `liveEdit`. Undo, redo and restore call `withLiveParts(older, current)`, which keeps the current timer and reactions and takes everything else from the older copy. Undo never stops a running timer.
- **Restore is a normal edit.** `restoreObjects` puts the old objects on the board with `withHistory`, so the edit goes through the sync client like any other. Everyone live sees the restored board, and Ctrl+Z brings the previous board back. Before this, the History panel saves a "Before restore" copy.
- **Votes are separate objects.** Casting a vote adds a vote object; withdrawing removes one. Deleting an object also deletes its votes. Because each vote is its own object, simultaneous votes do not overwrite each other.
- **Reactions and the timer are objects too.** A reaction floats for 3.5 s; the sender removes it after about 4 s, and anyone's next reaction sweeps ones older than about 10.5 s. The timer stores a clock time (`endsAt`), so all screens agree up to small clock differences between computers.
- **Limits in the room.** One object may hold at most 64,000 characters; an image object may hold 200,000 (`MAX_IMAGE_BYTES`). A board still holds at most 5,000 objects. The browser keeps a picture's stored text to 150,000 characters or less, so it stays under the room limit.
- **Known limits.** Two people replying to the same comment pin at the same moment: the last write wins, because the thread is one field. A reaction stays on the board if its sender closes the tab, until a later sweep.

## 6. Data placement and security design

### 6.1 Where each kind of data lives

Tables and fields are defined in the Database Design document; this table only says which store owns what.

| Data | Store | Why there |
| --- | --- | --- |
| Users (email, display name, password hash) | MongoDB Atlas | Needed by the REST API only |
| Board list and settings (name, owner, share link, link right) | MongoDB Atlas | Listed and edited through the REST API |
| Live board content (all objects and their order numbers) | Board room storage on Cloudflare | Read and written on every edit with no database call |
| Board snapshots | MongoDB Atlas | Backup of the board (version history is kept separately, see 6.4) |
| Cursors and who is online | Memory of the board room only | Short-lived; never stored |
| Session and join tokens | Held by the client | Signed, so the server stores nothing |

### 6.2 Login and access flow

1. The user logs in; the REST API checks the password hash and returns a session token (an HTTP-only cookie).
2. To open a board, the client asks the REST API for a join token. The API checks the user's role or the share link and returns a short-lived signed token that holds the board id and the role.
3. The client opens the WebSocket and sends the token. The Worker checks the signature and expiry, then connects the user to that board's room.
4. The room reads the role from the token on every edit (see the role matrix in the Use Case Document).

### 6.3 Security measures

| Threat | Measure |
| --- | --- |
| Stolen database | Passwords stored only as salted hashes (bcrypt or argon2) |
| Guessing a share link | Random token of at least 128 bits; the owner can turn the link off |
| Viewer sends edits by hand | Role is checked in the room, not only in the interface |
| Forged join token | Signed with a secret that only the REST API and the Worker know; tokens expire quickly |
| Script injection through text | Input validated by schema; text drawn as text, never as HTML |
| Eavesdropping | HTTPS and WSS only |
| Abuse of free limits | Limit message size and rate per connection in the room |

### 6.4 Versions, type lists and limits

Updated for Stages 6–11. This section covers data placement added by version history, and the rules that keep the three parts in step.

| Boards of | Where versions live | Details |
| --- | --- | --- |
| Signed-in users | MongoDB, in a separate `versions` collection | One document per board. Its `_id` is the board id; the field `versions` is a list of `{id, at, label, objects}`, oldest first. Newest 5 kept (`MAX_VERSIONS`); all versions of one board together stay under 8,000,000 characters (`MAX_VERSION_BYTES`), so big boards keep fewer than 5 and the newest always survives. Deleting a board deletes its versions. "Duplicate" does not copy them. The collection is created on the first save |
| Guests | The browser, in `localStorage` key `sketchboard.versions.v1.<boardId>` | If the browser is full, the oldest versions are dropped; an error shows if even one does not fit |

Only the board owner can list, save and restore versions; other people get 404 from the API. The server store interface gained `getVersions(boardId)` and `setVersions(boardId, list)` in all three stores (MemoryStore, FileStore, Mongo). The client Repo interface gained `listVersions`, `saveVersion` and `getVersion`; the local and cloud repos both implement them, so the History panel does not care which one it gets.

Three type lists must stay in sync. When a new object type is added, change all three:

1. The browser type `BoardObject` in `web/src/types.ts` (and `kinds.ts` if it is an overlay).
2. The room's `ObjType` and `TYPES` in `realtime/src/protocol.ts` and `realtime/src/validate.ts` (two identical copies).
3. The API zod enum for `type` in `web/api/_lib/core.ts`.

If the room list is not updated, live editing refuses the new type, so the Worker must be redeployed after such a change.

Private mode is display only. The hidden text of other people's sticky notes still reaches every browser; only what is drawn changes. Sticky notes without an author (`by` missing, for example from templates or old boards) stay visible.

## 7. Meeting the non-functional requirements, deployment and sources

### 7.1 How the design meets the NFRs

| NFR | Design tactic |
| --- | --- |
| NFR-1 Fast edits | Direct WebSocket; the room is a single stop; the client shows its own edit first |
| NFR-2 Smooth canvas | Konva layers; only visible objects are drawn; strokes simplified before sending |
| NFR-3 Fast board open | The room sends the whole state in one welcome message |
| NFR-4 About 10 editors | One room per board; small messages; batching of strokes |
| NFR-5 No data loss | Room storage plus snapshots in MongoDB; unconfirmed edits resent after reconnect |
| NFR-6 Consistent boards | One order of edits per board, decided in the room |
| NFR-7 to NFR-11 Security | Section 6.3 |
| NFR-15 Maintainability | One language, shared types package, strict TypeScript, linting |
| NFR-16 Cost | Free plans only; the realtime part is replaceable |

### 7.2 Deployment view

- The client and REST API are deployed together to Vercel from one GitHub repository.
- The board room is deployed to Cloudflare from the same repository with a separate command.
- MongoDB Atlas holds the database; its connection string and the token secret are kept as environment variables, never in the code.
- If the free Cloudflare plan becomes a problem, the Worker and room are replaced by a Socket.io server on another free host; only the Sync client and the room change, because the message types in section 5.1 stay the same. Steps are written in the Deployment document.

### Sources

- [Miro System Design Explained (Educative)](https://www.educative.io/blog/miro-system-design)
- [Design a Real-Time Collaborative Whiteboard (techinterview.org)](https://techinterview.org/system-design-collaborative-whiteboard/)
- [Cloudflare, Durable Objects pricing and limits](https://developers.cloudflare.com/durable-objects/platform/pricing)
- [Cloudflare, WebSocket Hibernation in Durable Objects](https://developers.cloudflare.com/durable-objects/index.md)

## Appendix: Update for Stages 6–11

The design below was added after the main document was written. Where it differs from the earlier text, this appendix is current.

### A. Twelve object types, three lists that must match

A board is still one flat list of objects. It now holds 12 types: sticky, shape, stroke, text, image, frame, comment, vote, timer, reaction, settings and connector. The type is checked in three places that must always agree: the browser type `BoardObject` (`web/src/types.ts`), the live server (`ObjType` in `realtime/src/protocol.ts`, `TYPES` in `realtime/src/validate.ts`) and the API (zod list in `web/api/_lib/core.ts`). If one list lacks a type, that part of the system refuses the object.

### B. Overlay objects

Comments, votes, the timer, reactions and the settings object have no size and are not drawn on the Konva canvas. They are plain board objects, so they save and sync like the rest, but React draws them as HTML on top of the canvas (`CommentLayer`, `VoteLayer`, `ReactionLayer`, `TimerBar`, `ExtrasBar` in `Extras.tsx`). The helper `isOverlay()` in `kinds.ts` is used everywhere these must be skipped: selection box, copy and paste, Fit, PNG export, dashboard thumbnails and the empty-board hint.

### C. Live parts and undo

The timer and reactions describe the present moment, not the drawing. `liveEdit()` changes them without writing an undo step, and `withLiveParts()` keeps them when undo, redo or a version restore swaps the other objects. Votes and comments are part of the drawing, so they can be undone.

### D. Frames and presentation

A frame is drawn under all other objects. Its inside is not clickable, so a click in an empty frame still starts a selection box. When a frame is dragged, the objects whose centre lies inside it are moved in the same step (`insideFrame` in `geometry.ts`). Presentation mode keeps `present = { index, back }` in the store: `sortedFrames` orders frames by slide number then id, `frameFit` calculates the view that fits one frame, and `Presenter.tsx` glides the view there in 0.45 seconds and blocks editing. `back` is the view to return to on exit.

### E. Version history

| Part | Design |
| --- | --- |
| Signed-in boards | Versions live on the server in a separate `versions` collection (one document per board). `addVersion()` keeps the newest 5 and drops the oldest while the total is over 8,000,000 characters |
| Guest boards | Versions live in the browser (`localStorage`, key `sketchboard.versions.v1.<board id>`); the oldest are dropped when the browser is full |
| Access | The Repo interface has `listVersions`, `saveVersion`, `getVersion`; the cloud repo calls three API routes, the guest repo uses the browser |
| Restore | `restoreObjects()` puts the old objects on the board as a normal edit, so it is undoable and is sent to everyone live by the usual change sending |

### F. Design decisions

| Decision | Reason |
| --- | --- |
| Pictures are stored inside the board object | Free hosting has no file storage. The browser shrinks the picture so one object stays under 150,000 characters |
| Each vote is its own object | Two people voting at once both win. A single counter field would let one overwrite the other |
| Restore is a normal edit, not a server-side swap | A server swap would be overwritten by the live room and would not reach people already on the board |
| Versions are a separate collection | Loading a board stays light, and the board document cannot grow past the database limit |
| Private mode only changes the display | Hiding data for real would need author-aware filtering in the Worker; the feature is meant for brainstorming, not secrets |
| The timer stores an end time, not a counter | Every screen can work out the time left from its own clock without a message every second |

### G. New code

New files: `kinds.ts`, `extras.ts`, `comments.ts`, `image.ts`, `exportPng.ts`, `components/Presenter.tsx`, `CommentLayer.tsx`, `HistoryPanel.tsx`, `Extras.tsx`, and on the server `api/_lib/versions.ts`. New store parts: `present`, `commentId`, `restoreObjects`, `liveEdit`, `castVotes`, `withdrawVotes`, `addChildNode`, `addSiblingNode`, `startPresent`, `stepPresent`, `stopPresent`. The live server needed no new logic, only the longer type list and a higher size limit for images (200,000 characters instead of 64,000). **After this update the Worker must be redeployed.**
