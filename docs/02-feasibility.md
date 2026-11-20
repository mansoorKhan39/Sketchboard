# Sketchboard — Feasibility Study

Nov 14, 2026 · @Mansoor

## 1. Verdict

Phase 1 of Sketchboard (canvas, collaboration, accounts, save and share) is feasible at zero cost. Phases 2 and 3 (pictures, frames, comments, version history, timer, voting, reactions, mind map, private mode and templates) were added afterwards and are built at zero cost as well. A full Miro copy is still not feasible.

Updated for Stages 6–11 (pictures, frames, comments, history, timer/voting/reactions, mind map, private mode, templates). These features pass the automated tests and browser checks; live sync of the new features over the real Cloudflare Worker and the real MongoDB Atlas `versions` collection have not been verified yet.

| Area | Verdict | Main reason |
| --- | --- | --- |
| Technical | Feasible | All needed libraries and services exist; live sync is the hardest part |
| Financial | Feasible | Every service has a free plan with no credit card |
| Operational | Feasible | Web app, no installation, one person can run it |
| Schedule | Feasible; Phases 1 to 3 are built | A full Miro alternative is estimated at 6 to 9 months of work |
| Legal | Feasible | Own name, design and code; no Miro assets |

## 2. Technical feasibility

The author already works with React, Node.js and MongoDB from earlier projects, so the main learning is the canvas and live sync.

| Challenge | Difficulty | How it is handled |
| --- | --- | --- |
| Infinite canvas with zoom and pan | Low | Konva stage with scale and position |
| Drawing and editing objects | Medium | Konva shapes and transformers, objects stored as typed data |
| Live sync of many users | High | One Cloudflare Durable Object per board; a conflict-free merge approach |
| Undo and redo in a shared board | Medium | Per-user history of own operations |
| Performance with many objects | Medium | Draw only visible objects; test with 500 objects |
| Persistence | Low | Board snapshots saved to MongoDB Atlas |
| Auth and permissions | Medium | Hashed passwords, token sessions, server-side role checks |
| Pictures and Export PNG | Medium | Free hosting has no file storage, so the browser shrinks the picture and stores it as text inside the board object; Export PNG draws all content in the browser |
| Frames and presentation mode | Low | Frames are board objects; the view glides to each frame using small tested helper functions |
| Comments, voting, timer and reactions | Low | All are stored as board objects, so they sync like any other object; the timer stores a clock time so all screens agree |
| Version history | Medium | Separate MongoDB collection (versions); newest 5 kept per board; total size per board capped at 8,000,000 characters |

Vercel cannot host WebSocket servers because it runs serverless functions, so the realtime part goes to Cloudflare. A fallback is a Socket.io server on a free container host, as long as one is available without a credit card.

Larger Miro boards with 100 or more users or 500 or more sticky notes are reported to lag even in commercial tools, so Sketchboard's targets are set lower on purpose (10 editors, 500 objects).

**Pictures and versions (Stages 6 and 9).** A picture is shrunk in the browser (longest side 800 down to 240 pixels, WebP or JPEG) until its text is at most 150,000 characters, and it is stored inside the board object. The realtime server accepts a normal object up to 64,000 characters and an image object up to 200,000 characters; the board limit stays at 5,000 objects and 3 MB. MongoDB allows 16 MB per document, so a board stays far below it. Saved versions are kept in their own collection, one document per board, capped at 8,000,000 characters, which is also under 16 MB. Big boards therefore keep fewer than 5 versions, but the newest always survives. Atlas free storage is 512 MB in total and now also holds versions.

**Realtime message load (Stages 8 to 10).** Votes, comments, timer changes and reactions are extra messages, and they count against the Cloudflare free limit like any edit. Reactions are limited to one per 0.4 seconds per person, and a reaction is removed again about 4 seconds after it is sent. There is no new service and no new cost.

**Known limits.** Two people replying to the same comment at the same moment: the last write wins. Private mode only changes what is displayed; hidden text still reaches every browser. The timer depends on each computer's clock, so screens can differ by a few seconds. Only the board owner can save and restore versions.

## 3. Financial feasibility

Total cost is USD 0 for development and for a demo-scale launch. The only real limit is how much traffic the free plans allow.

| Service | Free-plan limit that matters | Cost |
| --- | --- | --- |
| Cloudflare Durable Objects | 100,000 requests per day; operations fail after that; incoming WebSocket messages count at 20 to 1; 5 GB SQLite storage | USD 0 |
| Vercel (client and REST API) | Serverless functions with short time limits; no WebSocket support | USD 0 |
| MongoDB Atlas | Small free cluster, 512 MB storage, which now also holds saved versions (up to about 8 MB for a big board); check the current size before launch | USD 0 |
| GitHub | Free public or private repositories | USD 0 |

