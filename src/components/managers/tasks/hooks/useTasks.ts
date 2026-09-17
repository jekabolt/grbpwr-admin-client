import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSnackBarStore } from 'lib/stores/store';
import {
  ListTasksFilter,
  Task,
  TaskBoard,
  TaskComment,
  TaskInsert,
  TaskRelationKind,
  TaskStatus,
} from '../api/types';
import { tasksService } from '../api/tasksService';
import { applyMove } from '../utils/order';

type MaybeTask = Task | undefined;

export const tasksKeys = {
  all: ['tasks'] as const,
  list: (filter: ListTasksFilter) => [...tasksKeys.all, 'list', filter] as const,
  detail: (id: number) => [...tasksKeys.all, 'detail', id] as const,
  comments: (taskId: number) => [...tasksKeys.all, 'comments', taskId] as const,
};

type ListResult = { tasks: Task[]; total: number };

/**
 * КЛЮЧ ЛЕТЯЩЕЙ ИНЛАЙН-ЗАПИСИ. Заведён не ради кэша, а ради ЗАСОВА: он живёт в `MutationCache` на
 * `QueryClient`, то есть в приложении, а не в экземпляре компонента, — и поэтому переживает уход
 * со страницы и возврат на неё (см. `useInlineTaskPatch`).
 */
const inlinePatchKey = (taskId: number) => ['task-inline-patch', taskId] as const;

// ---- Reads ----

/**
 * `enabled` — для мест, которые рисуют пикер задач, но открывают его редко (тот же приём, что у
 * `useAdmins`). Хук нельзя позвать условно, а список задач — это чтение всей доски: на детальной
 * странице оно уходило бы при каждом открытии карточки ради поповера, которого никто не трогал.
 */
export function useTasks(filter: ListTasksFilter, enabled = true) {
  return useQuery({
    queryKey: tasksKeys.list(filter),
    queryFn: () => tasksService.listTasks(filter),
    staleTime: 30_000,
    enabled,
  });
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: tasksKeys.detail(id ?? -1),
    queryFn: () => tasksService.getTask(id as number),
    enabled: id != null && id > 0,
    staleTime: 30_000,
    /**
     * ТОЧЕЧНАЯ ОТМЕНА ГЛОБАЛЬНОГО `refetchOnWindowFocus: false` (`src/index.tsx`).
     *
     * На этой странице теперь ПИШУТ инлайном, и окно несвежести стало ценой, а не мелочью:
     * без перечитывания по фокусу открытая час назад карточка показывала бы содержимое
     * часовой давности, и человек правил бы поверх того, чего уже нет. С фокусом окно
     * сжимается до `staleTime` — 30 секунд. Само по себе это гонку НЕ закрывает (её закрывает
     * свежее чтение перед каждой записью в `useInlineTaskPatch`), но сужает окно, в котором
     * человек вообще МОЖЕТ начать править устаревшее.
     */
    refetchOnWindowFocus: true,
  });
}

export function useTaskComments(taskId: number | null) {
  return useQuery({
    queryKey: tasksKeys.comments(taskId ?? -1),
    queryFn: () => tasksService.listComments(taskId as number),
    enabled: taskId != null,
    staleTime: 15_000,
  });
}

// ---- Mutations ----

export function useCreateTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: {
      content: TaskInsert;
      board: TaskBoard;
      status: TaskStatus;
      /**
       * Родитель СОЗДАВАЕМОЙ карточки; 0/undefined = верхний уровень. Едет тем же вызовом, а не
       * вторым `SetTaskParent`: отказ на втором оставил бы карточку на верхнем уровне, и о ней
       * никто бы не узнал — искать её пошли бы в детях.
       */
      parentTaskId?: number;
    }) => tasksService.addTask(vars.content, vars.board, vars.status, vars.parentTaskId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage(vars.parentTaskId ? 'Subtask created' : 'Task created', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to create task', 'error'),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number; content: TaskInsert }) =>
      tasksService.updateTask(vars.id, vars.content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task saved', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save task', 'error'),
  });
}

