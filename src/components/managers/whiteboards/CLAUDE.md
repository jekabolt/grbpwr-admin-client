# Whiteboards — the guide for every PR in this stack

An internal FigJam-like board inside the admin: an infinite canvas with stickies, shapes, text,
connectors, sections and a marker, edited by several people at once, with **live cards** of the
admin's own domains (task, order, product, tech card) placed on it. Those live cards are the reason
to build it here instead of buying FigJam.

Read this file before touching anything under `managers/whiteboards/`, the `whiteboard` proto or the
sync service. When a decision here changes, change this file in the same PR.

## Name: `whiteboard`, never `board`

"Board" is taken twice already: task boards (`TaskBoard`, `ListTaskBoards`, `managers/tasks`) and
the `Board` primitive in `ui`. Everything in this feature is `whiteboard`:

- route `/whiteboards` and `/whiteboards/:id`;
- folder `src/components/managers/whiteboards/`;
- proto `Whiteboard*` messages and RPCs;
- section and feature key `whiteboards`;
- branches `whiteboard/NN-<slug>`.

## Decisions (owner, 25 Nov 2026) — do not reopen without the owner

| Question      | Decision                                                                                                                             | Why                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine        | Own SVG engine, no tldraw or Excalidraw                                                                                              | tldraw needs a paid production key; Excalidraw's hand-drawn look breaks DESIGN.md. Internal scale (≤ ~3k objects per board) is fine for SVG. |
| Sync          | Yjs documents + a separate Hocuspocus (Node) service                                                                                 | No mature Yjs for Go. CRDT merges concurrent edits and gives presence (cursors) for free.                                                    |
| Backend split | Go stores the Yjs state as an **opaque blob** and never parses it. Metadata, comments, rights and card data live in ordinary tables. | Same split as Figma (multiplayer server vs. LiveGraph).                                                                                      |
| Live cards    | The Yjs doc holds only a ref `{type, uuid}`; data comes from `ResolveWhiteboardCards`                                                | A copy would go stale the moment someone changes the task elsewhere.                                                                         |
| Base branch   | `beta`                                                                                                                               | All feature PRs go there; master is far behind and has no teams.                                                                             |

## Scope

**MVP (PRs 01–04)**

- Canvas: pan (Space or H plus drag, wheel), zoom under the cursor (⌘ plus wheel, Shift+1 fit, Shift+2 selection).
- Editing: box select, move, resize, ⌘Z, ⌘D, Alt-drag duplicate, z-order (`]`, `[`, ⌘] and ⌘[), align, lock.
- Sticky: 240×240, height grows with the text, fixed palette, author line, `S`, ⌘Enter for the next one.
- Shape with text: the 14 basic shapes.
- Text.
- Connector: elbow, straight or curved; 5 end caps; a label; bound to object sides.
- Section.
- Marker and highlighter.

**Later (PRs 05+)**

- Multiplayer cursors, avatars, follow.
- Comments pinned to a point or an object.
- Stamps and voting, timer, cursor chat, spotlight.
- Table, code block, mind map, images from media.
- Templates (a section saved as a template), export to PNG and PDF (`jspdf` is already a dependency).
- Live domain cards.
- AI sort and summary of stickies through `ai-providers`.

**Not doing:** audio chat, music, high-five, emotes, open sessions for people without an account,
a plugin or widget API, mobile, offline, Miro, Mural or Lucid import.

The FigJam behaviour reference is the Figma help centre (`help.figma.com/hc/en-us/articles/`):

- sticky `1500004414322`, shapes `1500004414382`, connectors `1500004414542`;
- sections `4939765379351`, tables `12583849250199`;
- voting `9359912208663`, comments `1500004290941`.

For exact object properties, use the FigJam node types in developers.figma.com/docs/plugins/working-in-figjam.
Copy behaviour, never Figma's branding or assets.

## Architecture

