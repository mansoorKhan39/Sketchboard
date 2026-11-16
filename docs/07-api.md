# Sketchboard — API Documentation

Nov 14, 2026 · @Mansoor

## 1. Overview and conventions

Sketchboard has two APIs. The **REST API** (this document, sections 2 to 5 and 7) runs on Vercel and handles accounts, boards, sharing and join tokens. The **realtime API** (section 6) is a WebSocket on Cloudflare and carries live edits. This is the design the code will follow; once the code exists, the SCD and the test cases will confirm each endpoint.

| Topic | Rule |
| --- | --- |
| Base URL | `https://<app-domain>/api/v1` (the real domain is filled in after deployment) |
| Format | Requests and responses are JSON; send the header `Content-Type: application/json` |
| Login | A session cookie named `sb_session`: HTTP-only, Secure, SameSite=Lax. The browser sends it by itself |
| Ids | Text ids; a board id is the text form of the MongoDB ObjectId |
| Times | ISO 8601 text in UTC, for example `2026-11-14T10:30:00Z` |
| Field names | camelCase |
| Unknown fields | Rejected with a 400 error, so typos are caught |
| Errors | One shape for all, see section 7 |
| Who may call | Each endpoint says: Public, Logged in, Owner, or Internal (called by the board room only) |

Trace: account endpoints implement FR-A, board endpoints FR-B, sharing endpoints FR-S, and the realtime API FR-R (see the SRS).

## 2. Resources the API returns

These shapes come from the database collections in the Database Design Document, with secrets removed.

### 2.1 User

```json
{
  "id": "6554b1c2e4a1f2b3c4d5e6f7",
  "email": "mansoor@example.com",
  "displayName": "Mansoor",
  "cursorColor": "#e8590c",
  "createdAt": "2026-11-14T10:30:00Z"
}
```

The password hash is never returned.

### 2.2 Board

```json
{
  "id": "6554b2d0e4a1f2b3c4d5e700",
  "name": "Sprint planning",
  "ownerId": "6554b1c2e4a1f2b3c4d5e6f7",
  "createdAt": "2026-11-14T10:35:00Z",
  "lastEditedAt": "2026-11-14T11:02:00Z",
  "share": { "enabled": true, "right": "edit", "url": "https://<app-domain>/s/Zk3..." }
}
```

When sharing is off the share object is `{ "enabled": false }`. The share token is only part of the link and is shown only to the owner.

### 2.3 Field rules

| Field | Rule |
| --- | --- |
| email | Valid email format, at most 254 characters, stored in lowercase |
| displayName | 1 to 40 characters |
| password | 8 to 72 characters (72 is the most bcrypt uses); only sent in sign up and log in, never returned |
| cursorColor | Hex colour like `#e8590c` |
| board name | 1 to 80 characters |
| share right | `view` or `edit` |

## 3. Account endpoints

| Method and path | Who | Request body | Success | Errors | SRS |
| --- | --- | --- | --- | --- | --- |
| `POST /auth/signup` | Public | email, displayName, password | 201 with the user; sets the session cookie | 400 invalid\_input, 409 email\_taken | FR-A1 |
| `POST /auth/login` | Public | email, password | 200 with the user; sets the session cookie | 400 invalid\_input, 401 invalid\_credentials | FR-A2 |
| `POST /auth/logout` | Logged in | none | 204; clears the cookie | 401 unauthenticated | FR-A2 |
| `GET /auth/me` | Logged in | none | 200 with the user | 401 unauthenticated | FR-A3 |
| `PATCH /auth/me` | Logged in | displayName and or cursorColor | 200 with the updated user | 400 invalid\_input, 401 unauthenticated | FR-A4 |

### Example: sign up

Request:

```json
POST /api/v1/auth/signup
{ "email": "mansoor@example.com", "displayName": "Mansoor", "password": "a-long-password" }
```

Response (201):

```json
{ "user": { "id": "6554b1c2e4a1f2b3c4d5e6f7", "email": "mansoor@example.com", "displayName": "Mansoor", "cursorColor": "#e8590c", "createdAt": "2026-11-14T10:30:00Z" } }
```

### Notes

- A wrong email and a wrong password both return the same `invalid_credentials` error, so an attacker cannot learn which emails have accounts (UC-01 B1).
- The cursor colour is picked by the server at sign up and can be changed with `PATCH /auth/me`.
- The session cookie holds a signed token; no session table is needed.

## 4. Board and sharing endpoints

### 4.1 Boards

| Method and path | Who | Request body | Success | Errors | SRS |
| --- | --- | --- | --- | --- | --- |
| `POST /boards` | Logged in | name (optional, default "Untitled board") | 201 with the board | 400 invalid\_input, 401 unauthenticated | FR-B1 |
| `GET /boards` | Logged in | none | 200 with a list of the user's boards, newest edit first | 401 unauthenticated | FR-B2 |
| `GET /boards/:boardId` | Owner | none | 200 with the board | 401, 403 forbidden, 404 not\_found | FR-B5 |
| `PATCH /boards/:boardId` | Owner | name | 200 with the board | 400, 401, 403, 404 | FR-B3 |
| `DELETE /boards/:boardId` | Owner | none | 204 | 401, 403, 404 | FR-B3 |