**Capacity estimate (our own calculation).** Assume an active user sends about 10 edit messages per second while drawing. That is 36,000 messages per hour, which Cloudflare bills as 1,800 requests (36,000 divided by 20). With 100,000 requests per day, the free plan covers about 55 hours of continuous drawing per day, spread over all users. That is enough for a class demo and testing, but not for a public product. Sending fewer messages (for example, batching strokes) raises this number.

If the free limit becomes a problem, the Workers paid plan starts at USD 5 per month, which is outside this project's budget and is not planned.

## 4. Operational and schedule feasibility

**Operational.** Users only need a browser and a link, and the system has no servers to maintain because all parts run on managed free platforms. One person can deploy and fix it. The main operational risk is a free plan changing its rules, so limits are rechecked before each release.

**Schedule.** Commercial estimates for a full Miro alternative with a custom canvas, conflict-free collaboration, facilitation tools and workspace management are 6 to 9 months. A simpler whiteboard built on an existing open-source editor is estimated at 3 to 5 weeks. Sketchboard builds its own canvas, so Phase 1 sits between these two figures and is realistic for one semester if scope is held.

| Phase | Realistic for one semester | Condition |
| --- | --- | --- |
| 1 (MVP) | Yes | Stages are built in order and documents are written alongside |
| 2 | Yes, built | Built in Stages 6 to 9 after Phase 1 passed testing |
| 3 | Yes, built | Built in Stages 10 and 11 |

## 5. Legal and ethical feasibility

An online whiteboard is a general idea, and anyone may build one. What is not allowed is copying Miro's protected material, so Sketchboard follows these rules.

| Topic | Rule |
| --- | --- |
| Name and branding | Own name Sketchboard; no Miro name, logo, icons or screenshots |
| Code | Written from scratch; open-source Miro clones are read to learn, not copied |
| Design and templates | Original, or free assets whose licence allows use; licences are listed in the SCD |
| Libraries | Each library's licence is checked before use |
| User data | Only email, display name and board content are stored; passwords are hashed |
| Content | Users own their boards; the owner can delete a board and its data |

This is a student project and not legal advice; if Sketchboard is ever released publicly, a lawyer should review the terms and privacy notice.

## 6. Recommendation, conditions and sources

Proceed with Sketchboard Phase 1. Phases 2 and 3 were added after Phase 1 passed testing and are now built; the next step is to redeploy the Cloudflare Worker and verify them on the real services. The recommendation holds if these conditions stay true:

- [ ] Cloudflare Durable Objects stay available on the free plan without a credit card
- [ ] Free-plan limits of Vercel and MongoDB Atlas are rechecked before deployment
- [ ] Scope stays at the built features (Phases 1 to 3) until the course deadline is known
- [ ] A live-sync prototype with two browsers works early (by the end of Stage 3); if it does not, switch to the fallback host
- [ ] Atlas storage is rechecked, because saved versions add up to about 8 MB for a big board
- [ ] The Cloudflare Worker is redeployed, or live editing refuses the new object types

### Sources

- [Cloudflare, Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)
- [Cloudflare, Durable Objects on the Workers Free plan (release notes)](https://developers.cloudflare.com/durable-objects/release-notes/)
- [RapidDev, Build Your Own Miro Alternative (effort estimates)](https://www.rapidevelopers.com/md/clone/miro)
- [RapidDev, Miro clone analysis (large board lag)](https://rapidevelopers.com/clone/miro)
- [Free Backend Hosting: 7 Platforms (SnapDeploy)](https://dev.to/snapdeploy/free-backend-hosting-7-platforms-that-wont-kill-your-api-2026-1i1g)

## Appendix: Update for Stages 6–11

The new features were built with the same free, card-free services. No new service was added.

| Question | Finding |
| --- | --- |
| Where do pictures live? | Inside the board data (150,000 characters max each). No file storage service needed. Cost: zero. Trade-off: large pictures must be small. |
| Do versions fit the free database? | Yes. Newest 5 per board, 8,000,000 characters cap, kept in a separate collection. This stays under the 16 MB document limit. Atlas free is 512 MB, so about 50 boards at the maximum. |
| Do the new live features fit the free Worker? | Yes. Votes, comments and reactions are small objects. Reactions are limited to once per 0.4 s and removed after 3.5 s, which keeps traffic low. |
| Is realtime still within free limits? | Yes for class and small-team use. Heavy use by many boards at once could reach the Cloudflare free request limits. |

**Conclusion:** the project is still feasible at zero budget. The main risk is storage when many boards use pictures and versions. This is documented in the Maintenance document.
