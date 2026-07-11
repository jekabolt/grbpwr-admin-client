// Temporary hand-written mirror of proto/common/common/task.proto (grbpwr-proto
// @94ab49c). The generated client uses string-literal-union enums (see
// AccessLevel in api/proto-http/admin), so these match that style 1:1.
//
// SWAP ON CODEGEN: after the backend ships the TASK MANAGER endpoints and
// `make proto` regenerates the client, delete this file and import
// `common_Task`, `common_TaskInsert`, `common_TaskBoard`, … from
// `api/proto-http/common` and the request/response types from
// `api/proto-http/admin`. The field names below already match the generated
// camelCase convention so the swap is mechanical.

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

// Loose mirror of common.MediaFull for card display (swap to common_MediaFull).
export interface TaskMedia {
  id: number;
  thumbnail?: string;
  fullSize?: string;
  blurhash?: string;
}

// Writable payload (common.TaskInsert). due_date is an ISO string here to match
// the generated client's Timestamp representation.
export interface TaskInsert {
  title: string;
  description: string;
  board: TaskBoard;
  status: TaskStatus;
  assignee: string; // AdminAccount.username; '' = unassigned
  priority: TaskPriority;
  dueDate?: string; // ISO 8601; undefined = no deadline
  labels: string[];
  mediaIds: number[];
  // Optional typed links (0 / '' = none) — mirrors common.TaskInsert.
  techCardId: number;
  productId: number;
  orderUuid: string;
  archiveId: number;
}

// Stored card (common.Task): id + Insert + server-managed fields + resolved media.
export interface Task {
  id: number;
  task: TaskInsert;
  position: number;
  media: TaskMedia[];
  createdBy: string; // AdminAccount.username
  createdAt: string;
  updatedAt: string;
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
}

// A blank writable payload for the create form.
export function emptyTaskInsert(board: TaskBoard, status: TaskStatus): TaskInsert {
  return {
    title: '',
    description: '',
    board,
    status,
    assignee: '',
    priority: 'TASK_PRIORITY_UNKNOWN',
    dueDate: undefined,
    labels: [],
    mediaIds: [],
    techCardId: 0,
    productId: 0,
    orderUuid: '',
    archiveId: 0,
  };
}
