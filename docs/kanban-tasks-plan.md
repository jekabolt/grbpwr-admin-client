# Kanban / Tasks — Full Implementation Plan

Internal team task board for cross-department work: **development** (портной/конструктор),
**design**, **marketing**, **production**, **sourcing**, **content**. Shared, multi-user,
native in the admin (not Trello/Linear, not a personal localStorage tracker).

This is **not** the order kanban — it tracks internal *work items* and *links* to the
artifacts they concern (техкарта, product, order, drop), while those artifacts keep their
own state machines (TechCard stage/approval, Fitting verdict, etc.).

---

## 0. Architecture & strategy

Two repos, one hard dependency:

| Layer | Repo | Status |
|---|---|---|
| Contract (proto) | `grbpwr-proto` | **DONE** — pushed to `main` @ `94ab49c` |
| Backend (Go: DB + handlers + RBAC) | `grbpwr-manager` (backend) | **TODO** — critical path, not in this repo |
| Frontend (board UI) | `grbpwr-admin-client` (this repo) | **TODO** — bulk of the work below |

**Parallelization strategy — build the frontend now, against an adapter.**
The backend is the critical path and lives elsewhere. To avoid blocking, the frontend is
built against a thin `tasksService` adapter whose method signatures mirror the future
`adminService` task methods 1:1. Today it is localStorage-backed; when the backend ships
and `make proto` regenerates the client, we flip one flag and delete the local impl. Every
hook and component is backend-agnostic — the only swap point is `api/tasksService.ts`.

---

## 1. Contract (DONE — reference)

`grbpwr-proto` @ `94ab49c`:

- `common/task.proto` — enums `TaskBoard` (DEVELOPMENT/DESIGN/MARKETING/PRODUCTION/SOURCING/CONTENT),
  `TaskStatus` (BACKLOG→TODO→IN_PROGRESS→REVIEW→DONE), `TaskPriority` (LOW→URGENT);
  `TaskInsert` / `Task` (id + Insert + resolved `MediaFull media` + timestamps, Fitting-shaped);
  `TaskComment` / `TaskCommentInsert`.
- `admin.proto` TASK MANAGER — 8 RPCs:
  `AddTask`, `GetTask`, `UpdateTask`, `MoveTask` (drag-drop `{status,position}`), `DeleteTask`,
  `AddTaskComment`, `ListTaskComments`, `ListTasks` (filters `board/status/assignee/tech_card_id/product_id`).

**Identity:** assignee / created_by / comment author = `AdminAccount.username` (the only identity
field — no email/display name). created_by/author stamped server-side from JWT.

**Links (typed FKs, no polymorphism):** `tech_card_id`, `product_id`, `order_uuid`, `archive_id`,
plus `media_ids` attachments. Each link target has a single-get RPC for card resolution.

---

## 2. Backend workstream (grbpwr-manager — separate repo, critical path)

Hand this to the backend dev. Not implementable here.

**B1. DB schema**
- `tasks` — id PK, title, description, board (int/enum), status (int/enum), assignee (text, FK→admin_account.username, nullable), priority, due_date (nullable), position (int), tech_card_id/product_id/archive_id (nullable FKs), order_uuid (text, nullable), created_by (text), created_at, updated_at.
- `task_media` — task_id, media_id (join to existing media table) — or a `media_ids int[]` column.
- `task_comments` — id, task_id FK (ON DELETE CASCADE), author, body, created_at.
- Index on `(board, status, position)` for board reads; index on `tech_card_id`, `product_id` for reverse-link filters.

**B2. Handlers (8 RPCs)** — mirror the FITTING manager service impl.
- `AddTask`: set `created_by` from JWT; set `position` = max(position)+1 in target (board,status).
- `MoveTask`: transactional re-sequence of sibling positions in source & target columns.
- `GetTask`/`ListTasks`: resolve `media_ids` → `MediaFull media` (same resolver Fitting uses).
- `ListTasks`: apply optional filters; return `tasks[]` + `total`.
- `DeleteTask`: cascade comments.
- `AddTaskComment`: set `author` from JWT. `ListTaskComments`: oldest-first.
- Link validation: reject unknown tech_card_id/product_id/archive_id/order_uuid (or store loosely — decide).

**B3. RBAC** — publish a new `tasks` section in `ListAccountSections` (key `tasks`, title/description).
Enforce read/write on the task RPCs by that section. **Until this ships, the frontend nav gate fails
open (shows for everyone)** — see F0.

**B4. (Phase 2) Activity log** — `task_activity` table + `ListTaskActivity` RPC, shaped like
`TierHistoryEntry` (actor, created_at, from→to, field, reason). No generic audit primitive exists to reuse.

*Effort: ~1–1.5 weeks (schema + 8 handlers + position re-sequencing + media resolution + RBAC).*

---

## 3. Frontend workstream (THIS repo) — phased