// ---- Инлайн-правка одного поля ----
//
// `UpdateTask` — ПОЛНАЯ ЗАМЕНА содержимого: маски полей на проводе нет, и запись отправляет
// заголовок, описание, метки, ссылки и указания ЦЕЛИКОМ. Значит любая запись по копии, взятой
// со страницы, откатывает всё, что кто-то другой изменил после того, как страницу открыли.
// Дефект не падает и ничего не говорит — он молча теряет чужой текст, поэтому лечится он не
// аккуратностью на местах вызова, а единственной дверью, через которую инлайн-правка ходит.

/** Что человек правит: подмножество полей содержимого. */
export type InlinePatch = Partial<TaskInsert>;

export type InlineMergeResult =
  | { ok: true; content: TaskInsert }
  | { ok: false; field: keyof TaskInsert };

/**
 * СЛОВО, КОТОРОЕ ВИДИТ ЧЕЛОВЕК ПРИ КОНФЛИКТЕ. Экспортируется, чтобы страница и проба говорили
 * об одном и том же событии одной строкой, а не двумя похожими.
 */
export const INLINE_CONFLICT_MESSAGE =
  'this field was just changed by someone else — the page has been refreshed';

/**
 * СЛОВО ПРО ВТОРУЮ ПРАВКУ ПОВЕРХ ЛЕТЯЩЕЙ ПЕРВОЙ. Отдельное от конфликта СОЗНАТЕЛЬНО: конфликт
 * говорит «пришла чужая правка, посмотри», а здесь чужого нет вовсе — не долетела МОЯ предыдущая,
 * и повтор через мгновение пройдёт. Одно слово на два разных события учило бы искать чужую правку
 * там, где её нет.
 */
export const INLINE_BUSY_MESSAGE = 'another change is still saving — try again in a moment';

// Сравнение «то ли это, что человек видел, когда начинал править». Скаляры — по значению,
// массивы и объекты — по JSON: у содержимого карточки есть и списки (метки, вложения), и
// ссылка на них меняется на каждом чтении, хотя состав тот же.
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * СЛИЯНИЕ ПРАВКИ СО СВЕЖИМ ЧТЕНИЕМ — чистая функция, потому что это ВЕСЬ смысл правки, и его
 * надо уметь проверить без браузера.
 *
 * Два разных вопроса, и оба обязательны:
 *
 *  1. КОНФЛИКТ. Правленое поле сверяется с `base` — тем значением, которое человек видел,
 *     начиная. Разошлось — записи НЕТ вовсе: чужая правка ТОГО ЖЕ поля не должна проигрывать
 *     по времени нажатия.
 *  2. СЛИЯНИЕ. Все ОСТАЛЬНЫЕ поля берутся из свежего чтения, а не из открытой страницы. Ровно
 *     поэтому чужая правка описания переживает мою правку приоритета: моя копия описания
 *     тридцатисекундной давности в запись не попадает вовсе.
 */
export function mergeInlinePatch(
  fresh: TaskInsert,
  base: TaskInsert,
  patch: InlinePatch,
): InlineMergeResult {
  for (const key of Object.keys(patch) as (keyof TaskInsert)[]) {
    if (!sameValue(fresh[key], base[key])) return { ok: false, field: key };
  }
  return { ok: true, content: { ...fresh, ...patch } as TaskInsert };
}

/**
 * ЕДИНСТВЕННАЯ ДВЕРЬ ИНЛАЙН-ЗАПИСИ. Каждая запись = свежее чтение → проверка конфликта →
 * запись слитого содержимого.
 *
 * ЧЕСТНО ПРО ОСТАТОК: окно между свежим чтением и записью остаётся — двое, нажавшие в один и тот
 * же миг, всё ещё могут разойтись. Полностью это закрывается только сравнением-и-записью по
 * `updated_at` НА СЕРВЕРЕ; с клиента окно можно сузить с часов до долей секунды, что здесь и
 * сделано, но не убрать.
 */
