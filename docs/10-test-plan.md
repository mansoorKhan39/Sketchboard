# Sketchboard – Software Test Plan

Nov 16, 2026 · @Mansoor

This plan says what will be tested in Sketchboard, how, with which tools, and when testing is considered finished. It covers the code up to Stage 11: whiteboard, accounts, saving, sharing, live collaboration, pictures and Export PNG, frames and presentation, comments, version history, timer, voting and reactions, mind map, private mode and templates.

## 1. Introduction

**Purpose.** Give one agreed way to check that Sketchboard does what the SRS asks, so that a failed check can be found, reported and fixed in a repeatable way.

**Scope.** The website (`web/src`), the API (`web/api`) and the realtime service (`realtime`). Hosting platforms themselves (Vercel, MongoDB Atlas, Cloudflare) are not tested; only how Sketchboard uses them is.

**Related documents**

| Document | Used for |
| --- | --- |
| SRS | Requirements that each test area traces back to |
| Use Case Document | Scenarios used as system tests |
| API Documentation | Expected status codes and error bodies |
| SCD | How the code works, test commands, known limits |
| Test Cases and Reports (next document) | The detailed cases and their recorded results |

**Terms.** *Guest* means not logged in (boards stay in the browser). *Owner* is the person who created a board. *Editor* and *viewer* are the rights a share link gives. *Room* is the live copy of one board in Cloudflare.

## 2. Test items and features

**Features to be tested**

| Area | What is checked | Main layer |
| --- | --- | --- |
| Drawing tools | Sticky, shape (rect, ellipse, diamond), pen, text, connector create and look correct | Browser |
| Selection and editing | Click, marquee, move many together, resize, rotate, delete, duplicate, copy and paste | Browser |
| Pan and zoom | Wheel zoom around pointer, Space-drag pan, fit to content, zoom limits 0.1 to 4 | Browser |
| Undo and redo | Own actions only; collaborator edits are kept | Unit, browser |
| Guest saving | Board survives reload; boards list works | Browser |
| Accounts | Register, login, logout, wrong password, duplicate email, session cookie | API, browser |
| Cloud boards | Create, open, save, rename, duplicate, delete; only the owner can reach them | API, browser |
| Share links | Enable, view or edit right, regenerate link, disable | API, browser |
| Live collaboration | Edits, cursors, avatars appear in a second window; viewers cannot edit | Browser, realtime |
| Offline fallback | When realtime is down the board still saves normally | Browser |
| Operations (diff and apply) | `diffOps` and `applyOps` give the right result and are safe to repeat | Unit |
| Security rules | CSRF header, ownership 404, input limits, internal key, rate limit | API, realtime |
| Themes and layout | Light and dark mode, dashboard, templates | Browser (manual) |

**Features not tested**

- Real hosting accounts: MongoDB Atlas, Vercel and Cloudflare production. These are checked once by the developer after following `DEPLOY.md` (see risks in section 7).
- A separate file store for pictures. It does not exist on free hosting: a picture is kept inside the board object (see the limits in section 2).
- Heavy load with many hundreds of people on one board. Only the rate limit logic is tested, not capacity.
- Mobile touch gestures beyond the basics, and Safari. Only Chromium is automated.
- Password reset and email verification (not built).

**Test items.** The code as delivered in `sketchboard-stage5-realtime.zip`, using Node 22.

## 3. Test approach

Testing goes from small and fast to large and slow. A fault should be caught at the lowest level that can see it.

**Levels**

| Level | What it tests | How | Automated |
| --- | --- | --- | --- |
| Unit | Single functions with no network: `diffOps`, `applyOps` | `node:test` through `tsx` | Yes (32 tests: 8 operation tests and 24 feature-logic tests) |
| API (component) | The whole API core called directly with a memory store: accounts, boards, sharing, join passes | `node:test`, no server needed | Yes (25 tests) |
| Integration | Website + API + file store together; Worker + Room on the real Workers runtime (`wrangler dev`) | Playwright and a local Worker | Yes (scripts) |
| System | Complete user stories end to end in a real browser, with two windows for collaboration | Playwright, headless Chromium | Yes (scripts) |
| Acceptance | Developer uses the app and compares with the SRS and use cases | Manual, with screenshots | No |

**Types of testing**

- **Functional:** each feature in section 2 works as the SRS says, with valid and invalid input.
- **Security:** missing CSRF header gives an error; another user's board gives 404; a viewer's edit is refused; internal routes need the secret; expired or forged tokens are refused; oversized bodies are refused.
- **Resilience:** the socket is dropped on purpose (`__dropSocket` hook in the dev build) and the client must reconnect or fall back to normal saving without losing the board.
- **Usability:** a person who has never seen the tool should create a board, add a note and share it without help. Checked by the developer and by at least two classmates.
- **Compatibility:** latest Chromium is automated; Chrome, Edge and Firefox are checked by hand; light and dark theme.
- **Performance (light):** a board with 1,000 objects should still pan and zoom smoothly; a 5,000-object save must be accepted and a larger one refused. No formal load test.

