import type { AnnotationValue } from 'ui/components/annotation/canvas';

// UI-facing view model for the kanban. Mirrors the generated client
// (api/proto-http/admin: common_Task / common_TaskInsert @ proto 26a19e8) but
// with required, defaulted fields (the generated types are all-optional) so
// components stay clean. The adapter in tasksService.ts maps between the two.
//
// Contract shape "split placement from content": TaskInsert is CONTENT only;
// placement (board / status / position) lives on Task and is set at AddTask /
// changed only via MoveTask.

import type { LibraryFile } from 'api/proto-http/admin';

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

// УКАЗАНИЯ, НАРИСОВАННЫЕ НА ОДНОМ ВЛОЖЕНИИ. Тип значения — общий примитив указания
// (`ui/components/annotation/canvas`): и снимок шага тех-карты, и вложение задачи хранят одно и то
// же, потому что рисует их одна поверхность одним жестом.
//
// `pieceLineKey`/`pieceLineKeys` у задачи всегда пусты и СЕРВЕРОМ ОЧИЩАЮТСЯ: деталей кроя у
// карточки нет, выбрать их здесь нечем, а ссылка на деталь чужой тех-карты — это висящий ключ.
// Поле остаётся в типе только потому, что тип общий.
export interface TaskMediaAnnotations {
  mediaId: number;
  annotations: AnnotationValue[];
}

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
  // Files from the private library. Kept separate from mediaIds because the two live
  // in buckets with opposite privacy (media is public on the CDN); the UI merges them
  // into one attachments list so nobody has to hold that distinction in their head.
  fileIds: number[];
  // Optional typed links (0 / '' = none) — mirrors common.TaskInsert.
  techCardId: number;
  productId: number;
  orderUuid: string;
  archiveId: number;
  fittingId: number; // примерка / try-on session (GetFitting)
  productionRunId: number; // производственная партия / production run (GetProductionRun); 0 = none
  sampleId: number; // образец / sample (GetSample); 0 = none (new-flow NF link)
  // УКАЗАНИЯ НА ВЛОЖЕНИЯХ — ЧАСТЬ СОДЕРЖИМОГО, а не отдельный ресурс: сервер заменяет их ЦЕЛИКОМ
  // вместе с карточкой, ровно как mediaIds. Присутствия у repeated-поля нет, поэтому клиент обязан
  // слать то, что прочитал, — иначе первое же сохранение карточки стёрло бы всё нарисованное.
  mediaAnnotations: TaskMediaAnnotations[];
}

/*
 * Здесь стоял урезанный `TaskFile` (id / имя / размер / три ссылки) — «ровно чтобы показать
 * строкой и открыть». Вложения стали плитками, а плитка файла у раздела «файлы» уже есть, и
 * она берёт `LibraryFile` целиком: тему, загрузившего, тип содержимого. Урезанный вид пришлось
 * бы разворачивать обратно фальшивым `LibraryFile` на месте отрисовки — либо заводить вторую
 * плитку для того же самого файла. Поэтому вложение хранится ровно тем, чем его прислал сервер
 * (`GetTaskResponse.files` — это `LibraryFile`), а вид приводится к чему нужно на месте.
 */

// Stored card (common.Task): id + content + placement + resolved media + identity.
export interface Task {
  id: number;
  task: TaskInsert;
  board: TaskBoard;
  status: TaskStatus;
  position: number;
  media: TaskMedia[];
  // Resolved library attachments, present only on GetTask (the list response carries
  // ids alone). They hold presigned urls with a short life, so they are never cached
  // beyond the response that minted them.
  files: LibraryFile[];
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
  // Reverse-link filters — one per typed task attachment. The backend now filters
  // ListTasks server-side by each of these, so an embed on any host entity can ask
  // for exactly its own tasks (see related-tasks.tsx / entity-configs.ts).
  orderUuid?: string;
  archiveId?: number;
  fittingId?: number;
  productionRunId?: number;
  sampleId?: number;
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
    fileIds: [],
    techCardId: 0,
    productId: 0,
    orderUuid: '',
    archiveId: 0,
    fittingId: 0,
    productionRunId: 0,
    sampleId: 0,
    mediaAnnotations: [],
  };
}

// A blank form seeded with the create target's placement.
export function emptyFormValues(board: TaskBoard, status: TaskStatus): TaskFormValues {
  return { ...emptyTaskInsert(), board, status };
}
