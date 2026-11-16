# Sketchboard — Software Requirements Specification (SRS)

Nov 14, 2026 · @Mansoor

## 1. Introduction

Sketchboard is a free, web-based whiteboard with an infinite canvas where people draw, add sticky notes and diagrams, and edit the same board together in real time. This SRS says what the first versions must do and what they will not do.

### 1.1 Purpose

This document is the single source of truth for requirements. The design document (SDA) and the construction document (SCD) will trace back to the requirement IDs written here.

### 1.2 Scope and what "Miro parity" means

Sketchboard aims to feel familiar to a Miro user: same core tools, same board model, similar shortcuts, live cursors and sharing. It will not be a 100% copy. Miro is a commercial product built over many years by a full-time engineering team, and it includes video chat, AI features and a large integration ecosystem that a zero-budget student project cannot match. Estimates found online put a full Miro alternative at 6 to 9 months of work, so this SRS splits the work into phases.

| Parity level | Meaning | Target |
| --- | --- | --- |
| Core whiteboard | Canvas, sticky notes, shapes, pen, text, connectors, select and edit | Phase 1 |
| Live collaboration | Many users on one board, live cursors, save, share link | Phase 1 |
| Board organisation | Frames, comments, images, presentation mode, export, roles | Phase 2 |
| Facilitation | Timer, voting, private mode, reactions, cursor chat, templates | Phase 3 |
| Not planned | Video chat, AI assistant, 160+ integrations, enterprise admin, native apps | Out of scope |

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Board | One whiteboard document with its own link, owner and members |
| Canvas | The unlimited 2D drawing area of a board |
| Object | Anything placed on a canvas: sticky note, shape, stroke, text, connector, frame, image |
| Viewport | The part of the canvas the user currently sees (position and zoom) |
| Presence | Who is on the board now, with their live cursors |
| Room | The live session that keeps all users of one board in sync |
| MVP | Minimum viable product, the Phase 1 scope |

### 1.4 References