```
managers/whiteboards/
  page.tsx                 list of whiteboards (tiles with thumbnails)
  whiteboard/page.tsx      one whiteboard: editor shell
  api/whiteboardService.ts the ONLY swap point to the backend (adapter, see below)
  model/                   pure TS, no React: doc schema, camera, geometry, hit-test, z-order
  editor/                  React: canvas, tools, selection, toolbar, keyboard
  objects/                 one file per object kind: render + handles + defaults
  sync/                    Yjs provider, awareness (cursors), undo manager
```

**Coordinates.**

- World units are CSS px at zoom 1.
- The camera is `{x, y, zoom}`, and screen↔world conversion lives in `model/camera.ts` only.
- Objects store world coordinates as numbers.
- Do not reuse the annotation surface's frame fractions: an infinite canvas has no frame.

**Document (Yjs).**

- `objects: Y.Map<id, Y.Map>`; each object has `kind`, `x`, `y`, `w`, `h`, `rotation`, `z`, `locked`, `author`, plus kind props.
- Connectors bind as `{objectId, side | 'auto'}` per end, or as a free point.
- `z` is a fractional-index string, which sorts without renumbering and merges without conflicts.
- Live cards are `kind: 'card'` with `ref: {type, uuid}` and nothing else from the domain.

**Undo.**

- Single-user PRs use a snapshot history in the spirit of `tech-card/annotation/history.ts`: record before the gesture, not after.
- From the multiplayer PR on, use `Y.UndoManager` scoped to the local origin, so ⌘Z never reverts a colleague's edit.

**Reuse before writing.**

- `tech-card/annotation/geometry.ts`: ink paths, `simplifyPath`, `constrainTo45`, arrows.
- `kinds.ts` and `shapes.tsx`: arrow heads and callouts.
- Import them as `tasks/api/tasksService.ts` already does. If two domains end up needing a piece, propose moving it to `lib/` in its own PR; do not fork a copy.

**Adapter.**

- Follow `docs/kanban-tasks-plan.md` §0: `api/whiteboardService.ts` mirrors the future `adminService` RPCs one to one.
- It is backed by `localStorage` until the backend ships, then flipped to the generated client.
- Hooks and components never import `adminService` directly.

## Backend (outside this repo)

Contract: `grbpwr-proto`, mirrored into `proto/` by its owner. Backend: Go service `grbpwr-manager`.
This repo carries the spec; whoever implements the backend works from it.

- **Tables**
  - `whiteboards`: uuid, workspace, title, created_by, timestamps, archived_at, thumbnail_media_id.
  - `whiteboard_documents`: whiteboard_id, state blob, size_bytes, version, updated_at.
  - `whiteboard_document_versions`: periodic snapshots, the last N kept.
  - `whiteboard_refs`: whiteboard_id, ref_type, ref_uuid. Gives the reverse link ("on whiteboards X, Y") and lets deletes be detected.
  - `whiteboard_comments`: uuid, whiteboard_id, parent_uuid, anchor JSON, author, body, resolved_at.
- **RPCs**: `post /api/admin/whiteboard/...`, shaped like the Task RPCs.
  - `ListWhiteboards`, `GetWhiteboard`, `AddWhiteboard`, `UpdateWhiteboard`, `ArchiveWhiteboard`, `DeleteWhiteboard`, `DuplicateWhiteboard` (also used for templates).
  - `GetWhiteboardDocument` and `SaveWhiteboardDocument` (blob plus `expected_version`: optimistic lock, 409 on mismatch).
  - `ResolveWhiteboardCards(refs[])`: one batch, filtered by the viewer's rights. A card the viewer cannot read comes back as "no access", not as data.
  - `Add`, `List`, `Resolve` and `DeleteWhiteboardComment`.
- **Rights**
  - Section `whiteboards` (READ/WRITE) in `AdminPermission` and in `SECTION` in `constants/routes.ts`.
  - Team feature `whiteboards` in `lib/workspace/features.ts`.
  - Every row is scoped to the workspace.