export function useInlineTaskPatch(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const mutation = useMutation({
    mutationKey: inlinePatchKey(taskId),
    mutationFn: async (vars: { patch: InlinePatch; base: TaskInsert }) => {
      // МИМО КЭША, а не `qc.fetchQuery`: у чтения `staleTime` 30 секунд, и кэш законно ответил
      // бы той же копией, ради обхода которой всё это и написано.
      const fresh = await tasksService.getTask(taskId);
      if (!fresh) throw new Error('task was deleted');
      const merged = mergeInlinePatch(fresh.task, vars.base, vars.patch);
      if (!merged.ok) {
        // Страница обязана показать НОВОЕ значение — иначе человек повторит ту же правку по той
        // же устаревшей копии и получит тот же отказ.
        qc.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
        throw new Error(INLINE_CONFLICT_MESSAGE);
      }
      await tasksService.updateTask(taskId, merged.content);
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save', 'error'),
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });

  /**
   * ЗАСОВ: ВТОРАЯ ИНЛАЙН-ЗАПИСЬ НЕ НАЧИНАЕТСЯ, ПОКА ЛЕТИТ ПЕРВАЯ.
   *
   * ЧТО ЛОМАЛОСЬ. Конфликт-проверка выше смотрит ТОЛЬКО на правленые ключи. Значит вторая
   * запись, начатая пока летит первая, проходит проверку насквозь: её собственное свежее чтение
   * возвращает карточку ДО первой правки, и полное содержимое уносит соседнее поле устаревшим.
   * Первая запись садится, вторая садится следом и откатывает её — обе рапортуют успехом.
   * Замерено на паре «приоритет + описание»: приоритет молча возвращался к прежнему.
   *
   * ПОЧЕМУ НЕ `isPending`. `isPending` — состояние: оно становится истинным только после
   * ПЕРЕРИСОВКИ, а два жеста успевают пройти в ОДНОМ такте (двойной ⌘Enter, клик по кнопке сразу
   * за выбором в рейке). Спросить надо то, что меняется СИНХРОННО с жестом.
   *
   * ПОЧЕМУ `isMutating` ПО КЛЮЧУ, А НЕ `useRef`. Ref принадлежит ЭКЗЕМПЛЯРУ хука и умирает вместе
   * с ним: ушёл на доску и вернулся, пока запись летит, — новый ref равен `false`, и засова
   * больше нет ровно в том сценарии, где запись самая долгая. `MutationCache` живёт на
   * `QueryClient`, то есть на всё приложение, и переживает и размонтирование, и второй экземпляр
   * страницы. Синхронность при этом та же: `mutate` кладёт запись в кэш и переводит её в
   * `pending` ДО первого `await` внутри `execute()` — проверено по исходнику 5.81.5.
   *
   * ПОЧЕМУ ОБЁРТКА НАД `mutateAsync`, А НЕ ПРОВЕРКА ВНУТРИ `mutationFn`. React Query зовёт
   * `mutationFn` через несколько микрозадач (`await onMutate`), то есть НЕ синхронно с жестом, —
   * засов внутри него опоздал бы ровно на тот случай, ради которого заведён.
   *
   * СНИМАЕТСЯ САМ. Отдельного «отпустить» нет: запись перестаёт быть `pending`, когда ОТСТРЕЛЯЛАСЬ
   * ЦЕЛИКОМ — вместе с повторными попытками (`mutations.retry: 1` в `src/index.tsx`) и вместе с
   * `onSettled`, промис которого React Query дожидается. Конфликт отпирает карточку так же, как
   * успех, — но не раньше, чем отработает последняя попытка.
   *
   * ЧЕСТНО ПРО ОСТАТОК. Запрос, который не заканчивается НИКОГДА (полуоткрытое соединение;
   * `src/api/api.ts` ходит голым `fetch` без таймаута и без `AbortSignal`), держит засов до
   * перезагрузки приложения — уход со страницы его больше не сбрасывает, в том и смысл. Это
   * СОЗНАТЕЛЬНЫЙ размен: карточка становится нередактируемой, и человеку об этом говорят словами,
   * вместо того чтобы дать второй записи молча откатить первую. Снять остаток может только
   * таймаут в сетевом слое — правка на всё приложение, и она не здесь.
   *
   * ОТКАЗ, А НЕ ОЧЕРЕДЬ. Очередь пришлось бы писать поверх `base`, взятого в начале правки:
   * отложенная запись садилась бы по «увиденному» минутной давности, и «сохранил» значило бы
   * разное в зависимости от того, стояла ли она в очереди. Так же ведут себя и остальные
   * контролы рейки — они просто глохнут на время полёта (`isPending`); засов договаривает то же
   * правило для жестов, которые перерисовку обогнали.
   *
   * ЗАПИРАЕТ ВСЮ КАРТОЧКУ, А НЕ ПОЛЕ. Иначе и нельзя: `UpdateTask` заменяет содержимое ЦЕЛИКОМ,
   * поэтому две записи по РАЗНЫМ полям мешают друг другу ровно так же, как по одному.
   */
  const { mutateAsync } = mutation;
  const guarded = useCallback(
    async (vars: { patch: InlinePatch; base: TaskInsert }) => {
      if (qc.isMutating({ mutationKey: inlinePatchKey(taskId) }) > 0) {
        showMessage(INLINE_BUSY_MESSAGE, 'error');
        throw new Error(INLINE_BUSY_MESSAGE);
      }
      return mutateAsync(vars);
    },
    [qc, taskId, mutateAsync, showMessage],
  );

  /**
   * «ЗАНЯТО» ДЛЯ КОНТРОЛОВ — ИЗ ТОГО ЖЕ КЭША, ЧТО И ЗАСОВ, А НЕ ИЗ `mutation.isPending`.
   *
   * `mutation.isPending` принадлежит НАБЛЮДАТЕЛЮ этого экземпляра хука. После ухода со страницы и
   * возврата наблюдатель новый, текущей записи у него нет, и он говорит «свободно», пока запись
   * ещё летит. Контролы при этом отпираются, а дверь — нет: экран и дверь начинают расходиться, и
   * расходятся они молча. Хуже того, на этом же флаге висит кнопка «edit», открывающая модалку, —
   * а модалка пишет СВОЕЙ дверью (`useUpdateTask`), и засов её не удержит вовсе.
   *
   * `useIsMutating` смотрит в `MutationCache` и подписан на него, поэтому после возврата на
   * страницу контролы заперты ровно столько, сколько заперта дверь.
   */
  const isPending = useIsMutating({ mutationKey: inlinePatchKey(taskId) }) > 0;

  // НАРУЖУ — ТОЛЬКО ДВЕ ВЕЩИ. Не `{...mutation}`: у наблюдателя есть свой `isPending` и свой
  // `status`, и они законно расходятся с кэшем после перемонтирования. Отдать их рядом значило бы
  // положить в одну дверь два разных ответа на вопрос «летит ли запись».
  return { isPending, mutateAsync: guarded };
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => tasksService.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task deleted', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to delete task', 'error'),
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => tasksService.archiveTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task archived', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to archive task', 'error'),
  });
}