- IEEE 29148 (replaces IEEE 830) structure for requirements documents
- Miro Help Center, [whiteboard features overview](https://help.miro.com/hc/articles/360012753200)
- Educative, [Miro System Design Explained](https://www.educative.io/blog/miro-system-design)
- techinterview.org, [Design a Real-Time Collaborative Whiteboard](https://techinterview.org/system-design-collaborative-whiteboard/)

## 2. Overall description

Sketchboard is a standalone web application with three parts: a browser client, a REST API for accounts and saved boards, and a separate realtime service that keeps open boards in sync.

### 2.1 Product perspective

| Part | Responsibility | Planned technology |
| --- | --- | --- |
| Web client | Canvas, tools, UI, local state | React, Vite, TypeScript, Tailwind CSS, Konva |
| REST API | Sign up, login, board create, save, load, share settings | TypeScript serverless functions on Vercel, MongoDB Atlas |
| Realtime service | One live room per board, broadcast of edits and cursors | Cloudflare Workers with Durable Objects (WebSocket) |

The realtime service is separate because Vercel runs serverless functions and does not hold long-lived WebSocket connections. The final stack choice is recorded in the SDA.

### 2.2 User classes

| User class | Description | Can do |
| --- | --- | --- |
| Guest | Opens a shared link without an account | View, or edit if the link allows |
| Registered user | Has an account | Create and delete own boards, share them |
| Owner | Registered user who created a board | Everything on that board, including roles and deletion |
| Editor | Collaborator with edit rights | Add, change and delete objects |
| Viewer | Collaborator with read-only rights | View and follow, no changes |

### 2.3 Operating environment

- Latest two versions of Chrome, Edge, Firefox and Safari on desktop
- Mouse and keyboard in Phase 1; touch and tablet support in Phase 2
- No installation; works from a URL

### 2.4 Constraints

- Zero budget: every service must have a free plan that needs no credit card
- Free-plan limits apply, for example Cloudflare Durable Objects on the free plan allow 100,000 requests per day and fail past that
- Language is TypeScript, styling is Tailwind CSS where CSS is needed
- No Miro code, logo, name, icons, templates or screenshots are copied (see section 8)

### 2.5 Assumptions and dependencies

- Free tiers of Vercel, MongoDB Atlas and Cloudflare stay available; they change often and must be re-checked before deployment
- Users have a stable internet connection
- Accounts on GitHub, Vercel, MongoDB Atlas and Cloudflare already exist

## 3. Miro feature parity roadmap

Phase 1 delivers a working collaborative whiteboard; Phases 2 and 3 move it closer to Miro. Miro's capabilities below are taken from its [help pages](https://help.miro.com/hc/articles/360012753200) and public feature descriptions as of November 2026.

| Miro capability | Sketchboard plan | Phase |
| --- | --- | --- |
| Infinite canvas with zoom and pan | Yes | 1 |
| Sticky notes | Yes, with colours and editable text | 1 |
| Shapes | Rectangle, circle, triangle, diamond, star, arrow | 1 |
| Freehand pen and highlighter | Yes | 1 |
| Text | Yes | 1 |
| Connectors, lines and arrows | Yes, attached to objects | 1 |
| Select, move, resize, rotate, duplicate, delete | Yes | 1 |
| Undo and redo | Yes, per user | 1 |
| Keyboard shortcuts (for example N for sticky note, T for text) | Yes, similar keys | 1 |
| Live collaboration with live cursors | Yes | 1 |
| Sign up, saved boards, share link | Yes | 1 |
| Frames to group and organise | Yes | 2 |
| Images and file embeds | Image upload only | 2 |
| Comments and @mentions | Comments first, mentions later | 2 |
| Presentation mode (walk through frames) | Yes | 2 |
| Export board as image or PDF | Yes | 2 |
| Roles and permissions | Owner, editor, viewer | 2 |
| Version history | Basic snapshots | 2 |
| Templates | A few original templates | 3 |
| Timer for timeboxed activities | Yes | 3 |
| Voting and emoji reactions | Yes | 3 |
| Private mode and cursor chat | Yes | 3 |
| Mind maps, tables, cards | Mind map first | 3 |
| Built-in video chat and screen sharing | No | Out of scope |
| AI features | No | Out of scope |
| 160+ app integrations | No | Out of scope |
| Enterprise admin, SSO and security controls | No | Out of scope |
| Native mobile apps and sticky note capture from photos | No | Out of scope |

## 4. Functional requirements

Each requirement starts with "The system shall". Priority uses MoSCoW: Must, Should, Could. Phase 1 requirements are the MVP.

### 4.1 Accounts (FR-A)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-A1 | The system shall let a user sign up with email and password | Must | 1 |
| FR-A2 | The system shall let a user log in and log out | Must | 1 |
| FR-A3 | The system shall keep the user logged in across page reloads | Must | 1 |
| FR-A4 | The system shall let a user change their display name and cursor colour | Should | 1 |
| FR-A5 | The system shall let a guest open a shared link without an account | Must | 1 |

### 4.2 Board management (FR-B)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-B1 | The system shall let a user create a new empty board | Must | 1 |
| FR-B2 | The system shall list the user's boards with name and last edited time | Must | 1 |
| FR-B3 | The system shall let the owner rename and delete a board | Must | 1 |
| FR-B4 | The system shall save board content automatically, without a save button | Must | 1 |
| FR-B5 | The system shall reopen a board exactly as it was last saved | Must | 1 |
| FR-B6 | The system shall let the owner duplicate a board | Could | 2 |

### 4.3 Canvas (FR-C)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-C1 | The system shall provide an unbounded canvas | Must | 1 |
| FR-C2 | The system shall zoom with the mouse wheel and pinch, and show the zoom level | Must | 1 |
| FR-C3 | The system shall pan with the space key and drag, or middle mouse button | Must | 1 |
| FR-C4 | The system shall show a dotted grid background | Should | 1 |
| FR-C5 | The system shall provide a zoom-to-fit action | Should | 1 |
| FR-C6 | The system shall show a mini-map of the board | Could | 2 |

### 4.4 Tools and objects (FR-T)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-T1 | The system shall provide a toolbar with select, sticky note, shape, pen, text and connector tools | Must | 1 |
| FR-T2 | The system shall create sticky notes in several colours with editable text | Must | 1 |
| FR-T3 | The system shall create rectangle, circle, triangle, diamond, star and arrow shapes with fill, border and optional text | Must | 1 |
| FR-T4 | The system shall draw freehand strokes with chosen colour and thickness | Must | 1 |
| FR-T5 | The system shall create text objects with size and colour options | Must | 1 |
| FR-T6 | The system shall create connectors and arrows that stay attached to objects when they move | Must | 1 |
| FR-T7 | The system shall select one or many objects by click, shift-click or drag box | Must | 1 |
| FR-T8 | The system shall move, resize, rotate, duplicate and delete selected objects | Must | 1 |
| FR-T9 | The system shall copy and paste objects, also across boards | Should | 1 |
| FR-T10 | The system shall bring objects forward or send them backward | Should | 1 |
| FR-T11 | The system shall undo and redo the user's own recent actions | Must | 1 |
| FR-T12 | The system shall support keyboard shortcuts for tools, delete, duplicate, undo and redo | Should | 1 |
| FR-T13 | The system shall create frames that group objects and move with them | Should | 2 |
| FR-T14 | The system shall upload and place images | Should | 2 |
| FR-T15 | The system shall let users lock an object so it cannot be moved | Could | 2 |

### 4.5 Real-time collaboration (FR-R)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-R1 | The system shall show every change by one user to all other users on the same board | Must | 1 |
| FR-R2 | The system shall show other users' live cursors with their names | Must | 1 |
| FR-R3 | The system shall show who is currently on the board | Must | 1 |
| FR-R4 | The system shall merge simultaneous edits without losing either user's work | Must | 1 |
| FR-R5 | The system shall keep working when the connection drops and sync again on reconnect | Should | 1 |
| FR-R6 | The system shall show a clear connection status | Should | 1 |
| FR-R7 | The system shall let a user follow another user's view | Could | 2 |
| FR-R8 | The system shall support comments on objects, with a thread and resolve | Should | 2 |

### 4.6 Sharing and permissions (FR-S)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-S1 | The system shall create a share link for a board | Must | 1 |
| FR-S2 | The system shall let the owner choose "can view" or "can edit" for the link | Must | 1 |
| FR-S3 | The system shall let the owner turn the link off | Must | 1 |
| FR-S4 | The system shall reject edits from viewers on the server, not only hide the tools | Must | 1 |
| FR-S5 | The system shall let the owner invite people by email with owner, editor or viewer roles | Should | 2 |

### 4.7 Presentation, export and history (FR-P)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-P1 | The system shall present frames one by one in a full-screen mode | Should | 2 |
| FR-P2 | The system shall export a board or a frame as PNG and PDF | Should | 2 |
| FR-P3 | The system shall keep snapshots of a board and restore an older one | Could | 2 |

### 4.8 Facilitation tools (FR-F)

| ID | Requirement | Priority | Phase |
| --- | --- | --- | --- |
| FR-F1 | The system shall provide a shared countdown timer | Could | 3 |
| FR-F2 | The system shall provide dot voting with a vote limit per user | Could | 3 |
| FR-F3 | The system shall provide emoji reactions and cursor chat | Could | 3 |
| FR-F4 | The system shall provide a private mode that hides new objects from others until revealed | Could | 3 |
| FR-F5 | The system shall provide a small set of original board templates | Could | 3 |

## 5. Non-functional requirements

The numbers below are project targets, chosen to be realistic on free hosting. They will be measured and reported in the testing phase.

| ID | Category | Requirement | Measure |
| --- | --- | --- | --- |
| NFR-1 | Performance | Edits reach other users quickly | Under 100 ms median on the same region, the figure commonly used for collaborative whiteboards |
| NFR-2 | Performance | Canvas stays smooth while drawing, zooming and panning | About 60 frames per second with 500 objects on a mid-range laptop |
| NFR-3 | Performance | A board opens fast | Under 3 seconds for a board with 500 objects on a normal connection |
| NFR-4 | Scalability | One board supports several editors at once | At least 10 concurrent editors in Phase 1 |
| NFR-5 | Reliability | No data loss after a refresh, server restart or reconnect | All acknowledged edits are present when the board reopens |
| NFR-6 | Reliability | Simultaneous edits on the same object never corrupt it | Conflicts resolve to one consistent state for all users |
| NFR-7 | Security | Passwords are never stored in plain text | Salted hash (bcrypt or argon2) |
| NFR-8 | Security | All traffic is encrypted | HTTPS and secure WebSocket (WSS) only |
| NFR-9 | Security | Every board read and write is authorised on the server | Viewer cannot edit, stranger cannot open a private board |
| NFR-10 | Security | Share links cannot be guessed | Random token of at least 128 bits |
| NFR-11 | Security | User input is validated and text is escaped | No stored or reflected script injection |
| NFR-12 | Usability | A new user can create a board and add a sticky note without help | Under 1 minute in a usability test |
| NFR-13 | Usability | Tool shortcuts and layout feel familiar to Miro users | Same key for sticky note, text and line where possible |
| NFR-14 | Compatibility | Works on current desktop browsers | Latest two versions of Chrome, Edge, Firefox, Safari |
| NFR-15 | Maintainability | Code is typed and linted, with shared types between client and servers | TypeScript strict mode, one shared types package |
| NFR-16 | Cost | The whole system runs for free with no credit card | USD 0 per month on free plans |
| NFR-17 | Availability | The app stays usable within free-plan limits | Daily request limits documented and monitored |
| NFR-18 | Accessibility | Basic keyboard access and readable contrast | Interface text meets WCAG AA contrast |

## 6. External interface requirements

### 6.1 User interface

The board screen has five regions. The look is original to Sketchboard; only the general layout pattern of whiteboard tools is shared with Miro.

| Region | Position | Content |
| --- | --- | --- |
| Top bar | Top | Board name, share button, user avatars of people on the board, account menu |
| Tool bar | Left, vertical | Select, sticky note, shapes, pen, text, connector, frame (Phase 2) |
| Canvas | Centre | The board with live cursors |
| Properties panel | Floating near the selection | Colour, size, text and arrange options for the selected objects |
| Zoom controls | Bottom right | Zoom in, zoom out, zoom level, fit to screen |

Other screens: landing page, sign up and login, and a dashboard that lists the user's boards. The interface uses Tailwind CSS and supports light mode first; dark mode is optional.

### 6.2 Hardware interfaces

None beyond a computer with a keyboard, a mouse or trackpad, and a screen of at least 1280 by 720 pixels.

### 6.3 Software interfaces

| Interface | Used for |
| --- | --- |
| Web browser (Canvas and WebSocket support) | Running the client |
| MongoDB Atlas | Storing users, boards and board snapshots |
| Cloudflare Workers and Durable Objects | Live rooms and board state during a session |
| Vercel | Hosting the client and REST API |
| GitHub | Source control and deployment trigger |

### 6.4 Communication interfaces

- REST API over HTTPS, JSON bodies, for accounts, board list, board metadata and sharing
- WebSocket over TLS (WSS) for live editing: client sends operations and cursor positions, server broadcasts them to the other users of the room
- All messages use typed schemas shared by client and servers; exact formats are defined in the SDA

## 7. Use cases and actors

Actors are Guest, Registered user, Owner, Editor and Viewer (section 2.2). The cloud services are supporting systems, not actors.

| ID | Use case | Actor | Main flow | Requirements | Phase |
| --- | --- | --- | --- | --- | --- |
| UC-01 | Sign up and log in | Guest | Enter email and password, account is created, user lands on the dashboard | FR-A1, FR-A2, FR-A3 | 1 |
| UC-02 | Create a board | Registered user | Click new board, empty canvas opens, board is saved under the user | FR-B1, FR-B2 | 1 |
| UC-03 | Add and edit objects | Owner, Editor | Pick a tool, click or drag on the canvas, then move, resize or style the object | FR-T1 to FR-T12 | 1 |
| UC-04 | Work together live | Owner, Editor, Viewer | Open the same board, see each other's cursors and changes as they happen | FR-R1 to FR-R6 | 1 |
| UC-05 | Share a board | Owner | Open share, pick view or edit, copy link, send it | FR-S1, FR-S2, FR-S3 | 1 |
| UC-06 | Join through a link | Guest, Registered user | Open link, join the live room with the allowed role | FR-A5, FR-S4 | 1 |
| UC-07 | Reopen a saved board | Registered user | Pick a board on the dashboard, it loads as last saved | FR-B4, FR-B5 | 1 |
| UC-08 | Present frames | Owner, Editor | Start presentation, step through frames in full screen | FR-P1 | 2 |
| UC-09 | Export a board | Owner, Editor | Choose PNG or PDF, file downloads | FR-P2 | 2 |
| UC-10 | Comment on an object | Owner, Editor | Select object, write a comment, others reply or resolve | FR-R8 | 2 |
| UC-11 | Run a timed vote | Owner, Editor | Start timer, everyone places votes, results show | FR-F1, FR-F2 | 3 |

## 8. Out of scope, legal and branding constraints

Sketchboard copies the idea of an online whiteboard, not Miro's product. This keeps the project legal and makes it your own work.

### 8.1 Out of scope

- Video chat, screen sharing and audio
- AI assistants and AI-generated boards
- Third-party integrations such as Jira, Slack and Google Drive
- Enterprise features: SSO, audit logs, organisation admin
- Native iOS and Android apps, offline mode and sticky note capture from photos
- Payments, plans and billing

### 8.2 Branding and legal rules

- The product name is Sketchboard. Miro's name, logo, icons, colours as a brand, illustrations and screenshots are not used.
- No Miro source code, templates or text is copied. Miro's public help pages are used only to understand which features exist.
- The visual design, icons and templates are original or come from free assets with a licence that allows this use.
- Every library used (for example the canvas library) has its licence checked and listed in the SCD.
- Open-source Miro clones found online may be read to learn, not copied.

### 8.3 Free-tier risk

Free plans can change or end without notice. The design keeps the realtime service replaceable, so the project can move to another host if a free plan disappears.

## 9. Open items and approval

These points are not decided yet. Each one is a small edit to this SRS once answered.

- [ ] SCD is the implementation and coding details document (confirmed); check whether your course needs a specific template for it
- [ ] Is this an individual or a group project (group members and roles go in the approval table)
- [ ] Does your course require any Phase 2 or Phase 3 feature, or is Phase 1 enough for submission
- [ ] Confirm the realtime stack: Cloudflare Durable Objects (current plan) or a Socket.io server on a free container host
- [ ] Confirm TypeScript for the REST API (current plan) instead of FastAPI
- [ ] Name of the course, supervisor and submission date for the cover page

### Approval

| Name | Role | Signature | Date |
| --- | --- | --- | --- |
| Mansoor Ali Khan | Author |  |  |
|  | Supervisor |  |  |

### Sources

- [Miro Help Center, whiteboard features](https://help.miro.com/hc/articles/360012753200)
- [Miro, Software Requirements Document template](https://miro.com/templates/software-requirements-document/)
- [Educative, Miro System Design Explained](https://www.educative.io/blog/miro-system-design)
- [techinterview.org, collaborative whiteboard design](https://techinterview.org/system-design-collaborative-whiteboard/)
- [Cloudflare, Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)
- [RapidDev, Build Your Own Miro Alternative](https://www.rapidevelopers.com/md/clone/miro)