- **Sync service (Hocuspocus)**
  - `onAuthenticate`: the same JWT as the admin; asks Go for the whiteboard right. READ opens the connection read-only, and the server rejects writes.
  - Load and store go through internal Go endpoints. Store is debounced: about 2 s after the last edit, and at least every 10 s.
  - Limits: document size around 10 MB, connections per whiteboard, keepalive.
  - Deployed next to the Go backend, behind an ingress with WebSocket upgrade and an origin allow-list.
  - The admin reads its URL from `VITE_WHITEBOARD_SYNC_URL`. Set it on every contour, like `VITE_SERVER_URL`, and document it in `.env.example`.

## The stack

One PR per step, stacked with `gh stack` on `beta`. Each PR ends in **something visible in the admin**
(or is explicitly `[no-ui]`). If a step shows nothing and decides nothing, drop it.

| #   | Branch                      | What becomes visible                                                                | Backend needed                              |
| --- | --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| 00  | `whiteboard/00-claude-md`   | this guide                                                                          | —                                           |
| 01  | `whiteboard/01-shell`       | nav item, list page, an empty canvas that pans and zooms; adapter on `localStorage` | —                                           |
| 02  | `whiteboard/02-objects`     | sticky, shape, text: place, select, move, resize, undo, z-order                     | —                                           |
| 03  | `whiteboard/03-connectors`  | connectors bound to objects, sections, marker                                       | —                                           |
| 04  | `whiteboard/04-contract`    | proto + flip the adapter to the backend; whiteboards persist on the server          | tables, CRUD, document RPCs, rights         |
| 05  | `whiteboard/05-multiplayer` | two tabs edit one whiteboard live; cursors, avatars, follow                         | Hocuspocus service + deploy                 |
| 06  | `whiteboard/06-comments`    | comments, stamps and voting, timer                                                  | comments RPCs                               |
| 07  | `whiteboard/07-cards`       | live task, order, product and tech-card cards                                       | `whiteboard_refs`, `ResolveWhiteboardCards` |
| 08+ | …                           | table, code block, mind map, templates, export, AI                                  | `DuplicateWhiteboard`, thumbnails           |

PRs 01–03 do not wait for the backend; the backend builds 04 in parallel. 05 is the schedule risk:
it cannot be verified until the sync service runs somewhere.

**Working the stack**

- Start a step: `gh stack add whiteboard/NN-slug`.
- Push and open or update the PRs: `gh stack submit`.
- After a lower PR changes: `gh stack rebase`.
- After merges upstream: `gh stack sync`.

Work in the worktree `~/Desktop/grbpwr-admin-client-wt-board`, never in the main checkout: another
session replays pattern-import on the main checkout's code.

## Rules that bind every PR

- **UI**: `DESIGN.md`, the "Visual design" section of `AGENTS.md`, and `.claude/rules/ui.md`.
  - A new screen starts as a mockup that the owner approves before any code. The commit carries `[mockup-ok <artifact link>]`.
  - A commit with no visible change carries `[no-ui]`.
  - Visible text is English and labels are 1–3 words.
  - Board objects are feature components under `objects/`, **not** `src/ui` primitives. The primitive list is closed.
  - Toolbars, menus and panels around the canvas use `ui` primitives (`import { … } from 'ui'`).
- **New dependencies need the owner's OK, one by one**, named in the PR description with licence and size:
  - expected: `yjs`, `@hocuspocus/provider`, `fractional-indexing` (CC0), `rbush` (MIT, only when hit-testing needs it);
  - `perfect-freehand` only if the annotation ink paths fall short.
- **Pure logic is tested by probes**: `model/` has no React, so camera maths, hit-testing, z-order and connector routing get a `scripts/whiteboard-*-probe.mjs` listed in `scripts/probes.assert.txt`. Interaction feel is verified by hand in `yarn dev`.
- **Before every PR**: `yarn build:check`, `yarn lint:design`, `yarn test`, `yarn fix`.
- **Performance budget**: 2,000 objects pan and zoom at 60 fps on a mid-range laptop. Render only what intersects the viewport, and never re-render all objects on a camera move.

## Open questions (owner)

- Who implements the Go and proto part: the backend owner from this spec, or an agent with access to `grbpwr-manager`?
- Where does the Hocuspocus service run? Next to the Go backend, or on its own host?