Feature folder: `src/components/managers/tasks/`. Follows the standard domain layout
(`page.tsx` + `components/` + `hooks/` + `api/` + `utils/`).

### Phase F0 — Foundation, routing, adapter (unblocks everything)

**F0.1 Routing & nav** (`src/constants/routes.ts`, `src/index.tsx`)
- `ROUTES.tasks = '/tasks'` (+ optional `ROUTES.taskDetails = '/tasks/:id'`).
- `SECTION.tasks = 'tasks'`; add to `SectionKey`.
- `LEFT_SIDE_ITEMS` entry `{ label: 'tasks', route: ROUTES.tasks, section: SECTION.tasks }` → nav appears, RBAC-gated automatically via `DesktopNavMenu`/`MobileNavMenu` `canRead`.
- Register the lazy route in `src/index.tsx` (where all `ROUTES.*` map to lazy components under `ProtectedLayout`).

**F0.2 Types (temporary, swap on codegen)** — `tasks/api/types.ts`
- Hand-mirror the proto in the generated client's string-enum style: `Task`, `TaskInsert`, `TaskComment`, `TaskBoard`, `TaskStatus`, `TaskPriority`, and the request/response shapes.
- **Swap step (post `make proto`):** replace with imports from `api/proto-http/common` (`common_Task`, `common_TaskInsert`, `common_TaskBoard`, …) and `api/proto-http/admin` (request/response types); delete this file.

**F0.3 Adapter** — `tasks/api/tasksService.ts`
- `interface TasksService` with 8 methods mirroring future `adminService` signatures.
- `localTasksService` — localStorage-backed; implements position re-sequencing, comments, filters, seeded sample data. Lets the board work end-to-end today.
- `remoteTasksService` — thin wrappers over `adminService.AddTask(...)` etc. (compiles only after codegen).
- `export const tasksService = USE_REMOTE ? remoteTasksService : localTasksService;` — **the single swap point.**

**F0.4 Query hooks** — `tasks/hooks/useTasks.ts` (mirror `accounts/utils/hooks.ts` — `tasksKeys` factory, `useQuery`/`useMutation`, `useSnackBarStore` feedback)
- Reads: `useTasks(filter)` (per board), `useTask(id)`, `useTaskComments(taskId)`.
- Mutations: `useCreateTask`, `useUpdateTask`, `useMoveTask` (**optimistic**), `useDeleteTask`, `useAddComment`.
- `useMoveTask` optimistic: `onMutate` cancels queries, snapshots, moves the card + re-numbers positions in the board cache; `onError` rollback + error snackbar; `onSettled` invalidate.

**F0.5 Identity/RBAC glue** — reuse `usePermissions()`: `account?.username` for default assignee / "my tasks"; `canWrite(SECTION.tasks)` to gate create/move/edit; assignee options from `useAccounts()` (`ListAccounts`).

### Phase F1 — Core board (MVP)

**F1.1 Board page** — `tasks/page.tsx`
- Department tabs (one per `TaskBoard`); active board drives `useTasks({board})` (limit=0 → all).
- Group tasks client-side by `status` into columns.

**F1.2 Columns** — `tasks/components/board-column.tsx`
- One per `TaskStatus`; `useDroppable` container; header with count; "add task" affordance (prefills status).

**F1.3 Cards + DnD** — `tasks/components/task-card.tsx` + `tasks/components/board.tsx`
- Reuse the `@dnd-kit` setup from `hero/components/block-rail.tsx` (`DndContext`, `PointerSensor`+`KeyboardSensor`, `SortableContext`) — but **cross-container** (drop into columns via `useDroppable`), dropping `restrictToVerticalAxis`.
- `task-card.tsx` via `useSortable`: title, assignee avatar/username, priority chip, due-date, link chip, comment/attachment counts.
- `onDragEnd` → resolve source/target column + index → `useMoveTask({id,status,position})` optimistically.

**F1.4 Create/edit modal** — `tasks/components/task-form-modal.tsx`
- React Hook Form + Zod (current standard). Fields: title, description (`text-area`), board, status, assignee (`select` from accounts), priority (`select`), due_date (`date-picker`).
- Reuse `ui/` : `button`, `input`, `select`, `date-picker`, `text-area`, `fields-group`.

**F1.5 Delete** — `ui/components/confirmation-modal.tsx` → `useDeleteTask`.

**F1.6 States** — loading (`loader`), empty column/board, load-error + retry, disabled controls when `!canWrite`. Mirror the hero-editor UX audit patterns (unsaved guards, focus rings, snackbar feedback).

### Phase F2 — Rich cards: links, media, comments, filters

**F2.1 Entity link picker** — `tasks/components/entity-link-picker.tsx`
- Attach one of techcard / product / order / archive. Reuse existing pickers where possible (`HeroProductPicker` for products; `ListTechCards`/`ListArchives`/`ListOrders` search for the rest).
- `useLinkedEntity(link)` resolves via the matching single-get RPC (`GetTechCard`/`GetProductByID`/`GetOrderByUUID`/`GetArchiveByID`); render a chip (title + thumbnail) that deep-links to the entity's route.

