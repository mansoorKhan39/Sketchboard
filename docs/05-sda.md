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

## 4. Component design

The repository keeps the three deployable parts separate and puts shared types in one package. The SCD will show the real folders.

### 4.1 Client modules

| Module | Responsibility | SRS |
| --- | --- | --- |
| Screens | Landing, sign up, log in, dashboard, board page | FR-A, FR-B |
| Canvas | Konva stage, zoom, pan, grid, drawing and selection | FR-C, FR-T |
| Tools | One handler per tool: sticky note, shape, pen, text, connector | FR-T1 to FR-T6 |
| Board store | All objects of the open board, current selection, tool and viewport | FR-T, FR-C |
| History | Per-user undo and redo of own edits | FR-T11 |
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

## 6. Data placement and security design

### 6.1 Where each kind of data lives

Tables and fields are defined in the Database Design document; this table only says which store owns what.

| Data | Store | Why there |
| --- | --- | --- |
| Users (email, display name, password hash) | MongoDB Atlas | Needed by the REST API only |
| Board list and settings (name, owner, share link, link right) | MongoDB Atlas | Listed and edited through the REST API |
| Live board content (all objects and their order numbers) | Board room storage on Cloudflare | Read and written on every edit with no database call |
| Board snapshots | MongoDB Atlas | Backup and later version history |
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