export function useUnarchiveTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => tasksService.unarchiveTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task restored', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to restore task', 'error'),
  });
}

// ---- Checklist ----
// Items live on the task detail (Task.checklist). Mutations invalidate the whole
// `tasks` tree so the detail refetches and card progress badges refresh. The
// toggle is optimistic on the detail query for a snappy checkbox.

export function useAddChecklistItem(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (content: string) => tasksService.addChecklistItem(taskId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to add checklist item', 'error'),
  });
}

export function useSetChecklistItemDone(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = tasksKeys.detail(taskId);
  return useMutation({
    mutationFn: (vars: { id: number; isDone: boolean }) =>
      tasksService.setChecklistItemDone(vars.id, vars.isDone),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MaybeTask>(key);
      if (previous) {
        qc.setQueryData<Task>(key, {
          ...previous,
          checklist: previous.checklist.map((c) =>
            c.id === vars.id ? { ...c, isDone: vars.isDone } : c,
          ),
        });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showMessage(e instanceof Error ? e.message : 'Failed to update checklist', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

export function useDeleteChecklistItem(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = tasksKeys.detail(taskId);
  return useMutation({
    mutationFn: (id: number) => tasksService.deleteChecklistItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MaybeTask>(key);
      if (previous) {
        qc.setQueryData<Task>(key, {
          ...previous,
          checklist: previous.checklist.filter((c) => c.id !== id),
        });
      }
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showMessage(e instanceof Error ? e.message : 'Failed to remove checklist item', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

// Optimistic drag-and-drop move. The board query for `filter` is patched
// immediately via the same applyMove the adapter uses, so the card lands in its
// new column with no flicker; a failure rolls back and re-syncs.
export function useMoveTask(filter: ListTasksFilter) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = tasksKeys.list(filter);
  return useMutation({
    mutationFn: (vars: { id: number; board: TaskBoard; status: TaskStatus; position: number }) =>
      tasksService.moveTask(vars.id, vars.board, vars.status, vars.position),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ListResult>(key);
      if (previous) {
        const tasks = applyMove(previous.tasks, vars.id, vars.status, vars.position);
        qc.setQueryData<ListResult>(key, { ...previous, tasks });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showMessage(e instanceof Error ? e.message : 'Failed to move task', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

export function useAddComment(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (body: string) => tasksService.addComment(taskId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.comments(taskId) }),
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to add comment', 'error'),
  });
}


// ---- Сабтаски и связи ----
//
// ПИШУТСЯ ТОЛЬКО ОТДЕЛЬНЫМИ RPC, НИКОГДА ЧЕРЕЗ `TaskInsert`. Связь принадлежит ДВУМ карточкам
// сразу: полная замена «связей карточки A» при сохранении её формы снесла бы связь, добавленную
// с карточки B, пока форма A была открыта. То же про родителя — он есть в ответе на чтение, но в
// содержимом его нет намеренно.
//
// Все три идемпотентны на сервере, поэтому повторное нажатие — no-op, а не отказ: кнопки здесь
// описывают ЖЕЛАЕМОЕ состояние, а не приращение.

export function useSetTaskParent() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number; parentTaskId: number }) =>
      tasksService.setTaskParent(vars.id, vars.parentTaskId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage(vars.parentTaskId ? 'Parent set' : 'Moved to top level', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to set parent', 'error'),
  });
}

export function useAddTaskRelation() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { taskId: number; otherTaskId: number; kind: TaskRelationKind }) =>
      tasksService.addRelation(vars.taskId, vars.otherTaskId, vars.kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Linked', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to link tasks', 'error'),
  });
}

export function useDeleteTaskRelation() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { taskId: number; otherTaskId: number; kind: TaskRelationKind }) =>
      tasksService.deleteRelation(vars.taskId, vars.otherTaskId, vars.kind),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Link removed', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to remove link', 'error'),
  });
}

/**
 * УДАЛЕНИЕ СВОЕЙ РЕПЛИКИ.
 *
 * Оптимистично снимает строку из ленты — но `onError` ВОЗВРАЩАЕТ ЕЁ НА МЕСТО. Отказ здесь не
 * теоретический: право проверяет СЕРВЕР (совпадение имени при живой ссылке), и клиентская
 * проверка, решающая, рисовать ли кнопку, защитой не является — она лишь не предлагает заведомо
 * невозможного. Исчезнувшая после отказа реплика была бы худшим из исходов: человек решил бы,
 * что слова стёрты, а они на месте.
 */
export function useDeleteComment(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = tasksKeys.comments(taskId);
  return useMutation({
    mutationFn: (id: number) => tasksService.deleteComment(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<TaskComment[]>(key);
      if (previous) qc.setQueryData<TaskComment[]>(key, previous.filter((c) => c.id !== id));
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showMessage(e instanceof Error ? e.message : 'Failed to delete comment', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
