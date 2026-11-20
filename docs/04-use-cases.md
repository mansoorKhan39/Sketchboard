# Sketchboard — Use Case Document

Nov 14, 2026 · @Mansoor

## 1. Actors

Sketchboard has five human actors. They match the user classes in the SRS (section 2.2). A user can hold different roles on different boards, for example Owner of one board and Viewer of another.

| Actor | Description | Needs an account |
| --- | --- | --- |
| Guest | Opens a shared link without logging in | No |
| Registered user | Has an account and a dashboard of boards | Yes |
| Owner | Registered user who created a board; controls sharing and deletion | Yes |
| Editor | Collaborator who can change a board | Link or account, depending on the share setting |
| Viewer | Collaborator who can only look at a board | Link or account, depending on the share setting |

Supporting systems, not actors: the REST API (accounts and saved boards) and the realtime service (live rooms). They appear inside the flows below.

## 2. Use case diagram

&#91;embedded content: use case diagram · 5 actors, 7 Phase 1 use cases\]

Guests enter through sign up or a share link, registered users manage their boards, and every role that can open a board takes part in the live session (UC-04). Viewers can only watch.

## 3. Use case list

The IDs match the SRS (section 7). Every Phase 1 use case traces to Must requirements, so test cases can later be written from this table.

| ID | Use case | Primary actor | SRS requirements | Phase |
| --- | --- | --- | --- | --- |
| UC-01 | Sign up and log in | Guest | FR-A1, FR-A2, FR-A3 | 1 |
| UC-02 | Create a board | Registered user | FR-B1, FR-B2, FR-B3 | 1 |
| UC-03 | Add and edit objects | Owner, Editor | FR-T1 to FR-T12, FR-C1 to FR-C5 | 1 |
| UC-04 | Work together live | Owner, Editor, Viewer | FR-R1 to FR-R6 | 1 |
| UC-05 | Share a board | Owner | FR-S1, FR-S2, FR-S3 | 1 |
| UC-06 | Join through a link | Guest, Registered user | FR-A5, FR-S4 | 1 |
| UC-07 | Reopen a saved board | Registered user | FR-B4, FR-B5 | 1 |
| UC-08 | Present frames | Owner, Editor | FR-P1, FR-T13 | 2 |
| UC-09 | Export a board | Owner, Editor | FR-P2 | 2 |
| UC-10 | Comment on an object | Owner, Editor | FR-R8 | 2 |
| UC-11 | Run a timed vote | Owner, Editor | FR-F1, FR-F2 | 3 |

## 4. Detailed use cases: UC-01 to UC-04

### UC-01 Sign up and log in

| Field | Description |
| --- | --- |
| Actor | Guest |
| Precondition | The user is on the landing page |
| Main flow | 1. User chooses Sign up. 2. User enters email, display name and password. 3. The system checks the input and creates the account. 4. The system logs the user in and opens the dashboard. |
| Alternate flows | A1. Email already used: the system shows an error and asks for another email. A2. Weak or empty password: the system shows what is wrong. B1. Existing user chooses Log in and enters email and password; wrong details show a generic error, not which one was wrong. |
| Postcondition | The user is logged in and stays logged in after a reload |

### UC-02 Create a board

| Field | Description |
| --- | --- |
| Actor | Registered user |
| Precondition | The user is logged in and on the dashboard |
| Main flow | 1. User clicks New board. 2. The system creates an empty board owned by the user. 3. The empty canvas opens. 4. The board appears in the user's list. |
| Alternate flows | A1. Creation fails (network or server error): the system shows an error and the user can retry. B1. The owner renames or deletes a board from the list; deleting asks for confirmation. |
| Postcondition | A new board exists and the user is its Owner |

### UC-03 Add and edit objects

| Field | Description |
| --- | --- |
| Actor | Owner, Editor |
| Precondition | A board is open and the user can edit it |
| Main flow | 1. User picks a tool (sticky note, shape, pen, text or connector). 2. User clicks or drags on the canvas to create the object. 3. User types text or draws. 4. User selects the object and moves, resizes, rotates, restyles, duplicates or deletes it. 5. User can undo or redo. 6. The system saves the change automatically. |
| Alternate flows | A1. User zooms or pans first (wheel, space and drag). A2. User selects many objects with a drag box and changes them together. A3. Connection is lost: edits stay on the screen and sync when the connection returns (see UC-04). |
| Postcondition | The board contains the new or changed objects and the change is saved |

### UC-04 Work together live

| Field | Description |
| --- | --- |
| Actor | Owner, Editor, Viewer |
| Precondition | At least two users have the same board open |
| Main flow | 1. User A adds or changes an object. 2. The realtime service sends the change to every other user in the room. 3. Other users see the change on their canvas. 4. All users see each other's cursors and names, and the list of who is on the board. |
| Alternate flows | A1. Two users change the same object at the same time: the system merges the changes into one result that is the same for everyone. A2. A Viewer tries to change something: the change is rejected on the server and the Viewer's screen shows the board unchanged. A3. A user's connection drops: the interface shows a clear offline status, then catches up on reconnect. |
| Postcondition | Every user sees the same board state |

## 5. Detailed use cases: UC-05 to UC-07

### UC-05 Share a board

| Field | Description |
| --- | --- |
| Actor | Owner |
| Precondition | The Owner has the board open |
| Main flow | 1. Owner clicks Share. 2. Owner chooses "can view" or "can edit". 3. The system creates a link with a random token. 4. Owner copies the link and sends it. |
| Alternate flows | A1. Owner changes the link from view to edit or back: the same link follows the new setting. A2. Owner turns the link off: the old link stops working at once. |
| Postcondition | The board can be opened through the link with the chosen right, until the Owner turns it off |

