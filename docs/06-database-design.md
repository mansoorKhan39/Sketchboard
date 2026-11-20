# Sketchboard — Database Design Document

Nov 14, 2026 · @Mansoor

## 1. Overview

Sketchboard keeps data in two places, as decided in the SDA (decision D7). Accounts and the list of boards live in MongoDB Atlas. The content of an open board, which changes on every edit, lives in the board room on Cloudflare, one small SQLite database per board.

| Store | Holds | Used by | Phase |
| --- | --- | --- | --- |
| MongoDB Atlas | users, boards, snapshots | REST API | 1 |
| MongoDB Atlas | board members, comments | REST API | 2 |
| Board room storage (SQLite) | objects, edits, meta | Board room | 1 |

### Naming and format rules

- Collection and table names are lowercase plural words; field names are camelCase.
- Every record has a unique id. MongoDB uses its ObjectId; a board room uses ids made by the client (a random string), so a user can create an object before the network confirms it.
- All times are stored in UTC (milliseconds since 1970 in the board room, date values in MongoDB).
- A board's id is also the id of its board room, so no lookup table is needed to find a room.
- Cross-store links are by id only; the two stores do not enforce foreign keys across each other, so the REST API keeps them consistent (section 6).

## 2. Entity-relationship diagram

&#91;embedded content: entity-relationship diagram · 3 MongoDB collections, 3 room tables\]

One user owns many boards, and one board has many snapshots. The dashed arrow is a link by id only: a board's content sits in the board room that has the same id as the board, and inside the room one object has many edits in the edit log. PK is a primary key and FK is a foreign key. Phase 2 collections (board members, comments) are listed in section 3. The diagram shows only the main fields; the full lists are in sections 3 and 4.

## 3. MongoDB collections

### 3.1 users

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| \_id | ObjectId | Yes | Primary key |
| email | string | Yes | Stored in lowercase; unique |
| displayName | string | Yes | 1 to 40 characters; shown next to cursors |
| passwordHash | string | Yes | Salted bcrypt or argon2 hash; never returned by the API |
| cursorColor | string | Yes | Hex colour, picked at sign up, can be changed (FR-A4) |
| createdAt | date | Yes | Set once |
| updatedAt | date | Yes | Changed on each update |

### 3.2 boards

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| \_id | ObjectId | Yes | Primary key; its text form is also the board room id |
| ownerId | ObjectId | Yes | Foreign key to users.\_id |
| name | string | Yes | 1 to 80 characters; default "Untitled board" |
| share.enabled | boolean | Yes | False until the owner creates a link |
| share.token | string | When enabled | Random, at least 128 bits, unique among boards |
| share.right | string | When enabled | "view" or "edit" |
| createdAt | date | Yes | Set once |
| lastEditedAt | date | Yes | Updated when a snapshot is stored or the room reports activity; used to sort the dashboard |

### 3.3 snapshots

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| \_id | ObjectId | Yes | Primary key |
| boardId | ObjectId | Yes | Foreign key to boards.\_id |
| takenAt | date | Yes | When the room made the snapshot |
| lastSeq | number | Yes | Order number of the last edit included |
| objectCount | number | Yes | Used for quick checks and size planning |
| data | object | Yes | All objects of the board at that moment, in the object model of section 5 |

### 3.4 Phase 2 additions

| Collection | Purpose | Main fields |
| --- | --- | --- |
| boardMembers | Invite people with a role (FR-S5) | boardId, userId, role (owner, editor, viewer) |
| comments | Comment threads on objects (FR-R8) | boardId, objectId, authorId, text, resolved, createdAt |

## 4. Board room storage tables

Each board room has its own small SQLite database, created when the board is first opened. The diagram shows the key fields; this section is the full list.

### 4.1 objects

The current state of the board: one row per object.

| Column | Type | Constraint | Notes |
| --- | --- | --- | --- |
| id | TEXT | Primary key | Made by the client, a random string |
| type | TEXT | Not null | sticky, shape, stroke, text or connector (frame in Phase 2) |
| data | TEXT | Not null | JSON with the fields of that type (section 5) |
| z | INTEGER | Not null | Stacking order, higher is in front |
| deleted | INTEGER | Not null, default 0 | 1 means deleted; the row stays until the next snapshot so late edits to it can be ignored |
| createdBy | TEXT | Not null | User id or guest id |
| updatedAt | INTEGER | Not null | Milliseconds, UTC |

### 4.2 edits

The ordered log of accepted edits. It is what makes catch-up after a reconnect possible.

