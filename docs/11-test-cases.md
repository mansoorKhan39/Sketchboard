# Sketchboard – Test Cases and Reports

Nov 16, 2026 · @Mansoor

All 27 automated tests passed on 16 November 2026 (run time 1.7 seconds); the 27 browser checks last passed during Stage 5 development and are due for a re-run. Deployment cases on Atlas, Vercel and Cloudflare have not been run yet (section 6).

## 1. Introduction

**Purpose.** List every test case for Sketchboard with its steps, expected result and recorded result, as planned in the Software Test Plan.

**Case ids**

| Prefix | Meaning | Section |
| --- | --- | --- |
| TC-A | API test (automated, `api/_tests`) | 2 |
| TC-U | Unit test of operations (automated, `src/realtime/ops.test.ts`) | 2 |
| TC-B | Browser system test | 3 |
| TC-C | Collaboration, security and resilience test in browsers | 4 |
| TC-D | Deployment check on real services | 6 |

**Result values.** *Pass*: actual equals expected. *Fail*: differs, a defect is raised. *Not run*: not yet executed. *Manual*: done by a person, no script.

**Environment of this run.** Node 22, Linux, API tested with the memory store, browser scripts with the file store and a local Worker (`wrangler dev`, real Workers runtime), headless Chromium. Production services were not used.

**How to repeat**

```
cd web && npm test                         # 27 automated cases
npm run dev                                # then run the browser scripts
  (e2e-solo.cjs: realtime unreachable; e2e-rt.cjs: needs wrangler dev on port 8787)
```

## 2. Automated cases (27 of 27 passed)

These are the exact test names from `npm test`, run on 16 November 2026. Each runs against the API core or the operation functions directly, with no network.

**Accounts and security (`api.test.ts`, 12 cases)**

| Id | Case | Expected result | Result |
| --- | --- | --- | --- |
| TC-A01 | Register a new user | Signed in; session cookie is HttpOnly and SameSite | Pass |
| TC-A02 | Register over plain http (local) | Cookie is not marked Secure | Pass |
| TC-A03 | Register with a used e-mail, and with weak input | 409 for duplicate; 400 with a friendly message for weak input | Pass |
| TC-A04 | Login; wrong password; unknown e-mail | Login works; both failures give the same message | Pass |
| TC-A05 | Logout | Session cleared | Pass |
| TC-A06 | Non-GET request without `X-Sketchboard: 1` | Blocked (CSRF defence) | Pass |
| TC-A07 | Board routes without login | 401 | Pass |
| TC-A08 | Board lifecycle | Create, list, read, save, rename, duplicate, delete all work | Pass |
| TC-A09 | Another user reads, changes or deletes my board | 404 each time | Pass |
| TC-A10 | Invalid board input | Rejected with an error | Pass |
| TC-A11 | Forged, edited and expired session tokens | All rejected | Pass |
| TC-A12 | Unknown address | Clean 404 | Pass |

**Sharing and realtime access (`share.test.ts`, 7 cases)**

| Id | Case | Expected result | Result |
| --- | --- | --- | --- |
| TC-A13 | Owner asks for a join token | Token that the realtime service can verify | Pass |
| TC-A14 | Join and share with realtime not configured | 503 `realtime_not_configured` | Pass |
| TC-A15 | Share link default, then enabled; guest joins | Off by default; guest gets the link's right (view or edit) | Pass |
| TC-A16 | Turn the link off, or regenerate it | Old link stops working | Pass |
| TC-A17 | Non-owner changes sharing or asks for an owner token | Refused | Pass |
| TC-A18 | Signed-in user opens someone's link; owner opens own link | User keeps account name; owner keeps owner role | Pass |
| TC-A19 | Internal room endpoints without the secret | Refused | Pass |

**Operations (`ops.test.ts`, 8 cases)**

| Id | Case | Expected result | Result |
| --- | --- | --- | --- |
| TC-U01 | Diff with nothing changed | No operations | Pass |
| TC-U02 | Diff with add, change and remove | `add`, `set` with only changed fields, `remove` | Pass |
| TC-U03 | Apply add, set, remove | Board matches expected | Pass |
| TC-U04 | Apply does not modify its input array | Original array unchanged | Pass |
| TC-U05 | Apply the same operations twice | Same result as once (retries are safe) | Pass |
| TC-U06 | Change something another person deleted | Ignored, no error | Pass |
| TC-U07 | Two people change different fields; and the same field | Both fields kept; same field: last one wins | Pass |
| TC-U08 | Two screens apply the same edits in the same order | Boards end up identical | Pass |

## 3. Browser system cases: drawing, saving, accounts