**F2.2 Media attachments** — reuse the media bucket (`UploadContentImage` + media-manager `ListObjectsPaged` picker); store `media_ids`; show resolved `MediaFull media` thumbnails on the card and in the detail view.

**F2.3 Comments** — `tasks/components/task-comments.tsx` — `useTaskComments` + `useAddComment`; author rendered as username (no display name exists).

**F2.4 Card detail** — `tasks/components/task-detail-drawer.tsx` (or `/tasks/:id`) — full description, links, media, comments, activity (F4).

**F2.5 Filters & "My tasks"** — `tasks/components/filters-bar.tsx` — filter by status/assignee/priority/label; "My tasks" = `assignee = usePermissions().account.username`.

### Phase F3 — Integration & polish

**F3.1 Reverse links on detail screens** — add a "Related tasks" panel to `singleTechCard` and `singleProduct` pages using `useTasks({techCardId})` / `useTasks({productId})`; read-only list + "add task" prefilled with the link. This is the payoff of the `ListTasks` link filters.

**F3.2 Labels** — surface `labels[]` as chips + client-side filter (server-side label filter is a cheap later contract add).

**F3.3 UX polish & mobile** — keyboard DnD, sticky column headers, responsive board (horizontal scroll on mobile), Cmd+S in the modal — reuse patterns from the hero-editor audit.

### Phase F4 — Roadmap (needs backend additions)

- **Activity log** — `ListTaskActivity` (B4) → timeline in the detail view.
- **Watchers** — add `repeated string watchers` to `TaskInsert`; meaningful once a notification primitive exists (none today).
- **Auto-generated tasks from events** — backend hooks: low-stock → reorder task (ties to analytics "reorder flags"), new order → fulfillment task, fitting `NEEDS_REWORK` → dev rework task.
- **Per-board RBAC** — if departments must be siloed, either multiple sections (`tasks_marketing`…) or app-level filtering (MVP: single `tasks` section, everyone who sees the board sees all boards).

---

## 4. Feature coverage checklist (everything we designed → where it lands)

| Feature | Phase | Backend need |
|---|---|---|
| Boards by department | F1 | enum (done) |
| Columns Backlog→Done | F1 | enum (done) |
| Drag-and-drop between columns + reorder | F1 | `MoveTask` (done) |
| Create / edit / delete task | F1 | Add/Update/Delete (done) |
| Assignee from real accounts | F1 | `ListAccounts` (exists) |
| Priority + due date | F1 | fields (done) |
| RBAC-gated access | F0/F1 | `tasks` section (B3) |
| Typed links (techcard/product/order/archive) + resolution | F2 | fields + single-get RPCs (exist) |
| Media attachments | F2 | media bucket (exists) + resolver (B2) |
| Comments | F2 | Add/List comment (done) |
| Filters + "My tasks" | F2 | `ListTasks` filters (done) + `GetCurrentAccount` (exists) |
| Related-tasks on techcard/product screens | F3 | `ListTasks` link filters (done) |
| Labels | F3 | field (done); server filter later |
| Activity log | F4 | `ListTaskActivity` (B4) |
| Watchers / notifications | F4 | new fields + notification infra |
| Auto-generated tasks | F4 | backend event hooks |

---

## 5. Sequencing, effort, dependencies

```
Contract (done ✅)
        │
        ├───────────────► Backend B1–B3 (Go)  ~1–1.5 wk  ┐
        │                                                 │ (make proto + flip USE_REMOTE)
        └──► Frontend F0 (~1–1.5 d) ──► F1 (~3 d) ──► F2 (~2–3 d) ──► F3 (~1–2 d)  ◄─┘
                          against localStorage adapter (no backend needed)
                                                                       │
                                                                       └► F4 (post-backend, roadmap)
```

- Frontend F0–F3 (~7–10 dev-days) can proceed **now** on the adapter, in parallel with the backend.
- Integration = `make proto` → flip `USE_REMOTE` → delete `localTasksService` + temp `types.ts`. Small, mechanical.
- F4 waits on backend B4 + event hooks.

## 6. Open decisions / risks

- **RBAC gate fails open** until backend publishes the `tasks` section — nav shows for everyone meanwhile (cosmetic; real enforcement is server-side).
- **Position model** — server owns re-sequencing (`MoveTask`); frontend is optimistic. Concurrent drags by two users can race → last-write-wins + invalidate reconciles.
- **Order link key** — `order_uuid` (string) not `order_id`, matching `GetOrderByUUID` + `/orders/:uuid` route.
- **Archive deep-link** needs heading+tag+id, not id alone — resolve via `GetArchiveByID` before linking.
- **Type swap** — generated enum representation must match the temp `types.ts` union style; verify at codegen.
- **`make proto` timing** — don't run until backend endpoints exist (they'd 404); it also regenerates the whole client.
