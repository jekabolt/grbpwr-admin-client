import { adminService } from 'api/api';
import { applyMove } from '../utils/order';
import { ListTasksFilter, Task, TaskComment, TaskInsert } from './types';

// tasksService is the single seam between the kanban UI and its backend. Its
// method signatures mirror the future AdminService TASK MANAGER RPCs 1:1, so the
// whole feature (hooks + components) is backend-agnostic.
//
// Today it is backed by localStorage (`localTasksService`) so the board works
// end-to-end before the backend exists. When the Go endpoints ship and
// `make proto` regenerates the client, flip USE_REMOTE to true and delete the
// localStorage impl — nothing else changes.
export interface TasksService {
  listTasks(filter: ListTasksFilter): Promise<{ tasks: Task[]; total: number }>;
  getTask(id: number): Promise<Task | undefined>;
  addTask(input: TaskInsert): Promise<{ id: number }>;
  updateTask(id: number, input: TaskInsert): Promise<void>;
  moveTask(id: number, status: Task['task']['status'], position: number): Promise<void>;
  deleteTask(id: number): Promise<void>;
  addComment(taskId: number, body: string): Promise<{ id: number }>;
  listComments(taskId: number): Promise<TaskComment[]>;
}

// ---------------------------------------------------------------------------
// Local actor — the backend stamps created_by/author from the JWT; in local
// mode we stamp with the logged-in username, set once from the app.
// ---------------------------------------------------------------------------
let localActor = 'me';
export function setLocalActor(username?: string) {
  if (username) localActor = username;
}

// ---------------------------------------------------------------------------
// localStorage implementation
// ---------------------------------------------------------------------------
const TASKS_KEY = 'grbpwr.kanban.tasks.v1';
const COMMENTS_KEY = 'grbpwr.kanban.comments.v1';
const SEQ_KEY = 'grbpwr.kanban.seq.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}
function nextId(): number {
  const seq = read<number>(SEQ_KEY, 1000) + 1;
  write(SEQ_KEY, seq);
  return seq;
}
function nowIso(): string {
  return new Date().toISOString();
}

function loadTasks(): Task[] {
  const tasks = read<Task[] | null>(TASKS_KEY, null);
  if (tasks === null) {
    const seeded = seedTasks();
    write(TASKS_KEY, seeded);
    return seeded;
  }
  return tasks;
}
function saveTasks(tasks: Task[]) {
  write(TASKS_KEY, tasks);
}

