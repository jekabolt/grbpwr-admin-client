// UI-facing view model for the kanban. Mirrors the generated client
// (api/proto-http/admin: common_Task / common_TaskInsert @ proto 26a19e8) but
// with required, defaulted fields (the generated types are all-optional) so
// components stay clean. The adapter in tasksService.ts maps between the two.
//
// Contract shape "split placement from content": TaskInsert is CONTENT only;
// placement (board / status / position) lives on Task and is set at AddTask /
// changed only via MoveTask.

export type TaskBoard =
  | 'TASK_BOARD_UNKNOWN'
  | 'TASK_BOARD_DEVELOPMENT'
  | 'TASK_BOARD_DESIGN'
  | 'TASK_BOARD_MARKETING'
  | 'TASK_BOARD_PRODUCTION'
  | 'TASK_BOARD_SOURCING'
  | 'TASK_BOARD_CONTENT';

export type TaskStatus =
  | 'TASK_STATUS_UNKNOWN'
  | 'TASK_STATUS_BACKLOG'
  | 'TASK_STATUS_TODO'
  | 'TASK_STATUS_IN_PROGRESS'
  | 'TASK_STATUS_REVIEW'
  | 'TASK_STATUS_DONE';

export type TaskPriority =
  | 'TASK_PRIORITY_UNKNOWN'
  | 'TASK_PRIORITY_LOW'
  | 'TASK_PRIORITY_MEDIUM'
  | 'TASK_PRIORITY_HIGH'
  | 'TASK_PRIORITY_URGENT';

// Resolved attachment (mapped from common_MediaFull) for card/drawer display.
export interface TaskMedia {
  id: number;
  thumbnail?: string;
  fullSize?: string;
  blurhash?: string;
}

// One checklist row (mapped from common_TaskChecklistItem). Managed by dedicated
// add/toggle/delete RPCs — never part of the content replace-on-update, so a
// content edit never wipes per-item done state.
export interface TaskChecklistItem {
  id: number;
  content: string;
  isDone: boolean;
  position: number;
}

// Writable CONTENT (matches common_TaskInsert field-for-field, so a TaskInsert
// passes straight through to the generated request type). due_date is an RFC3339
// string to match the generated client's wellKnownTimestamp representation.
export interface TaskInsert {
  title: string;
  description: string;
  assignee: string; // AdminAccount.username; '' = unassigned
  priority: TaskPriority;
  dueDate: string | undefined; // RFC3339; undefined = no deadline (key always present, mirrors common_TaskInsert)
  // Planned start (когда работа ДОЛЖНА начаться) — the manual counterpart of
  // dueDate. Distinct from the server-stamped actual start (Task.startedAt).
  startDate: string | undefined; // RFC3339; undefined = no planned start
  labels: string[];
  mediaIds: number[];
  // Optional typed links (0 / '' = none) — mirrors common.TaskInsert.
  techCardId: number;
  productId: number;
  orderUuid: string;
  archiveId: number;
  fittingId: number; // примерка / try-on session (GetFitting)
  productionRunId: number; // производственная партия / production run (GetProductionRun); 0 = none
  sampleId: number; // образец / sample (GetSample); 0 = none (new-flow NF link)
}

// Stored card (common.Task): id + content + placement + resolved media + identity.
export interface Task {
  id: number;
  task: TaskInsert;
  board: TaskBoard;
  status: TaskStatus;
  position: number;
  media: TaskMedia[];
  checklist: TaskChecklistItem[];
  createdBy: string; // AdminAccount.username
  createdAt: string;
  updatedAt: string;
  // Actual start: server-stamped the FIRST time the card enters IN_PROGRESS
  // (never client-supplied). '' = not started yet. Distinct from the planned
  // TaskInsert.startDate.
  startedAt: string;
  // Soft-archive stamp. '' = active; set (RFC3339) = archived (hidden from the
  // board's default view, restorable via UnarchiveTask). Orthogonal to placement.
  archivedAt: string;
}

export interface TaskComment {
  id: number;
  taskId: number;
  author: string; // AdminAccount.username
  body: string;
  createdAt: string;
}

// Filters for ListTasks (all optional; empty/0 = no filter).
export interface ListTasksFilter {
  board?: TaskBoard;
  status?: TaskStatus;
  assignee?: string;
  techCardId?: number;
  productId?: number;
  includeArchived?: boolean; // false/undefined = active only; true = include archived
}

// Form values = content + its (initial or edited) placement. The modal edits
// board/column inline; on submit the page splits this back into content +
// placement (AddTask sets both; edits go through UpdateTask + MoveTask).
export type TaskFormValues = TaskInsert & { board: TaskBoard; status: TaskStatus };

// A blank writable payload (content only).
export function emptyTaskInsert(): TaskInsert {
  return {
    title: '',
    description: '',
    assignee: '',
    priority: 'TASK_PRIORITY_UNKNOWN',
    dueDate: undefined,
    startDate: undefined,
    labels: [],
    mediaIds: [],
    techCardId: 0,
    productId: 0,
    orderUuid: '',
    archiveId: 0,
    fittingId: 0,
    productionRunId: 0,
    sampleId: 0,
  };
}

// A blank form seeded with the create target's placement.
export function emptyFormValues(board: TaskBoard, status: TaskStatus): TaskFormValues {
  return { ...emptyTaskInsert(), board, status };
}
