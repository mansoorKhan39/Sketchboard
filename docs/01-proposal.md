# Sketchboard — Project Proposal

Nov 14, 2026 · @Mansoor

## 1. Background and problem

Teams that work remotely need a shared space to sketch ideas, plan and give feedback, and online whiteboards such as Miro have become the standard tool for this. Miro is a commercial product: its free plan limits the number of editable boards and keeps features such as timer, voting and video chat for paid plans, and paid plans are priced per user per month.

For students, small teams and early-stage groups in Pakistan, a paid per-seat tool is a real cost, and a free plan with limits is often not enough for a full semester project or a workshop. At the same time, building a collaborative whiteboard is a good way to learn real-time systems, which is a topic that software engineering courses and interviews ask about often.

## 2. Proposed solution and objectives

We propose Sketchboard, a free web whiteboard with an infinite canvas, sticky notes, shapes, pen, text and connectors, where many people edit the same board live. It follows the familiar Miro-style workflow but uses its own name, design and code.

| No. | Objective | How we will know |
| --- | --- | --- |
| 1 | Build a working collaborative whiteboard (Phase 1) | All Must requirements in the SRS pass testing |
| 2 | Let several users edit one board live | At least 10 editors on one board in a test, edits visible in under 100 ms |
| 3 | Save and share boards | A board reopens as saved, and a share link opens it with view or edit rights |
| 4 | Run the whole system at zero cost | No paid plan and no credit card used anywhere |
| 5 | Produce full professional documentation | The 14 documents are completed and kept consistent with the code |
| 6 | Learn and explain the system end to end | The author can explain and modify every part without help |

## 3. Scope and target users

The work is split into three phases, defined in detail in the SRS. Only Phase 1 is promised for submission; later phases are added as time allows.

| Phase | Content |
| --- | --- |
| 1 (MVP) | Canvas, sticky notes, shapes, pen, text, connectors, live collaboration, accounts, save, share link |
| 2 | Frames, comments, image upload, presentation mode, export, roles, version history |
| 3 | Timer, voting, private mode, reactions, templates, mind map |

Not included: video chat, AI features, third-party integrations, enterprise controls and native mobile apps.

Target users:

- University students doing group work and presentations
- Small teams and freelancers who plan and brainstorm remotely
- Teachers who run online sessions with sticky notes and diagrams

## 4. Approach and technology

The system is a modular monolith for the web client and REST API, plus one small separate realtime service. Microservices are not used: they add deployment and network work that a one or two person project cannot justify.

| Layer | Choice | Reason |
| --- | --- | --- |
| Client | React, Vite, TypeScript, Tailwind CSS | Typed UI, fast builds, utility CSS as requested |
| Canvas | Konva (react-konva) | Mature 2D canvas library for shapes, drag, zoom |
| State | Zustand | Small and simple store |
| REST API | TypeScript serverless functions on Vercel | Free, same language as the client |
| Database | MongoDB Atlas free tier | Flexible documents for board data |
| Realtime | Cloudflare Workers with Durable Objects | WebSocket rooms on a free plan without a credit card |
| Source control | GitHub | Free, triggers Vercel deploys |

Vercel runs serverless functions, so it cannot hold the long-lived WebSocket connections that live editing needs; this is why the realtime part is separate. Details and alternatives are in the SDA.

## 5. Work plan

Phase 1 is built in five stages, in this order. Dates are added once the course deadline is known.

1. Documents first: proposal, feasibility, SRS, use cases, then design documents (SDA, database, API, UI/UX)
2. Stage 1, canvas: pan, zoom, shapes, sticky notes, pen, text
3. Stage 2, editing: select, move, resize, rotate, connectors, undo and redo
4. Stage 3, live sync: Cloudflare realtime room, live cursors, conflict-free merging
5. Stage 4, accounts and sharing: sign up, log in, save boards, share link and roles
6. Stage 5, release: testing, deployment on Vercel and Cloudflare, user manual and maintenance notes

Test plan, test cases and the deployment, user and maintenance documents are finished after the matching code exists, so they describe the real system and not a guess.

## 6. Risks and how we handle them

| Risk | Likelihood | Impact | Plan |
| --- | --- | --- | --- |
| Scope is too big for one semester | High | High | Promise only Phase 1; Phases 2 and 3 are optional |
| A free plan changes or ends | Medium | High | Keep the realtime service replaceable; recheck limits before deployment |
| Free daily request limit is hit during a demo | Medium | Medium | Test with realistic traffic; keep a local run as backup |
| Live editing conflicts corrupt boards | Medium | High | Use a conflict-free data model and test with two or more users early |
| Canvas becomes slow with many objects | Medium | Medium | Measure early with 500 objects; draw only what is visible |
| Code looks Miro-like and raises copyright concerns | Low | High | Original name, design and code; no Miro assets copied |
| Author cannot explain generated code | Medium | High | Build stage by stage and review each part before moving on |

## 7. Budget, resources and expected outcome

The budget is USD 0. Every service runs on a free plan that needs no credit card.

| Resource | Provider | Cost |
| --- | --- | --- |
| Hosting for client and REST API | Vercel (free plan) | USD 0 |
| Database | MongoDB Atlas (free tier) | USD 0 |
| Realtime rooms | Cloudflare Workers, Durable Objects (free plan) | USD 0 |
| Code hosting | GitHub (free) | USD 0 |
| Tools | VS Code, Node.js, Git | USD 0 |
| People | Mansoor Ali Khan (author); other team members to be added if this is a group project | Student time |

Expected outcome: a deployed, free, collaborative whiteboard with a public link, complete documentation, and an author who can explain how every part works.

### Sources

- [Miro Help Center, whiteboard features and plan limits](https://help.miro.com/hc/articles/360012753200)
- [Cloudflare, Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing)
- [RapidDev, Build Your Own Miro Alternative](https://www.rapidevelopers.com/md/clone/miro)