const localTasksService: TasksService = {
  async listTasks(filter) {
    let tasks = loadTasks();
    if (filter.board) tasks = tasks.filter((t) => t.task.board === filter.board);
    if (filter.status) tasks = tasks.filter((t) => t.task.status === filter.status);
    if (filter.assignee) tasks = tasks.filter((t) => t.task.assignee === filter.assignee);
    if (filter.techCardId) tasks = tasks.filter((t) => t.task.techCardId === filter.techCardId);
    if (filter.productId) tasks = tasks.filter((t) => t.task.productId === filter.productId);
    const sorted = [...tasks].sort((a, b) => a.position - b.position);
    return { tasks: sorted, total: sorted.length };
  },

  async getTask(id) {
    return loadTasks().find((t) => t.id === id);
  },

  async addTask(input) {
    const tasks = loadTasks();
    const columnCount = tasks.filter(
      (t) => t.task.board === input.board && t.task.status === input.status,
    ).length;
    const task: Task = {
      id: nextId(),
      task: input,
      position: columnCount,
      media: [],
      createdBy: localActor,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    saveTasks([...tasks, task]);
    return { id: task.id };
  },

  async updateTask(id, input) {
    const tasks = loadTasks();
    saveTasks(
      tasks.map((t) =>
        t.id === id ? { ...t, task: input, updatedAt: nowIso() } : t,
      ),
    );
  },

  async moveTask(id, status, position) {
    const tasks = loadTasks();
    const moved = applyMove(tasks, id, status, position).map((t) =>
      t.id === id ? { ...t, updatedAt: nowIso() } : t,
    );
    saveTasks(moved);
  },

  async deleteTask(id) {
    const tasks = loadTasks().filter((t) => t.id !== id);
    saveTasks(tasks);
    const comments = read<TaskComment[]>(COMMENTS_KEY, []).filter((c) => c.taskId !== id);
    write(COMMENTS_KEY, comments);
  },

  async addComment(taskId, body) {
    const comments = read<TaskComment[]>(COMMENTS_KEY, []);
    const comment: TaskComment = {
      id: nextId(),
      taskId,
      author: localActor,
      body,
      createdAt: nowIso(),
    };
    write(COMMENTS_KEY, [...comments, comment]);
    return { id: comment.id };
  },

  async listComments(taskId) {
    return read<TaskComment[]>(COMMENTS_KEY, [])
      .filter((c) => c.taskId === taskId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
};

// ---------------------------------------------------------------------------
// Remote implementation — thin wrappers over the generated AdminService.
// The `as any` casts vanish after `make proto` types the TASK MANAGER methods.
// ---------------------------------------------------------------------------
const svc = adminService as any;
const remoteTasksService: TasksService = {
  listTasks: (filter) =>
    svc
      .ListTasks({
        board: filter.board,
        status: filter.status,
        assignee: filter.assignee,
        techCardId: filter.techCardId,
        productId: filter.productId,
      })
      .then((r: any) => ({ tasks: r.tasks ?? [], total: r.total ?? 0 })),
  getTask: (id) => svc.GetTask({ id }).then((r: any) => r.task),
  addTask: (input) => svc.AddTask({ task: input }).then((r: any) => ({ id: r.id })),
  updateTask: (id, input) => svc.UpdateTask({ id, task: input }).then(() => undefined),
  moveTask: (id, status, position) =>
    svc.MoveTask({ id, status, position }).then(() => undefined),
  deleteTask: (id) => svc.DeleteTask({ id }).then(() => undefined),
  addComment: (taskId, body) =>
    svc.AddTaskComment({ comment: { taskId, body } }).then((r: any) => ({ id: r.id })),
  listComments: (taskId) =>
    svc.ListTaskComments({ taskId }).then((r: any) => r.comments ?? []),
};

// The single swap point. Flip to true once the backend TASK MANAGER endpoints
// exist and the client is regenerated (they 404 until then).
const USE_REMOTE = false;
export const tasksService: TasksService = USE_REMOTE ? remoteTasksService : localTasksService;

// ---------------------------------------------------------------------------
// Seed data — a small realistic board so the feature is explorable on first run.
// ---------------------------------------------------------------------------
function seedTasks(): Task[] {
  const now = new Date();
  const iso = (offsetDays: number) =>
    new Date(now.getTime() + offsetDays * 86400000).toISOString();
  const base = {
    media: [] as Task['media'],
    labels: [] as string[],
    mediaIds: [] as number[],
    techCardId: 0,
    productId: 0,
    orderUuid: '',
    archiveId: 0,
    createdBy: 'system',
    createdAt: iso(-3),
    updatedAt: iso(-1),
  };
  const rows: Array<{
    id: number;
    title: string;
    description?: string;
    board: Task['task']['board'];
    status: Task['task']['status'];
    priority: Task['task']['priority'];
    assignee?: string;
    due?: number;
    position: number;
    labels?: string[];
  }> = [
    { id: 1001, title: 'Разработать лекало пальто FW26', board: 'TASK_BOARD_DEVELOPMENT', status: 'TASK_STATUS_IN_PROGRESS', priority: 'TASK_PRIORITY_HIGH', due: 4, position: 0, labels: ['fw26'] },
    { id: 1002, title: 'Fit-образец: воротник переделать', board: 'TASK_BOARD_DEVELOPMENT', status: 'TASK_STATUS_TODO', priority: 'TASK_PRIORITY_MEDIUM', due: 2, position: 0 },
    { id: 1003, title: 'Утвердить техкарту брюк', board: 'TASK_BOARD_DEVELOPMENT', status: 'TASK_STATUS_REVIEW', priority: 'TASK_PRIORITY_MEDIUM', position: 0 },
    { id: 1004, title: 'Съёмка лукбука дропа', board: 'TASK_BOARD_CONTENT', status: 'TASK_STATUS_TODO', priority: 'TASK_PRIORITY_HIGH', due: 6, position: 0, labels: ['drop-3'] },
    { id: 1005, title: 'Инстаграм-план на неделю', board: 'TASK_BOARD_MARKETING', status: 'TASK_STATUS_IN_PROGRESS', priority: 'TASK_PRIORITY_LOW', position: 0 },
    { id: 1006, title: 'Найти поставщика шерсти', board: 'TASK_BOARD_SOURCING', status: 'TASK_STATUS_BACKLOG', priority: 'TASK_PRIORITY_MEDIUM', position: 0 },
    { id: 1007, title: 'Дизайн принта для футболок', board: 'TASK_BOARD_DESIGN', status: 'TASK_STATUS_TODO', priority: 'TASK_PRIORITY_URGENT', due: -1, position: 0 },
    { id: 1008, title: 'Запустить пошив партии рубашек', board: 'TASK_BOARD_PRODUCTION', status: 'TASK_STATUS_BACKLOG', priority: 'TASK_PRIORITY_MEDIUM', position: 0 },
  ];
  return rows.map((r) => ({
    id: r.id,
    position: r.position,
    media: base.media,
    createdBy: base.createdBy,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    task: {
      title: r.title,
      description: r.description ?? '',
      board: r.board,
      status: r.status,
      assignee: r.assignee ?? '',
      priority: r.priority,
      dueDate: r.due !== undefined ? iso(r.due) : undefined,
      labels: r.labels ?? base.labels,
      mediaIds: base.mediaIds,
      techCardId: base.techCardId,
      productId: base.productId,
      orderUuid: base.orderUuid,
      archiveId: base.archiveId,
    },
  }));
}