These cases were checked in a real browser (Chromium) while Stages 1 to 4 were built. The scripts for them were not kept, so they are written here as steps a person can repeat in about 15 minutes. The result column says what was observed then; the tester ticks it again in the next full run.

| Id | Steps | Expected result | Last result |
| --- | --- | --- | --- |
| TC-B01 | Press N, click the board, type text | Yellow sticky appears with the text | Pass |
| TC-B02 | Press S, drag on the board; change kind to ellipse and diamond | Shape of the chosen kind is drawn | Pass |
| TC-B03 | Press P, drag a line | Pen stroke follows the pointer | Pass |
| TC-B04 | Press T, click, type | Text object appears | Pass |
| TC-B05 | Press L, click two objects | Connector joins them; moving one object moves the line | Pass |
| TC-B06 | Press V, drag a box over several objects, then drag one | All selected objects move once, by the same distance | Pass |
| TC-B07 | Select an object, drag a corner handle, rotate | Object resizes and rotates | Pass |
| TC-B08 | Ctrl+C, Ctrl+V, Ctrl+D, Delete | Copy, paste, duplicate and delete work | Pass |
| TC-B09 | Ctrl+Z, Ctrl+Shift+Z | Last action undone, then redone | Pass |
| TC-B10 | Wheel up and down over a point; Space+drag; Shift+1 | Zoom keeps the point under the pointer; pan works; fit shows all objects | Pass |
| TC-B11 | Zoom far in and far out | Scale stops at 0.1 and 4 | Pass |
| TC-B12 | As guest, create a board, add objects, reload | Board and objects are still there | Pass |
| TC-B13 | Create boards from Blank, Brainstorm, Kanban and Flowchart | Each opens with its template content | Pass |
| TC-B14 | Register, reload, log out, log in | Stays signed in after reload; login works | Pass |
| TC-B15 | Log in with a wrong password | Friendly error, no field name in the message | Pass |
| TC-B16 | Signed in: create a board, draw, reload | Board loads from the server with its objects | Pass |
| TC-B17 | Rename, duplicate and delete a board from the dashboard | Each change shows in the list | Pass |
| TC-B18 | Switch light and dark mode on dashboard and board | Colours change; dark ink stays readable | Pass |
| TC-B19 | Open the start screen of an empty board | Hint card shown and canvas still accepts clicks | Pass |

## 4. Collaboration, security and resilience cases

These run as Playwright scripts. `e2e-rt.cjs` uses three browser windows and the local Worker (22 checks); `e2e-solo.cjs` runs with the Worker switched off (4 checks). Each check printed Pass in the Stage 5 run.

**Live collaboration (`e2e-rt.cjs`)**

| Id | Check | Expected result | Last result |
| --- | --- | --- | --- |
| TC-C01 | Owner opens a board | Status shows Live | Pass |
| TC-C02 | Owner creates a share link | Link has the form `#/s/<token>` | Pass |
| TC-C03 | Guest opens the link | Sees the owner's sticky (room state); is not view-only | Pass |
| TC-C04 | Guest joins | Owner sees one peer avatar | Pass |
| TC-C05 | Guest adds a sticky | Appears on the owner's screen | Pass |
| TC-C06 | Owner adds a sticky | Appears on the guest's screen | Pass |
| TC-C07 | Guest moves the pointer | Owner sees the guest's cursor | Pass |
| TC-C08 | Owner presses undo | Own sticky disappears on both screens; guest's sticky stays | Pass |
| TC-C09 | Guest connection is dropped on purpose and an edit is made offline | Guest shows reconnecting, returns to Live; the edit reaches the owner | Pass |
| TC-C10 | Second link opened as view-only | View-only badge; toolbar has only the select tool | Pass |
| TC-C11 | Viewer tries to add or delete | Nothing changes on either screen | Pass |
| TC-C12 | Forged edit sent by a viewer straight to the socket | Room answers `reject:forbidden` | Pass |
| TC-C13 | Edits sent faster than 20 per second | Some are accepted, some rejected (rate limit) | Pass |
| TC-C14 | Invalid object sent to the room | Room answers `reject:invalid` | Pass |
| TC-C15 | Join with a bad token | Socket closes with code 4001 | Pass |
| TC-C16 | Open a disabled link | Error page saying the link is not active | Pass |
| TC-C17 | Wait for the room to save, read the database | Saved board contains the edits from both people, including the offline edit | Pass |
| TC-C18 | Watch the browser console | No page errors | Pass |

The script prints 22 check lines; TC-C01 to TC-C18 group them by purpose (for example the three owner and guest edit checks share TC-C05 and TC-C06).

**Realtime unreachable (`e2e-solo.cjs`)**

