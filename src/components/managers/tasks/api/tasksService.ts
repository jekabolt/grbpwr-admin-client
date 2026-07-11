import { adminService } from 'api/api';
import type { common_MediaFull, common_Task, common_TaskComment } from 'api/proto-http/admin';
import {
  ListTasksFilter,
  Task,
  TaskBoard,
  TaskComment,
  TaskInsert,
  TaskMedia,
  TaskStatus,
} from './types';

// tasksService is the single seam between the kanban UI and the backend. Its
// method signatures mirror the AdminService TASK MANAGER RPCs 1:1 (proto
// 26a19e8, "split placement from content"), so the whole feature (hooks +
// components) stays backend-shape-agnostic. It maps the all-optional generated
// types to the required, defaulted UI view model in ./types.
export interface TasksService {
  listTasks(filter: ListTasksFilter): Promise<{ tasks: Task[]; total: number }>;
  getTask(id: number): Promise<Task | undefined>;
  addTask(content: TaskInsert, board: TaskBoard, status: TaskStatus): Promise<{ id: number }>;
  updateTask(id: number, content: TaskInsert): Promise<void>;
  moveTask(id: number, board: TaskBoard, status: TaskStatus, position: number): Promise<void>;
  deleteTask(id: number): Promise<void>;
  addComment(taskId: number, body: string): Promise<{ id: number }>;
  listComments(taskId: number): Promise<TaskComment[]>;
}

// ---------------------------------------------------------------------------
// Media cache — the form's attachment picker needs thumbnails for media_ids it
// just added (before a re-fetch), and MediaAttachments resolves ids → thumbs.
// Seeded from every server read (Task.media) and from picks in the picker.
// ---------------------------------------------------------------------------
const mediaCache = new Map<number, TaskMedia>();

export function rememberMedia(items: TaskMedia[]) {
  for (const m of items) if (m.id) mediaCache.set(m.id, m);
}
export function resolveMedia(ids: number[]): TaskMedia[] {
  return ids.map((id) => mediaCache.get(id)).filter((m): m is TaskMedia => Boolean(m));
}

// ---------------------------------------------------------------------------
// Generated → UI mapping
// ---------------------------------------------------------------------------
function mapMedia(m: common_MediaFull): TaskMedia {
  return {
    id: m.id ?? 0,
    thumbnail: m.media?.thumbnail?.mediaUrl,
    fullSize: m.media?.fullSize?.mediaUrl,
    blurhash: m.media?.blurhash,
  };
}

function mapInsert(i: common_Task['task']): TaskInsert {
  return {
    title: i?.title ?? '',
    description: i?.description ?? '',
    assignee: i?.assignee ?? '',
    priority: i?.priority ?? 'TASK_PRIORITY_UNKNOWN',
    dueDate: i?.dueDate || undefined,
    labels: i?.labels ?? [],
    mediaIds: i?.mediaIds ?? [],
    techCardId: i?.techCardId ?? 0,
    productId: i?.productId ?? 0,
    orderUuid: i?.orderUuid ?? '',
    archiveId: i?.archiveId ?? 0,
  };
}

function mapTask(t: common_Task): Task {
  const media = (t.media ?? []).map(mapMedia);
  rememberMedia(media);
  return {
    id: t.id ?? 0,
    task: mapInsert(t.task),
    board: t.board ?? 'TASK_BOARD_UNKNOWN',
    status: t.status ?? 'TASK_STATUS_UNKNOWN',
    position: t.position ?? 0,
    media,
    createdBy: t.createdBy ?? '',
    createdAt: t.createdAt ?? '',
    updatedAt: t.updatedAt ?? '',
  };
}

function mapComment(c: common_TaskComment): TaskComment {
  return {
    id: c.id ?? 0,
    taskId: c.taskId ?? 0,
    author: c.author ?? '',
    body: c.body ?? '',
    createdAt: c.createdAt ?? '',
  };
}

// ---------------------------------------------------------------------------
// Live backend adapter — thin, typed wrappers over the generated AdminService.
// The backend stamps created_by / author from the JWT and re-sequences
// positions on MoveTask. A TaskInsert is structurally a common_TaskInsert, so it
// passes through unchanged.
// ---------------------------------------------------------------------------
export const tasksService: TasksService = {
  listTasks: (filter) =>
    adminService
      .ListTasks({
        board: filter.board,
        status: filter.status,
        assignee: filter.assignee,
        limit: undefined,
        offset: undefined,
        orderFactor: undefined,
        techCardId: filter.techCardId,
        productId: filter.productId,
      })
      .then((r) => ({ tasks: (r.tasks ?? []).map(mapTask), total: r.total ?? 0 })),

  getTask: (id) => adminService.GetTask({ id }).then((r) => (r.task ? mapTask(r.task) : undefined)),

  addTask: (content, board, status) =>
    adminService.AddTask({ task: content, board, status }).then((r) => ({ id: r.id ?? 0 })),

  updateTask: (id, content) => adminService.UpdateTask({ id, task: content }).then(() => undefined),

  moveTask: (id, board, status, position) =>
    adminService.MoveTask({ id, board, status, position }).then(() => undefined),

  deleteTask: (id) => adminService.DeleteTask({ id }).then(() => undefined),

  addComment: (taskId, body) =>
    adminService.AddTaskComment({ comment: { taskId, body } }).then((r) => ({ id: r.id ?? 0 })),

  listComments: (taskId) =>
    adminService.ListTaskComments({ taskId }).then((r) => (r.comments ?? []).map(mapComment)),
};