| Column | Type | Constraint | Notes |
| --- | --- | --- | --- |
| seq | INTEGER | Primary key, auto number | The order number given by the room |
| editId | TEXT | Unique, not null | Made by the client; a repeated edit is recognised and applied once |
| userId | TEXT | Not null | Who sent it |
| kind | TEXT | Not null | add, change or delete |
| objectId | TEXT | Not null | Refers to objects.id |
| patch | TEXT | Not null | JSON with the new object or the changed fields |
| at | INTEGER | Not null | Milliseconds, UTC |

### 4.3 meta

A few settings of the room, as key and value pairs.

| Key | Value |
| --- | --- |
| boardId | The board id this room belongs to |
| createdAt | When the room was created |
| lastSnapshotSeq | Order number of the last snapshot sent to the REST API |
| lastSnapshotAt | When that snapshot was sent |
| schemaVersion | Version of this table layout, for later changes |

### 4.4 How an edit is stored

1. The room checks the role and the shape of the edit.
2. In one transaction it inserts the row into edits and adds or updates the row in objects. If either fails, neither is saved.
3. Only after the transaction succeeds does the room send the ack and the edit to the other users.
4. A change to an object whose row has deleted = 1 is not applied and gets no new row in objects.

## 5. Board object model

The fields below are what goes inside the data column of the objects table, in snapshots and in edit patches. They are defined once as TypeScript types in the shared package. An edit of kind change carries only the fields that changed, so two users who change different fields of one object do not overwrite each other.

### 5.1 Fields shared by every object

| Field | Type | Meaning |
| --- | --- | --- |
| x, y | number | Position on the canvas |
| width, height | number | Size (not used by strokes) |
| rotation | number | Degrees |

The id, type, z order, deleted flag and creator are kept in their own columns (section 4.1).

### 5.2 Fields by object type

| Type | Own fields | SRS |
| --- | --- | --- |
| sticky | text, color | FR-T2 |
| shape | kind (rectangle, circle, triangle, diamond, star, arrow), fill, stroke, strokeWidth, text | FR-T3 |
| stroke | points (list of x, y pairs), color, width, tool (pen or highlighter) | FR-T4 |
| text | text, fontSize, color | FR-T5 |
| connector | fromId, fromAnchor, toId, toAnchor, loose end points when not attached, lineStyle, endArrow | FR-T6 |
| frame (Phase 2) | title | FR-T13 |

### 5.3 Rules

- A connector refers to other objects by id. If one of them is deleted, the connector keeps its last position and becomes a loose line instead of being deleted.
- Text fields have a maximum length (for example 5,000 characters for a sticky note) checked by the shared schema, so one object cannot grow without limit.
- A stroke's points are simplified on the client before sending, which keeps messages small for the free-plan request limit.
- Unknown fields are rejected, so a bad client cannot store arbitrary data.

## 6. Indexes, integrity, retention and capacity

### 6.1 Indexes

| Collection or table | Index | Why |
| --- | --- | --- |
| users | email, unique | Log in by email; stop duplicate accounts (UC-01 A1) |
| boards | ownerId, then lastEditedAt descending | Dashboard list of a user's boards, newest first (FR-B2) |
| boards | share.token, unique, only where a token exists | Open a board from a share link (UC-06) |
| snapshots | boardId, then takenAt descending | Find the newest snapshots of a board |
| edits (room) | editId, unique | Recognise a repeated edit after a reconnect |
| edits (room) | seq, primary key | Send a reconnecting client the edits it missed |

### 6.2 Integrity rules

- **Sign up.** The unique email index is the last line of defence against two accounts with one email, even if two requests arrive together.
- **Create board.** The REST API creates the boards record; the board room is created on first connect with the same id.
- **Delete board.** The REST API deletes the boards record first, so no new join token can be issued. It then deletes the snapshots and asks the room to erase its storage. If the erase fails, the orphan room cannot be reached by anyone and the erase is retried later.
- **Turn off share link.** The REST API sets share.enabled to false and removes the token, so the old link stops working at once (UC-05 A2).
- **Roles.** The owner is always the user in boards.ownerId; Phase 2 roles are checked against boardMembers.

### 6.3 Retention and backup

- A room keeps the edit log at least back to its last snapshot; a client that is older than the log gets the full board state instead.
- The latest 5 snapshots per board are kept and older ones are deleted. This number is a starting setting, not a requirement.
- Snapshots are the project's own backup. Atlas free clusters should not be counted on for backups, because sources disagree on whether they have any. Restoring a snapshot into a fresh room is the Phase 2 version history feature (FR-P3).

### 6.4 Capacity on the free plans