**Techniques.** Equivalence classes and boundary values for input (for example 5,000 and 5,001 objects, password length limits, zoom 0.1 and 4); state transitions for share settings and connection state (off, connecting, live); error guessing for security cases.

**Regression.** `npm test` runs after every code change, and the browser scripts run before each release. A fixed bug gets a new test so it cannot return.

## 4. Test environment, tools and data

**Environment**

| Item | Setting |
| --- | --- |
| Runtime | Node 22 |
| Browser | Chromium (headless for automated runs); Chrome and Edge by hand |
| Website and API | `npm run dev` on port 5173, file store in `web/.data/db.json` |
| Realtime | `wrangler dev --port 8787` (real Workers runtime, local) with `REALTIME_SECRET` from `.dev.vars` |
| Database | Memory store in automated API tests; file store in browser tests; Atlas only in the final deployment check |
| Operating system | Linux (automated); Windows (developer's own machine) |

**Tools**

| Tool | Use |
| --- | --- |
| `node:test` with `tsx` | Unit and API tests (`npm test`) |
| `tsc` (strict) | Type check; part of `npm run build` |
| Playwright | Browser scripts for solo and two-window checks |
| Browser developer tools | Network tab (WebSocket frames), console errors |
| curl | Quick API checks and the `/health` address of the Worker |

**Test data**

- Accounts: made up by the tests, for example `a@test.dev`, `b@test.dev`, password of 8 or more characters. No real personal data is used.
- Boards: created by the test or from the templates (Blank, Brainstorm, Kanban, Flowchart, Mind map, SWOT analysis, Retrospective, Weekly planner, Presentation with 3 frames).
- Limits: generated boards with 5,000 and 5,001 objects, and a 3 MB body.
- Reset: delete `web/.data` and restart the dev server before each browser run so old accounts do not cause a duplicate-email error.

**Environment rule.** Tests never use production secrets. The local `REALTIME_SECRET` is a throw-away value.

## 5. Entry, exit, suspension and resumption criteria

**Entry (testing may start when)**

- The code builds with `npm run build` and has no type errors.
- The dev server and the local Worker start.
- Test accounts and a clean `.data` folder are ready.

**Exit (a release is accepted when)**

- All automated tests pass (currently 57 of 57).
- All browser scripts pass, including the reconnect fallback.
- Every must-have requirement in the SRS has at least one passed test case.
- No open defect of severity Critical or High; Medium defects are listed in the report with a plan.
- The deployment check in the Deployment Document has been run once on real Atlas, Vercel and Cloudflare.

**Suspend testing when**

- The build fails or the dev server cannot start.
- A Critical defect (data loss, login broken, board of another user visible) is found; it is fixed first.
- The environment is wrong, for example `REALTIME_SECRET` differs between site and Worker.

**Resume when** the cause is fixed and the failed area plus a quick smoke test (create board, add note, reload) pass again.

## 6. Roles, schedule and deliverables

**Roles**

| Role | Person | Duty |
| --- | --- | --- |
| Developer and tester | Mansoor Ali Khan | Runs tests, records results, fixes defects |
| Code and test assistant | Claude | Wrote the code and the automated tests, ran the browser checks |
| Supervisor | To be named | Reviews the plan and the report |
| Trial users | Two or more classmates | Usability check with no help |

If this is a group project, add the other members here.

**Schedule.** Dates are to be set with the supervisor's deadline. Order of work:

1. Run `npm test` and the browser scripts on the delivered Stage 11 code.
2. Fill the Test Cases and Reports document with the real results.
3. Follow `DEPLOY.md` and run the deployment check on Atlas, Vercel and Cloudflare.
4. Usability session with trial users.
5. Fix defects, re-run, and sign off.

**Deliverables**

| Deliverable | When |
| --- | --- |
| This test plan | Now |
| Test Cases and Reports | Next document |
| Automated test output (`npm test`) | Each run |
| Browser script logs and screenshots | Each release |
| Defect list | Kept up to date during testing |

## 7. Risks and mitigation

| Risk | Effect | Likelihood | Mitigation |
| --- | --- | --- | --- |
| Atlas, Vercel and Cloudflare never tested on real accounts | Bugs found only at deployment | High | Run the deployment check early; keep the file store and local Worker as a fallback demo |
| Local Worker differs from Cloudflare production | Live collaboration fails online | Medium | `wrangler dev` uses the real Workers runtime; run the two-window script against the deployed Worker as well |
| Only Chromium is automated | Firefox or Safari bug missed | Medium | Manual pass on Firefox and Edge before release |
| Canvas behaviour is hard to test from code | Visual bugs missed | Medium | Screenshots in the report; manual checklist for drawing tools |
| Free-tier limits reached during a demo | Realtime or saving stops | Low | Keep demo short; the client falls back to normal saving |
| Stale data from earlier runs | False failures such as duplicate email | Medium | Clean `.data` and restart before each browser run |
| `protocol.ts` copy drifts between `web` and `realtime` | Messages not understood | Low | Compare the two files in the release checklist |
| Test time is short | Features untested | Medium | Test in order of risk: security, saving, collaboration, then looks |

## 8. Defect management

**Severity** (how bad it is)

| Level | Meaning | Example |
| --- | --- | --- |
| Critical | Data loss, security hole, app unusable | A user opens another user's board |
| High | Main feature broken, no workaround | Login fails; edits do not reach a second window |
| Medium | Feature broken but a workaround exists | Undo of a new sticky takes two steps |
| Low | Cosmetic or small annoyance | Misaligned icon in dark mode |

**Priority** (when to fix): P1 now, P2 before release, P3 later. Critical is always P1.

**Life cycle:** New, Confirmed, In progress, Fixed, Re-tested, Closed. A defect that cannot be repeated is marked Cannot reproduce; one that will not be fixed is marked Deferred with the reason.

**Each defect records:** id, title, steps to repeat, expected and actual result, severity, priority, build or zip name, screenshot or log, status.

**Rule.** A fixed defect is closed only after the failing case and the smoke test pass again, and a new automated test is added where the layer allows it.

**Defects already found and fixed during development** (all re-tested)

| Defect | Layer | Fix |
| --- | --- | --- |
| Endless redraw when a panel filtered an array inside a store selector | Frontend | Select the raw array, filter outside |
| Sticky and text editor did not open (browser took the focus) | Frontend | Focus after 30 ms |
| Moving several objects moved them twice | Frontend | Removed custom drag code; read final positions on drag end |
| Start hint card blocked canvas clicks | Frontend | Made it non-interactive |
| Validation message showed a field name such as "password: ..." | API | Plain friendly messages for auth |

## 9. Traceability and current status

Every feature area has a test layer, so no requirement is left without a check. Exact requirement numbers from the SRS are mapped to case ids in the Test Cases and Reports document.

| Area | Unit | API | Browser | Status today |
| --- | --- | --- | --- | --- |
| Drawing tools and objects |  |  | Yes | Passed in browser checks |
| Selection, move, undo, redo | Yes |  | Yes | Passed |
| Pan and zoom |  |  | Yes | Passed |
| Guest saving |  |  | Yes | Passed |
| Accounts |  | Yes | Yes | Passed |
| Cloud boards and ownership |  | Yes | Yes | Passed (file and memory store) |
| Share links and rights |  | Yes | Yes | Passed |
| Live collaboration | Yes |  | Yes | Passed locally, two windows |
| Reconnect and fallback |  |  | Yes | Passed |
| Security rules |  | Yes |  | Passed |
| MongoDB Atlas store |  |  |  | Not yet run |
| Vercel and Cloudflare deployment |  |  |  | Not yet run |

**Summary of results so far:** 57 of 57 automated tests pass (13 account, board and picture API, 7 sharing API, 5 version API, 8 operation tests and 24 feature-logic tests for pictures, frames, comments, timer, votes, reactions, mind map, private mode and templates), and the browser scripts for solo drawing, two-window collaboration and the reconnect fallback pass on the local setup. Detailed results are in the next document.

## Appendix: Update for Stages 6–11

### Added scope

Pictures, frames and Present mode, comments, version history, timer, voting and reactions, mind map keys, private mode and five new templates.

### Test inventory now

| Level | Files | Tests |
| --- | --- | --- |
| API | `api.test.ts` (13), `share.test.ts` (7), `versions.test.ts` (5) | 25 |
| Realtime operations | `ops.test.ts` | 8 |
| Client logic | `pictures` (4), `frames` (4), `comments` (4), `extras` (7), `mindmap` (5) | 24 |
| **Total** | run with `npm test` in `web/` | **57** |

Browser scripts (Playwright, in `web/e2e/`): images, frames (20 checks), comments (11), history (19), extras (21), stage11 (13), plus solo and rt. The `rt` script needs `wrangler dev` running.

### New risks and how they are tested

| Risk | Test |
| --- | --- |
| Object type list out of sync in 3 places, so live editing refuses a type | Ops tests plus the rule in the Maintenance document |
| Overlay objects counted in selection, export or Fit | `extras.test.ts`, `e2e-extras` |
| Two people vote at once and one vote is lost | `extras.test.ts` (votes are separate objects) |
| Version list grows past the 16 MB document limit | `versions.test.ts` (newest 5, 8,000,000 char cap) |
| Restore breaks undo or live sync | `e2e-history` |
| Viewer can comment, vote or restore | `comments.test.ts`, `e2e-comments`, `versions.test.ts` |

### Not covered by automation

Two-window live sync of the new features, real Atlas, real Vercel and Cloudflare. These are manual cases (TC-C23–C28, TC-D09–D14).

### Exit criteria

All automated tests pass (met). No open Critical or High defect (met). Deployment checks run at least once (not met).
