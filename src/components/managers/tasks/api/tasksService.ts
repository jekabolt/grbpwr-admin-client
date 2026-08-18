import { adminService } from 'api/api';
import type {
  common_MediaFull,
  common_Task,
  common_TaskChecklistItem,
  common_TaskComment,
  common_TaskInsert,
  common_TaskMediaAnnotations,
  common_TechCardAnnotation,
} from 'api/proto-http/admin';
import type { AnnotationValue } from 'ui/components/annotation/canvas';
import {
  annotationColorFromWire,
  annotationColorToWire,
  annotationKindFromWire,
  annotationKindToWire,
  type AnnotationColorKey,
  type AnnotationKindKey,
} from 'ui/components/annotation/wire';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import {
  ListTasksFilter,
  Task,
  TaskBoard,
  TaskChecklistItem,
  TaskComment,
  TaskInsert,
  TaskMedia,
  TaskMediaAnnotations,
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
  archiveTask(id: number): Promise<void>;
  unarchiveTask(id: number): Promise<void>;
  addComment(taskId: number, body: string): Promise<{ id: number }>;
  listComments(taskId: number): Promise<TaskComment[]>;
  addChecklistItem(taskId: number, content: string): Promise<{ id: number }>;
  setChecklistItemDone(id: number, isDone: boolean): Promise<void>;
  deleteChecklistItem(id: number): Promise<void>;
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
/**
 * То же самое, но БЕЗ отсева нерезолвленных: неизвестный id остаётся на своём месте, с одним лишь
 * номером. Нужно везде, где важна ПОЗИЦИЯ вложения в карточке — ссылки в тексте (`task-text.tsx`)
 * называют вложение его номером, и выпавшая из середины строка сдвинула бы все номера за ней.
 */
export function orderedMedia(ids: number[]): TaskMedia[] {
  return ids.map((id) => mediaCache.get(id) ?? { id });
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

// ---------------------------------------------------------------------------
// УКАЗАНИЯ НА ВЛОЖЕНИЯХ: провод ↔ форма.
//
// Координаты живут СТРОКАМИ по обе стороны — тот же decimal, что в JSON-колонке: круговой рейс
// без округлений. Вид и цвет разрешаются общим словарём (`ui/components/annotation/wire`), тем же,
// которым пользуется снимок шага тех-карты.
// ---------------------------------------------------------------------------
function mapAnnotation(a: common_TechCardAnnotation): AnnotationValue {
  return {
    kind: annotationKindFromWire(a.kind),
    points: (a.points ?? []).map((p) => ({
      x: decimalToInput(p.x) || '0',
      y: decimalToInput(p.y) || '0',
    })),
    text: a.text ?? '',
    labelX: decimalToInput(a.labelX) || '0',
    labelY: decimalToInput(a.labelY) || '0',
    color: annotationColorFromWire(a.color),
    dashed: !!a.dashed,
    filled: !!a.filled,
    // Деталей кроя у задачи нет: сервер эти ключи очищает, и держать их в форме значило бы
    // отправлять обратно то, чего он не принял.
    pieceLineKey: '',
    pieceLineKeys: [],
  };
}

function mapMediaAnnotations(m: common_TaskMediaAnnotations): TaskMediaAnnotations {
  return { mediaId: m.mediaId ?? 0, annotations: (m.annotations ?? []).map(mapAnnotation) };
}

function annotationToWire(a: AnnotationValue): common_TechCardAnnotation {
  return {
    kind: annotationKindToWire(a.kind as AnnotationKindKey),
    points: (a.points ?? []).map((p) => ({ x: inputToDecimal(p.x), y: inputToDecimal(p.y) })),
    text: (a.text ?? '').trim(),
    labelX: inputToDecimal(a.labelX),
    labelY: inputToDecimal(a.labelY),
    color: annotationColorToWire(a.color as AnnotationColorKey),
    dashed: !!a.dashed,
    filled: !!a.filled,
    pieceLineKey: '',
    pieceLineKeys: [],
  };
}

/**
 * СОДЕРЖИМОЕ КАРТОЧКИ НА ПРОВОД. Раньше `TaskInsert` уходил в запрос как есть — он был
 * структурно тем же самым. С указаниями это перестало быть правдой: у них координаты
 * `google.type.Decimal`, а не строки, и вид с цветом — константы, а не ключи формы.
 *
 * НАБОР БЕЗ СВОЕЙ КАРТИНКИ НЕ УХОДИТ. Сервер такой набор отбрасывает молча (указание на снимке,
 * снятом с карточки, нельзя ни увидеть, ни убрать), и отправлять его значило бы врать себе о том,
 * что сохранилось. Отсев делается по ТОМУ ЖЕ списку вложений, который уезжает в этом же запросе.
 */
function taskInsertToWire(t: TaskInsert): common_TaskInsert {
  return {
    // Поле приехало регеном раньше своей волны; пока форма задачи о проекте не знает, на провод
    // уходит тот же ноль, что уходил до регена.
    projectTopicId: 0,
    ...t,
    mediaAnnotations: (t.mediaAnnotations ?? [])
      .filter((m) => m.mediaId > 0 && t.mediaIds.includes(m.mediaId))
      .map((m) => ({
        mediaId: m.mediaId,
        annotations: (m.annotations ?? []).map(annotationToWire),
      })),
  };
}

function mapInsert(i: common_Task['task']): TaskInsert {
  return {
    title: i?.title ?? '',
    description: i?.description ?? '',
    assignee: i?.assignee ?? '',
    priority: i?.priority ?? 'TASK_PRIORITY_UNKNOWN',
    dueDate: i?.dueDate || undefined,
    startDate: i?.startDate || undefined,
    labels: i?.labels ?? [],
    mediaIds: i?.mediaIds ?? [],
    fileIds: i?.fileIds ?? [],
    techCardId: i?.techCardId ?? 0,
    productId: i?.productId ?? 0,
    orderUuid: i?.orderUuid ?? '',
    archiveId: i?.archiveId ?? 0,
    fittingId: i?.fittingId ?? 0,
    productionRunId: i?.productionRunId ?? 0,
    sampleId: i?.sampleId ?? 0,
    mediaAnnotations: (i?.mediaAnnotations ?? []).map(mapMediaAnnotations),
  };
}

function mapChecklistItem(c: common_TaskChecklistItem): TaskChecklistItem {
  return {
    id: c.id ?? 0,
    content: c.content ?? '',
    isDone: c.isDone ?? false,
    position: c.position ?? 0,
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
    // Resolved only by GetTask; a list row knows the ids and nothing else.
    files: [],
    checklist: (t.checklist ?? []).map(mapChecklistItem).sort((a, b) => a.position - b.position),
    createdBy: t.createdBy ?? '',
    createdAt: t.createdAt ?? '',
    updatedAt: t.updatedAt ?? '',
    startedAt: t.startedAt ?? '',
    archivedAt: t.archivedAt ?? '',
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
/**
 * ListTasks clamps a missing limit to the backend's DEFAULT page (200) and its ceiling is 1000
 * (internal/store/task/task.go). A kanban board wants the whole column set, and the all-boards
 * rail-count read wants every task, so ask for the ceiling explicitly instead of silently taking
 * the 200-row default. `total` is still compared against the returned length by the caller — past
 * 1000 tasks the board would drop cards, and it says so rather than hiding them.
 */
export const TASKS_PAGE_LIMIT = 1000;

export const tasksService: TasksService = {
  listTasks: (filter) =>
    adminService
      .ListTasks({
        board: filter.board,
        status: filter.status,
        assignee: filter.assignee,
        limit: TASKS_PAGE_LIMIT,
        offset: undefined,
        orderFactor: undefined,
        techCardId: filter.techCardId,
        productId: filter.productId,
        orderUuid: filter.orderUuid ?? '',
        archiveId: filter.archiveId ?? 0,
        fittingId: filter.fittingId ?? 0,
        productionRunId: filter.productionRunId ?? 0,
        sampleId: filter.sampleId ?? 0,
        // См. довод у `taskInsertToWire`: фильтр по проекту приезжает своей волной.
        projectTopicId: 0,
        includeArchived: filter.includeArchived,
      })
      .then((r) => ({ tasks: (r.tasks ?? []).map(mapTask), total: r.total ?? 0 })),

  getTask: (id) =>
    adminService.GetTask({ id }).then((r) =>
      r.task
        ? {
            ...mapTask(r.task),
            // Вложение проносится КАК ПРИЕХАЛО (`LibraryFile`): плитка вложения — та же, что
            // в разделе «файлы», и ей нужны тема, загрузивший и тип содержимого, а не три
            // ссылки. Подписанные ссылки внутри живут ровно столько, сколько этот ответ.
            files: r.files ?? [],
          }
        : undefined,
    ),

  addTask: (content, board, status) =>
    adminService
      .AddTask({ task: taskInsertToWire(content), board, status })
      .then((r) => ({ id: r.id ?? 0 })),

  updateTask: (id, content) =>
    adminService.UpdateTask({ id, task: taskInsertToWire(content) }).then(() => undefined),

  moveTask: (id, board, status, position) =>
    adminService.MoveTask({ id, board, status, position }).then(() => undefined),

  deleteTask: (id) => adminService.DeleteTask({ id }).then(() => undefined),

  archiveTask: (id) => adminService.ArchiveTask({ id }).then(() => undefined),

  unarchiveTask: (id) => adminService.UnarchiveTask({ id }).then(() => undefined),

  addComment: (taskId, body) =>
    adminService.AddTaskComment({ comment: { taskId, body } }).then((r) => ({ id: r.id ?? 0 })),

  listComments: (taskId) =>
    adminService.ListTaskComments({ taskId }).then((r) => (r.comments ?? []).map(mapComment)),

  addChecklistItem: (taskId, content) =>
    adminService.AddTaskChecklistItem({ taskId, content }).then((r) => ({ id: r.id ?? 0 })),

  setChecklistItemDone: (id, isDone) =>
    adminService.SetTaskChecklistItemDone({ id, isDone }).then(() => undefined),

  deleteChecklistItem: (id) => adminService.DeleteTaskChecklistItem({ id }).then(() => undefined),
};