The board content (the objects on the canvas) is not part of these endpoints; it is loaded through the realtime API (section 6) when the board is opened.

`GET /boards` returns:

```json
{ "boards": [ { "id": "6554b2d0e4a1f2b3c4d5e700", "name": "Sprint planning", "lastEditedAt": "2026-11-14T11:02:00Z", "share": { "enabled": false } } ] }
```

`DELETE /boards/:boardId` follows the order in the Database Design Document: the board record first, then the snapshots, then the board room is told to erase its storage.

### 4.2 Sharing

| Method and path | Who | Request body | Success | Errors | SRS |
| --- | --- | --- | --- | --- | --- |
| `PUT /boards/:boardId/share` | Owner | right: `view` or `edit` | 200 with the share object; creates the link on first call, changes the right on later calls (the link stays the same) | 400, 401, 403, 404 | FR-S1, FR-S2 |
| `DELETE /boards/:boardId/share` | Owner | none | 204; the old link stops working at once | 401, 403, 404 | FR-S3 |
| `GET /share/:token` | Public | none | 200 with `{ boardId, name, right }` | 404 link\_not\_available | FR-A5, UC-06 |

`PUT /boards/:boardId/share` returns:

```json
{ "share": { "enabled": true, "right": "edit", "url": "https://<app-domain>/s/Zk3..." } }
```

A turned-off link and a link that never existed give the same 404, so nobody can tell them apart.

## 5. Join token and internal endpoints

### 5.1 Join token

Before opening the WebSocket, the client asks for a short-lived signed token that says who the user is and what role they have on this board (SDA section 6.2).

| Method and path | Who | Request body | Success | Errors | SRS |
| --- | --- | --- | --- | --- | --- |
| `POST /boards/:boardId/join` | Owner by cookie, or anyone with a valid share token | shareToken (needed unless the caller is the owner), guestName (optional, for guests) | 200 with the join token | 401 unauthenticated, 403 forbidden, 404 not\_found | FR-S4, FR-A5, UC-06 |

How the role is chosen:

| Caller | Role |
| --- | --- |
| Logged-in owner of the board | owner |
| Anyone with a valid share token, link right `edit` | editor |
| Anyone with a valid share token, link right `view` | viewer |
| Anyone else | 403 forbidden |

Response (200):

```json
{
  "joinToken": "<signed token>",
  "role": "editor",
  "expiresAt": "2026-11-14T11:02:00Z",
  "roomUrl": "wss://<room-domain>/rooms/6554b2d0e4a1f2b3c4d5e700",
  "user": { "id": "guest_7fK2", "displayName": "Guest 482", "cursorColor": "#1c7ed6" }
}
```

The token holds the board id, user id, display name, colour, role and expiry. It lives for about 2 minutes (a setting) and only needs to be valid at the moment of joining. The client asks for a new one on every reconnect.

Known limit in Phase 1: the role is read when a user joins. If the owner turns off the link or changes it from edit to view, people already in the room keep their connection until they reconnect. Phase 2 adds a call that closes their connections at once.

### 5.2 Internal endpoints

These are not for the browser. Calls are signed with a secret shared only by the REST API and the board room: the header `X-Sketchboard-Timestamp` carries the time, and `X-Sketchboard-Signature` carries a keyed hash (HMAC-SHA256) of the timestamp and the body. A call with a wrong signature or a timestamp older than 5 minutes gets 401.

| Method and path | Called by | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /internal/boards/:boardId/snapshots` | Board room | takenAt, lastSeq, objectCount, data | 201 with the snapshot id; also updates the board's lastEditedAt and removes snapshots beyond the latest 5 | 401 bad\_signature, 404 not\_found (board was deleted), 413 too\_large |
| `DELETE https://<room-domain>/rooms/:boardId` | REST API | none | 204; the room erases all its storage | 401 bad\_signature |

Snapshots are capped at 4 MB per call as a design setting; the cap must still be checked against the hosting platform's request size limit.

## 6. Realtime WebSocket API

The message types match section 5.1 of the SDA. Every message is a JSON text frame with a `type` field.

### 6.1 Connecting

1. Ask the REST API for a join token (section 5.1) and read `roomUrl`.
2. Open a secure WebSocket to `roomUrl`.
3. Send `hello` as the first message. If it does not arrive within 5 seconds, the room closes the connection with code 4004.
4. The room checks the token and answers with `welcome`, then sends `presence` to everyone.

### 6.2 Messages

| Type | Direction | Fields |
| --- | --- | --- |
| hello | Client to room | protocol (number, now 1), token, lastSeq (the last order number the client has, 0 if none) |
| welcome | Room to client | role, you (id, displayName, cursorColor), seq (current order number), mode (`full` or `catchup`), objects (when full) or edits (when catchup) |
| edit | Client to room | editId, kind (`add`, `change` or `delete`), objectId, patch |
| edit | Room to clients | the same fields plus seq (order number) and userId |
| ack | Room to sender | editId, seq |
| reject | Room to sender | editId, reason |
| cursor | Client to room | x, y (canvas position) |
| cursor | Room to others | userId, x, y |
| presence | Room to clients | users: list of id, displayName, cursorColor, role |