| Id | Check | Expected result | Last result |
| --- | --- | --- | --- |
| TC-C19 | Open a cloud board with no Worker running | Shows Connecting first | Pass |
| TC-C20 | Wait a few seconds | Client gives up and the status reads Saved (works alone) | Pass |
| TC-C21 | Edit while connecting | Edit is saved by the normal save route | Pass |
| TC-C22 | Watch the browser console | No page errors | Pass |

**Run on the developer's machine.** Two windows on one board showed Live, drawing and cursors synced, avatars and the share dialog worked, and dark mode worked (confirmed with screenshots, Stage 5).

## 5. Test execution report

All 27 automated cases passed with 0 failures; every browser case recorded so far passed; nothing from the deployment list has been run.

| Group | Cases | Passed | Failed | Not run | How run |
| --- | --- | --- | --- | --- | --- |
| API: accounts and security (TC-A01 to A12) | 12 | 12 | 0 | 0 | `npm test`, 16 Nov 2026 |
| API: sharing and access (TC-A13 to A19) | 7 | 7 | 0 | 0 | `npm test`, 16 Nov 2026 |
| Operations (TC-U01 to U08) | 8 | 8 | 0 | 0 | `npm test`, 16 Nov 2026 |
| Browser: drawing, saving, accounts (TC-B01 to B19) | 19 | 19 | 0 | 0 | Browser, Stages 1 to 4 |
| Browser: collaboration and resilience (TC-C01 to C22) | 22 | 22 | 0 | 0 | Playwright, Stage 5 |
| Deployment (TC-D01 to D08) | 8 | 0 | 0 | 8 | Not yet run |
| **Total** | **76** | **68** | **0** | **8** |  |

**Pass rate of cases run:** 68 of 68. **Exit criteria** from the Test Plan: automated tests pass (met); browser scripts pass (met on local setup); no open Critical or High defect (met); deployment check run once (not met yet). The release is therefore accepted for local use and held for deployment.

**Limits of this report.** Only Chromium was automated. Realtime ran on a local Worker, not on Cloudflare's network. The browser cases in section 3 should be ticked again in the next full run because their scripts were not saved.

## 6. Deployment cases (not yet run)

Run these once after following `DEPLOY.md`. Replace `Not run` with the real result and add screenshots.

| Id | Steps | Expected result | Result |
| --- | --- | --- | --- |
| TC-D01 | Open the Vercel address | Site loads; dashboard shown; no console errors | Not run |
| TC-D02 | Register on the live site, reload | Account created in Atlas; still signed in; cookie has the Secure flag | Not run |
| TC-D03 | Create a board, draw, reload | Board loads from Atlas with its objects | Not run |
| TC-D04 | Open `https://<worker>/health` | Answers `ok` | Not run |
| TC-D05 | Open a board; read the status | Shows Live over `wss://` | Not run |
| TC-D06 | Share a link; open it in a private window | Guest sees the board; edits sync both ways | Not run |
| TC-D07 | Edit, close all windows, wait 10 seconds, reopen | Edits are saved to Atlas by the room | Not run |
| TC-D08 | Set a wrong `REALTIME_SECRET` on one side | Join fails cleanly; board still works alone | Not run |

**Manual checks outside automation**

- [ ] Firefox and Edge: draw, undo, zoom, dark mode
- [ ] Two real devices on one board (phone and laptop)
- [ ] Usability: two classmates create a board, add a note and share it with no help
- [ ] A board with about 1,000 objects pans and zooms smoothly
- [ ] Save of exactly 5,000 objects is accepted; 5,001 is refused

## 7. Defects, observations and sign-off

No defect is open. Five were found and fixed while building; each was re-tested and the later test runs passed.

**Defects found and fixed**

| Id | Defect | Severity | Found by | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| DEF-01 | Endless redraw when a panel filtered an array inside a store selector | High | Browser | Select the raw array, filter outside | Closed |
| DEF-02 | Sticky and text editor did not open (focus taken by the browser) | High | Browser | Focus after 30 ms | Closed |
| DEF-03 | Moving several objects moved them twice | Medium | Browser | Removed custom drag code; read final positions on drag end | Closed |
| DEF-04 | Start hint card blocked canvas clicks | Medium | Browser | Card made non-interactive | Closed |
| DEF-05 | Validation message showed a field name such as "password: ..." | Low | Browser | Plain messages for account forms | Closed |

**Known limits (accepted, not defects)**

- Stacking order is not synced between people.
- Every guest is named "Guest".
- Creating a sticky and typing its text are two undo steps.
- No login attempt limit, e-mail check or password reset.
- Turning sharing off does not disconnect people already in the room.

**Sign-off**

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Tester | Mansoor Ali Khan |  |  |
| Supervisor |  |  |  |