### UC-06 Join through a link

| Field | Description |
| --- | --- |
| Actor | Guest, Registered user |
| Precondition | The user has a valid share link |
| Main flow | 1. User opens the link. 2. The system checks the token and reads the allowed right (view or edit). 3. The board opens and the user joins the live room as Viewer or Editor. 4. The user appears in the list of people on the board. |
| Alternate flows | A1. The link is turned off or wrong: the system shows a clear "link not available" page. A2. The user is a Guest: they get a display name such as Guest plus a number and no dashboard. A3. A Viewer tries to edit: the server rejects it (FR-S4). |
| Postcondition | The user is in the room with the right the link allows |

### UC-07 Reopen a saved board

| Field | Description |
| --- | --- |
| Actor | Registered user |
| Precondition | The user is logged in and has at least one board |
| Main flow | 1. User opens the dashboard. 2. User picks a board. 3. The system loads the last saved state. 4. The board opens exactly as it was left, ready for live work. |
| Alternate flows | A1. Loading fails: the system shows an error and a retry button, and no data is changed. A2. The board was deleted: the system shows that it no longer exists. |
| Postcondition | The saved board is open and unchanged |

## 6. Phase 2 and 3 use cases

These are written shorter because they are optional and will be detailed when their phase starts.

| ID | Use case | Precondition | Main flow | Postcondition |
| --- | --- | --- | --- | --- |
| UC-08 | Present frames | The board has at least one frame | Owner or Editor starts presentation, the first frame fills the screen, next and back keys move through frames, Escape ends | Board is unchanged, viewers can follow along |
| UC-09 | Export a board | A board is open | User chooses export, picks PNG or PDF and board or one frame, the file downloads | A file with the chosen content is on the user's device |
| UC-10 | Comment on an object | An object exists and the user can edit | User selects an object and writes a comment; others reply or resolve it | The comment thread is stored with the board |
| UC-11 | Run a timed vote | Board is open, at least two users | Owner starts a timer and sets votes per user; users place votes on objects; when time ends results show | Vote counts are shown on objects and kept until cleared |

## 7. Role permission matrix

The server checks these rules on every read and write; hiding a button is never enough (SRS FR-S4, NFR-9). Phase 2 invitation roles use the same rules.

| Action | Guest (view link) | Guest (edit link) | Viewer | Editor | Owner |
| --- | --- | --- | --- | --- | --- |
| Open and look at the board | Yes | Yes | Yes | Yes | Yes |
| See live cursors and who is online | Yes | Yes | Yes | Yes | Yes |
| Add, move, change, delete objects | No | Yes | No | Yes | Yes |
| Undo and redo own changes | No | Yes | No | Yes | Yes |
| Create share link, change its right | No | No | No | No | Yes |
| Rename the board | No | No | No | No | Yes |
| Delete the board | No | No | No | No | Yes |
| See the dashboard of own boards | No | No | Registered only | Registered only | Yes |

## 8. Update for Stages 6–11 (as built)

The Phase 2 and Phase 3 use cases are built. Where the built flow differs from section 6, this section is the current one.

| ID | Use case | Built flow | Difference from the plan |
| --- | --- | --- | --- |
| UC-08 | Present frames | Owner or Editor presses Present (or Present from here on a frame); the view moves to each frame; arrows, Space, PageUp/PageDown change slide; Esc or Exit ends. Viewers can present too | As planned. Editing and all toolbars are blocked while presenting |
| UC-09 | Export a board | User presses Export PNG; a PNG of all content downloads. An empty board shows a message | PNG only, whole board only (no PDF, no single frame) |
| UC-10 | Comment on the board | User presses C and clicks the board; a pin appears and the thread opens; others reply (Enter), resolve, reopen or delete | The pin sits at a board position, not on an object. No @mentions. Viewers can read, not write |
| UC-11 | Vote | User selects an object and presses Vote (up to 5 votes in total); Remove takes one back; a badge shows the count | Not timed: voting is always open. The timer is a separate use case (UC-15) |
| UC-12 | Add a picture | User presses the image button, drops a file or pastes with Ctrl+V; the browser shrinks it and it appears on the board | New (the plan only said image upload) |
| UC-13 | Save and restore a version | Owner opens History, presses Save a version now; later picks Restore and confirms; the board is replaced and can be undone with Ctrl+Z | Newest 5 versions only. A Before restore copy is saved automatically |
| UC-14 | React | User presses an emoji in the bottom bar; it floats up for about 3.5 seconds | New |
| UC-15 | Run a timer | Editor presses Timer, picks a length, presses Start; Pause and Reset are available; at zero it beeps | Not tied to voting |
| UC-16 | Build a mind map | User selects a note and presses Tab for a child or Enter for a sibling; each new note is linked and ready to type | Mind map only |
| UC-17 | Switch private mode | Editor presses Private; other people's notes show dots until it is switched off | Display only, not security |
| UC-18 | Start from a template | User picks one of 9 templates on the start screen; the board opens fitted to its content | Five templates added to the original four (Mind map, SWOT, Retrospective, Weekly planner, Presentation) |

**Alternative flows common to these use cases.** A viewer sees the board but the tools for adding or changing are hidden or refused. A guest board keeps its own history in the browser; a signed-in board keeps it on the server. If the browser has no space left for a picture or a version, a message says so and nothing is lost.