The room sends `mode: catchup` when the edit log still reaches back to the client's lastSeq, and `mode: full` with all current objects otherwise (Database Design Document, section 6.3).

### 6.3 Examples

Client joins:

```json
{ "type": "hello", "protocol": 1, "token": "<join token>", "lastSeq": 0 }
```

Client adds a sticky note:

```json
{ "type": "edit", "editId": "e_91ab", "kind": "add", "objectId": "o_4cd2",
  "patch": { "type": "sticky", "x": 240, "y": 120, "width": 160, "height": 160, "rotation": 0, "text": "Ship the MVP", "color": "#ffd43b" } }
```

Room confirms to the sender, and sends the numbered edit to the others:

```json
{ "type": "ack", "editId": "e_91ab", "seq": 1521 }
{ "type": "edit", "seq": 1521, "userId": "6554b1c2e4a1f2b3c4d5e6f7", "editId": "e_91ab", "kind": "add", "objectId": "o_4cd2", "patch": { "type": "sticky", "x": 240, "y": 120, "width": 160, "height": 160, "rotation": 0, "text": "Ship the MVP", "color": "#ffd43b" } }
```

A later change carries only the changed fields:

```json
{ "type": "edit", "editId": "e_91ac", "kind": "change", "objectId": "o_4cd2", "patch": { "x": 300, "y": 140 } }
```

### 6.4 Reject reasons

| Reason | When | What the client does |
| --- | --- | --- |
| forbidden | The sender is a viewer | Undo the local change; show the board as it is |
| invalid | The edit does not match the object model (Database Design Document, section 5) | Undo the local change and log the problem |
| deleted | The object was already deleted | Drop the local change |
| too\_large | The edit or message is over the size limit | Undo the local change |
| rate\_limited | The sender is over the edit rate limit | Wait, then resend |

### 6.5 Close codes

| Code | Meaning | Client action |
| --- | --- | --- |
| 4001 | Token missing, wrong or expired | Ask for a new join token, then reconnect |
| 4003 | Board does not exist | Show a "board not found" page |
| 4004 | No hello within 5 seconds | Reconnect with a new join token |
| 4008 | Too many messages | Wait and reconnect |
| 4010 | Protocol version not supported | Ask the user to reload the page |

### 6.6 Limits

These are starting settings and are tested in the test plan: about 20 edit messages per second and 10 cursor messages per second for each connection, and 256 KB for one message. A pen stroke is sent as one `add` edit when the pen is lifted, which keeps the number of messages low for the free-plan request limit; showing a stroke to others while it is still being drawn is not part of Phase 1.

## 7. Errors, limits, versioning and testing

### 7.1 Error format

Every REST error has the same shape, so the client needs one handler:

```json
{ "error": { "code": "email_taken", "message": "An account with this email already exists.", "fields": { "email": "already used" } } }
```

`fields` is only present for input errors. The `message` is safe to show to a user; the `code` is what the client code checks.

| HTTP status | code | Meaning |
| --- | --- | --- |
| 400 | invalid\_input | A field is missing, too long, of the wrong type, or unknown |
| 401 | unauthenticated | No valid session cookie |
| 401 | invalid\_credentials | Wrong email or password |
| 401 | bad\_signature | An internal call was not signed correctly or is too old |
| 403 | forbidden | Logged in, but not allowed (not the owner, or no valid share token) |
| 404 | not\_found | The board does not exist, or the caller may not know that it exists |
| 404 | link\_not\_available | The share link is wrong or turned off |
| 409 | email\_taken | The email is already registered |
| 413 | too\_large | The body is over the allowed size |
| 429 | rate\_limited | Too many requests |
| 500 | server\_error | Something broke on our side; no details are shown to the user |

### 7.2 Limits and protection

- **Login attempts.** Failed log-ins per email and per address are counted and slowed down after several misses (exact numbers are chosen during construction and recorded in the SCD).
- **Request size.** JSON bodies larger than the limit get 413; internal snapshot calls have their own cap (section 5.2).
- **Cross-site requests.** The cookie is SameSite=Lax and the API only accepts `application/json` bodies, so a form on another site cannot call it. The client and API share one domain on Vercel, so no cross-origin sharing is needed.
- **Logout.** The session token is signed and has no server-side list, so logout removes the cookie from the browser but the token stays valid until it expires. A stored revocation list is a Phase 2 option.

### 7.3 Versioning

The REST paths start with `/api/v1`. A change that breaks existing clients (removing a field, changing a meaning) gets `/api/v2`. Adding a new optional field is not a breaking change. The WebSocket has its own `protocol` number in `hello`; the room closes with code 4010 if it does not support it.

### 7.4 Testing

- Each endpoint in sections 3 to 5 gets at least one test for success and one for each listed error. These go into the Test Plan and the test cases.
- Quick manual check while building: send the example requests above with `curl` or a tool such as Postman, using a cookie jar so the session cookie is kept.
- The realtime API is tested with two or more real browser tabs, plus a small script that sends the example messages and checks the replies.