| Limit | Value | What it means for Sketchboard |
| --- | --- | --- |
| Atlas free cluster storage | 512 MB | Accounts and boards are tiny; snapshots are the main use of space |
| Atlas free cluster speed | About 100 operations per second | Fine for sign ups and saves; this is why edits are not written to MongoDB one by one |
| Atlas free cluster data transfer | Limited in and out over a rolling 7 days | Snapshots are stored every so often, not on every edit |
| Atlas free cluster connections | Reported as 100 to 500 depending on the source | The REST API reuses its database connection inside each serverless function instance |
| Cloudflare room storage | 5 GB SQLite on the free plan | Plenty for board content; see the Feasibility Study for the request limit |

**Size estimate (our own calculation).** Assume a typical board has 500 objects of about 400 bytes each, which is about 200 KB, and a very busy board with long pen strokes reaches about 1 MB. With 5 snapshots per board at 1 MB, one board uses at most 5 MB, so 512 MB holds about 100 such boards in the worst case and many more of typical size. This is enough for a course project and a demo.

### Sources

- [MongoDB Atlas, free cluster limitations](https://mongodb.com/docs/atlas/reference/free-shared-limitations/)
- [MongoDB Atlas pricing and free tier](https://mongodb.com/pricing)
- [MongoDB community, request limit in the free tier](https://www.mongodb.com/community/forums/t/request-limit-in-the-free-tier/9804)
- [Cloudflare, Durable Objects pricing and storage](https://developers.cloudflare.com/durable-objects/platform/pricing)

## Appendix: Update for Stages 6–11

The `boards` and `users` collections are unchanged. One new collection was added, and the object list inside a board has new types.

### A. New collection: `versions`

| Field | Type | Meaning |
| --- | --- | --- |
| `_id` | string | The board id. One document per board, so no extra index is needed |
| `versions` | array | Saved copies, oldest first |
| `versions[].id` | string | Version id (10 characters) |
| `versions[].at` | number | Time saved (milliseconds since 1970) |
| `versions[].label` | string | Up to 60 characters, for example Saved version or Before restore |
| `versions[].objects` | array | The board's objects at that time |

Rules: at most 5 versions per board; if the objects of all versions together pass 8,000,000 characters the oldest are dropped until they fit (the newest always stays). The document is created on the first save and deleted when the board is deleted. Duplicating a board does not copy versions. Guest boards keep the same structure in the browser under `sketchboard.versions.v1.<board id>`.

### B. New object types inside `boards.objects`

Every object has `id`, `type`, `x`, `y`, `width`, `height`, `rotation`. The size limits are 64,000 characters per object (200,000 for an image), 5,000 objects and about 3 MB per board.

| Type | Extra fields | Notes |
| --- | --- | --- |
| image | `src` (compressed data URL, up to 150,000 characters), `name` | Browser shrinks before saving |
| frame | `text` (title), `slide` (number) | Default 640 × 360; presentation order is slide, then id |
| comment | `thread` (up to 50 messages of `id`, `author`, `text` up to 500 characters, `at`), `resolved` | Width and height are 0; x, y is the pin tip |
| vote | `targetId`, `voter` | One object per vote; width and height 0. Removed when the target is removed |
| timer | `seconds`, `endsAt` (time or null), `left` | At most one per board |
| reaction | `emoji`, `at` | Short-lived, removed after a few seconds |
| settings | `private` (true or false) | At most one per board |
| sticky (changed) | optional `by` | Id of the author (account id or guest id), used by private mode |

`comment`, `vote`, `timer`, `reaction` and `settings` are overlay objects: they are saved with the board but are not board content for selection, export or thumbnails.

### C. Example (a board with a frame, a note and a vote)

```json
{
  "objects": [
    { "id": "f1", "type": "frame", "x": 0, "y": 0, "width": 640, "height": 360, "rotation": 0, "text": "Frame 1", "slide": 1 },
    { "id": "s1", "type": "sticky", "x": 40, "y": 60, "width": 180, "height": 180, "rotation": 0, "text": "Idea", "color": "#FFD43B", "by": "u_123" },
    { "id": "v1", "type": "vote", "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0, "targetId": "s1", "voter": "u_123" }
  ]
}
```

### D. Size planning

A board of pictures can reach the 3 MB board limit quickly (a shrunk picture is about 100 to 150 KB). Versions multiply that: a board near 3 MB keeps about 2 versions inside the 8,000,000 character cap. The free MongoDB Atlas plan has 512 MB, so roughly 50 such boards with full history fit before it is full (about 9 MB each); normal text boards use far less.
