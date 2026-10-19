import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { format } from 'date-fns';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cn } from 'lib/utility';
import {
  AddDoor,
  BackLink,
  Button,
  CalloutBox,
  ConfirmationModal,
  EmptyCell,
  Arrow,
  GenericPopover,
  Pill,
  Section,
  SectionStack,
  Select,
  Text,
} from 'ui';
import {
  TaskBoard,
  TaskFormValues,
  TaskMediaAnnotations,
  TaskPriority,
  TaskStatus,
} from '../api/types';
import { AvatarStack } from '../components/avatar-stack';
import { LinkChip } from '../components/link-chip';
import { TaskChecklist } from '../components/task-checklist';
import { TaskComments } from '../components/task-comments';
import { TaskFormModal } from '../components/task-form-modal';
import { orderedMedia } from '../api/tasksService';
import { useTaskMediaViewer } from '../components/task-media-viewer';

import {
  useArchiveTask,
  useDeleteTask,
  useInlineTaskPatch,
  useMoveTask,
  useTask,
  useUnarchiveTask,
  useUpdateTask,
  type InlinePatch,
} from '../hooks/useTasks';
import { AttachmentTiles } from './attachment-tiles';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { mergePickedMedia } from '../components/media-attachments';
import { DueField, InlineDescription, InlineTitle } from './inline-fields';
import { AssigneesPicker } from '../components/assignees-picker';
import { TaskDescriptionView } from '../components/task-description';
import { ParentPicker, TaskRelations } from '../components/task-relations';
import { openBlockers } from '../utils/relations';
import { taskLinks } from '../utils/links';
import {
  BOARD_LABEL,
  BOARDS,
  dueMeta,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUSES,
  toOptions,
} from '../utils/meta';

/**
 * tskDetail v3 («what to do first», owner OK 19.10). One order on phone and desktop:
 * back + «⋯» actions → title → status · priority · due → blocked → description → fields
 * (assignee / board / planned start; the rest under «more») → checklist → attachments →
 * subtasks & links → comments. From `lg` up the fields and comments keep the right rail.
 * Every field stays inline-editable through the same doors as before.
 */

const boardOptions = toOptions(BOARDS, BOARD_LABEL);
const statusOptions = toOptions(STATUSES, STATUS_LABEL);
const priorityOptions = [
  { value: 'TASK_PRIORITY_UNKNOWN', label: 'no priority' },
  ...toOptions(PRIORITIES, PRIORITY_LABEL),
];

// Пока карточка грузится, вложений нет — но хук вызывается до всякого раннего возврата, и новый
// литерал на каждый рендер пересобирал бы его мемоизацию впустую.
const NO_ANNOTATIONS: TaskMediaAnnotations[] = [];

/** The «⋯» menu's rows: one footprint, a hairline between, the last one bare. */
const MENU_ITEM =
  'flex min-h-11 w-full items-center border-b border-hairline px-1 text-left text-control uppercase tracking-label hover:bg-bgSecondary sm:min-h-8';
/** The chips under the title: every property, one size and one type (11px caps), Select or not. */
const CHIP =
  'min-h-11 w-auto gap-3 px-2.5 text-control uppercase leading-none tracking-label sm:min-h-8';
/** A chip that is not a Select (assignee, more): the same box, drawn by hand. */
const CHIP_BOX =
  'flex min-h-11 items-center gap-2 border border-borderColor bg-bgColor px-2.5 text-control uppercase leading-none tracking-label sm:min-h-8';
/** The assignees picker inside a chip: its trigger loses its own box; the list keeps a usable width. */
const ASSIGNEE_IN_CHIP =
  'min-w-0 [&_[data-assignees-trigger]]:min-h-0 [&_[data-assignees-trigger]]:border-0 [&_[data-assignees-trigger]]:bg-transparent [&_[data-assignees-trigger]]:px-0 [&_[data-assignees-trigger]]:py-0 [&_[data-assignees-trigger]]:text-control [&_[data-assignees-trigger]]:uppercase [&_[data-assignees-popup]]:min-w-60';

// Centered chrome shared by the loading / not-found states.
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className='mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 text-center'>
      {children}
    </div>
  );
}

export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const numId = id ? parseInt(id, 10) : undefined;

  const { account, canWrite: canWriteSection } = usePermissions();
  const canWrite = canWriteSection(SECTION.tasks);

  const { data: task, isLoading, isError } = useTask(numId ?? null);

  const updateTask = useUpdateTask();
  const inlinePatch = useInlineTaskPatch(numId ?? 0);
  const deleteTask = useDeleteTask();
  const archiveTask = useArchiveTask();
  const unarchiveTask = useUnarchiveTask();
  const move = useMoveTask(useMemo(() => ({ board: task?.board }), [task?.board]));

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickingParent, setPickingParent] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const mediaTrigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  function editDescriptionOnClick(e: React.MouseEvent<HTMLDivElement>) {
    // ТОЛЬКО ИЗ СВОЕГО DOM. Просмотрщик вложений, открытый из описания, рисуется порталом, а
    // React ведёт всплытие по дереву КОМПОНЕНТОВ, а не по DOM: двойной щелчок по холсту
    // рисования или по счётчику кадров доходил бы сюда, открывал правку и размонтировал
    // просмотрщик вместе с ненарисованным.
    if (!(e.target instanceof Element) || !e.currentTarget.contains(e.target)) return;
    if (e.target.closest('a, button, [role="button"], img, video, input, textarea, select')) return;
    // Протянутое выделение — это чтение (копируют кусок), а не просьба править.
    if (window.getSelection()?.toString()) return;
    setEditingDescription(true);
  }

  /**
   * ОДНА ФУНКЦИЯ НА ВСЕ ИНЛАЙН-ПОЛЯ. `seen` — значения ПРАВЛЕНЫХ полей, какими человек их
   * видел, НАЧИНАЯ править; дальше решает хук: сверить, слить со свежим чтением и записать
   * (или отказать словами). Второй аргумент обязателен у всех вызовов — каждое место обязано
   * сказать, от чего оно отталкивалось, а не молча взять последнее, что приехало с сервера.
   * Отказ уже показан снекбаром внутри хука — здесь он только глушится, чтобы не всплыть
   * необработанным промисом.
   */
  async function patchInline(patch: InlinePatch, seen: InlinePatch): Promise<boolean> {
    if (!task) return false;
    try {
      // `seen` НАКЛАДЫВАЕТСЯ НА ЖИВУЮ КАРТОЧКУ, а не берётся из неё: конфликт-проверка читает
      // только ключи `patch`, и для них истина — то, что человек видел, начиная править.
      // Живой `task.task` подходит для мгновенных контролов рейки (там увиденное = нарисованное),
      // но НЕ для заголовка и описания: пока их правят, чужое значение доезжает в кэш незаметно,
      // и сверка с живым сравнивала бы чужую правку саму с собой.
      await inlinePatch.mutateAsync({ patch, base: { ...task.task, ...seen } });
      return true;
    } catch {
      // Снекбар показан мутацией. ВОЗВРАЩАЕМ ОТКАЗ, а не глотаем его: редактор обязан остаться
      // открытым с набранным текстом — иначе конфликт стоил бы человеку его собственной правки
      // вдобавок к чужой.
      return false;
    }
  }

  /**
   * ИНЛАЙН-ЗАПИСЬ С ЭТОЙ СТРАНИЦЫ РАЗРЕШЕНА РОВНО ЧЕРЕЗ `useInlineTaskPatch` — И БОЛЬШЕ НИКАК.
   *
   * Прежний довод («страница не перечитывает карточку по своей воле, поэтому писать отсюда
   * нельзя») перестал быть правдой в двух местах сразу: чтение получило `refetchOnWindowFocus`,
   * а каждая инлайн-запись делает СВОЁ свежее чтение перед записью и сверяет правленое поле с
   * тем значением, которое человек видел, начиная правку. Прямой вызов `updateTask` с
   * `{...task.task, поле}` из пропсов остаётся ЗАПРЕЩЁННЫМ: `UpdateTask` заменяет содержимое
   * целиком, и такая запись молча откатила бы чужую правку описания, сделанную после того, как
   * эту страницу открыли. Ошибка не падает и ничем себя не выдаёт — поэтому дверь одна.
   *
   * ЧТО ОСТАЁТСЯ ТОЛЬКО В МОДАЛКЕ: вложения, ссылки, метки и УКАЗАНИЯ, нарисованные на снимках.
   * Указания — по-прежнему по явному решению: их правят жестом по холсту, у которого нет
   * «одного изменённого поля», и явная кнопка сохранения — часть этого жеста.
   *
   * Инлайновые селекты доски и колонки сравнением не годятся и здесь: они идут через `MoveTask`,
   * которая содержимого не касается вовсе.
   */
  const annotations = task?.task.mediaAnnotations ?? NO_ANNOTATIONS;

  /**
   * ОДИН ИСТОЧНИК НУМЕРАЦИИ НА ОБА ЭКРАНА — список вложений САМОЙ КАРТОЧКИ (`mediaIds`), а не
   * `task.media`, который сервер отдаёт уже разрешённым.
   *
   * Номер в чипе `▣ 3` называет позицию вложения в карточке, и форма правки нумерует именно по
   * `mediaIds`. Если сервер не вернул медиа по какому-то id (удалено из бакета, не отдалось),
   * `task.media` короче — и то же самое описание читалось бы на двух экранах с разными номерами,
   * а живая ссылка рисовалась бы мёртвой. Той же функцией, что и форма: `orderedMedia` берёт
   * миниатюры из кэша, который наполняет каждое серверное чтение.
   */
  const media = useMemo(() => orderedMedia(task?.task.mediaIds ?? []), [task?.task.mediaIds]);

  // Единственная дверь к вложению на этом экране: ею открывают и плитку в галерее, и ссылку
  // посреди описания, и ссылку из комментария.
  // Указания здесь ТОЛЬКО ЧИТАЮТСЯ (см. довод у `canWrite` в хуке) — и об этом сказано прямо на
  // месте панели видов. Пустое место там читалось как «на вложении карточки указаний не рисуют»,
  // хотя вся палитра доступна в правке. Подсказка только тому, у кого кнопка «edit» есть.
  const attachments = useTaskMediaViewer({
    media,
    annotations,
    readOnlyNote: canWrite ? 'edit to draw' : undefined,
  });

  /**
   * СЧИТАЕТСЯ ПО СОДЕРЖИМОМУ ФОРМЫ, А НЕ ПО ВСЕМУ ОТВЕТУ. Открытая модалка делает
   * `reset(initial)` на каждую смену ссылки — и по `[task]` это значило «на каждое фоновое
   * перечитывание».
   *
   * Структурное разделение react-query держит ссылку стабильной, пока данные не изменились, но
   * `GetTask` несёт ещё и файлы библиотеки, а их подписанные ссылки МИНТУЮТСЯ НА КАЖДЫЙ ОТВЕТ:
   * ответ никогда не равен предыдущему, и `task` меняется, хотя ни одно поле формы не менялось.
   * Перечитывание при этом запускает сама страница — сорвавшееся превью зовёт
   * `invalidateQueries` (attachment-tiles.tsx), а подпись живёт 6–12 часов при вкладке, открытой
   * дольше. Итог был такой: человек печатает описание, у него на глазах срывается превью, и
   * заголовок с описанием откатываются к серверным — без единого слова и без отмены по ⌘Z.
   *
   * Зависимости — ровно те три куска, из которых собирается `initial`. `task.task` (содержимое
   * карточки) структурно разделяется и переживает ротацию подписей; доска и колонка — скаляры.
   */
  const initial: TaskFormValues | null = useMemo(
    () => (task ? { ...task.task, board: task.board, status: task.status } : null),
    [task?.task, task?.board, task?.status],
  );

  async function handleSubmit(values: TaskFormValues) {
    if (!task) return;
    const { board, status, ...content } = values;
    try {
      await updateTask.mutateAsync({ id: task.id, content });
      if (board !== task.board || status !== task.status) {
        await move.mutateAsync({ id: task.id, board, status, position: 0 });
      }
      setEditing(false);
    } catch {
      /* snackbar shown by the mutation; keep the modal open */
    }
  }

  function confirmDelete() {
    if (!task) return;
    deleteTask.mutate(task.id, { onSuccess: () => navigate(ROUTES.tasks) });
    setDeleting(false);
  }

  if (isLoading) {
    return (
      <Centered>
        <Text variant='inactive' className='animate-pulse uppercase'>
          loading task…
        </Text>
      </Centered>
    );
  }

  if (isError || !task) {
    return (
      <Centered>
        <Text variant='uppercase' size='large'>
          task not found
        </Text>
        <Text size='micro' variant='label'>
          It may have been deleted, or the link is wrong.
        </Text>
        <BackLink className='inline-flex min-h-11 items-center sm:min-h-0' to={ROUTES.tasks}>
          board
        </BackLink>
      </Centered>
    );
  }

  const t = task.task;
  const due = dueMeta(t.dueDate, task.status === 'TASK_STATUS_DONE' || !!task.archivedAt);
  const links = taskLinks(t);
  // «Моя» — если я В СПИСКЕ, а не первый: витрина не решает, чья это работа.
  const isMine = !!account?.username && t.assignees.includes(account.username);
  const isArchived = !!task.archivedAt;
  // Заархивированный блокер считается ОТКРЫТЫМ, пока не done: архив прячет карточку с доски, но
  // не отменяет «сначала то, потом это» (довод — в `utils/relations.ts`).
  const blockers = openBlockers(task.relations);
  const archiveBusy = archiveTask.isPending || unarchiveTask.isPending;
  const attachmentCount = media.length + task.files.length;

  /**
   * МОДАЛКА НЕ ОТКРЫВАЕТСЯ ПОВЕРХ ЛЕТЯЩЕЙ ИНЛАЙН-ЗАПИСИ. Она — ВТОРАЯ дверь полной замены
   * содержимого: форма засеивается при открытии и намеренно не пересеивается, поэтому открытая
   * до того, как долетел инлайн, она сохранила бы снимок БЕЗ него и молча откатила бы только что
   * поставленный приоритет. Засов в `useInlineTaskPatch` сюда не достаёт: модалка пишет своим
   * `useUpdateTask`, а не инлайновой дверью, — значит удержать её может только замок на входе.
   *
   * РАБОТАЕТ ЭТО РОВНО ПОТОМУ, ЧТО `isPending` ВЗЯТ ИЗ КЭША ЗАПИСЕЙ, а не у наблюдателя:
   * наблюдатель после возврата на страницу говорит «свободно», пока запись ещё летит, и дверь
   * открылась бы ровно в том окне, где модалка опаснее всего.
   *
   * ЧЕГО ЭТОТ ЗАМОК НЕ ЗАКРЫВАЕТ: модалку, открытую ДО начала инлайн-записи. Её снимок стареет
   * по общему правилу формы, и это отдельный разговор — про вторую дверь, а не про гонку двух
   * инлайнов.
   *
   * Дверь к модалке на странице одна — «edit all fields» в меню «⋯»; тот же замок стоит и на
   * «+ media», которая пишет инлайновой дверью.
   */
  const editLocked = inlinePatch.isPending;
  const openEditor = () => {
    if (!editLocked) setEditing(true);
  };

  const moveTo = (board: TaskBoard, status: TaskStatus) =>
    canWrite &&
    (board !== task.board || status !== task.status) &&
    move.mutate({ id: task.id, board, status, position: 0 });

  /**
   * «+ MEDIA» ОТКРЫВАЕТ МЕДИАТЕКУ, А НЕ МОДАЛКУ ПРАВКИ (владелец 19.10: «+ file открывает не
   * селектор файлов, а edit task»). Выбранное дописывается к `mediaIds` той же инлайн-дверью, что
   * и остальные поля, — со сверкой по тому списку, какой был на экране при открытии.
   */
  const openMediaPicker = () => {
    if (!editLocked) mediaTrigger.current?.click();
  };

  return (
    <div className='mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-5 overflow-x-clip pb-10'>
      {/* ── 1. Верхняя полоса: дорога назад и меню действий ─────────────────────────────── */}
      <div className='flex items-center justify-between gap-3 border-b border-borderColor'>
        <BackLink className='inline-flex min-h-11 items-center sm:min-h-8' to={ROUTES.tasks}>
          {BOARD_LABEL[task.board]}
        </BackLink>
        {canWrite && (
          <GenericPopover
            open={menuOpen}
            onOpenChange={setMenuOpen}
            noTail
            className='w-56'
            contentProps={{ align: 'end' }}
            triggerProps={{
              'aria-label': 'task actions',
              className:
                'flex min-h-11 min-w-11 items-center justify-center text-stat font-bold sm:min-h-8 sm:min-w-8',
            }}
            openElement={<span aria-hidden>⋯</span>}
          >
            <div role='menu' className='flex flex-col'>
              <Button
                type='button'
                role='menuitem'
                className={MENU_ITEM}
                disabled={editLocked}
                onClick={() => {
                  setMenuOpen(false);
                  openEditor();
                }}
              >
                edit all fields
              </Button>
              <Button
                type='button'
                role='menuitem'
                className={MENU_ITEM}
                onClick={() => {
                  setMenuOpen(false);
                  setPickingParent(true);
                }}
              >
                make subtask of…
              </Button>
              <Button
                type='button'
                role='menuitem'
                className={cn(MENU_ITEM, 'border-b-textColor')}
                loading={archiveBusy}
                onClick={() => {
                  setMenuOpen(false);
                  if (isArchived) unarchiveTask.mutate(task.id);
                  else archiveTask.mutate(task.id);
                }}
              >
                {isArchived ? 'restore' : 'archive'}
              </Button>
              <Button
                type='button'
                role='menuitem'
                className={cn(MENU_ITEM, 'border-b-0 text-error')}
                onClick={() => {
                  setMenuOpen(false);
                  setDeleting(true);
                }}
              >
                delete
              </Button>
            </div>
          </GenericPopover>
        )}
      </div>

      {/* ── 2–3. Заголовок, ряд «статус · приоритет · срок», блокер, архив ─────────────── */}
      <div className='flex flex-col gap-3'>
        <InlineTitle
          value={t.title}
          canWrite={canWrite}
          saving={inlinePatch.isPending}
          onSave={(title, seenTitle) => patchInline({ title }, { title: seenTitle })}
        />

        <div className='flex flex-wrap items-stretch gap-2'>
          {/* Колонка — через `MoveTask`, которая содержимого не касается вовсе. */}
          <Select
            name='detail-status'
            placeholder='status'
            items={statusOptions}
            value={task.status}
            onValueChange={(v: string) => moveTo(task.board, v as TaskStatus)}
            readOnly={!canWrite}
            className={cn(CHIP, 'border-textColor')}
          />
          <Select
            name='detail-priority'
            placeholder='priority'
            items={priorityOptions}
            value={t.priority}
            onValueChange={(v: string) =>
              canWrite &&
              v !== t.priority &&
              patchInline({ priority: v as TaskPriority }, { priority: t.priority })
            }
            readOnly={!canWrite}
            disabled={inlinePatch.isPending}
            className={CHIP}
          />
          <DueField
            label='due'
            value={t.dueDate}
            overdue={due.state === 'overdue'}
            canWrite={canWrite}
            disabled={inlinePatch.isPending}
            onChange={(dueDate) => patchInline({ dueDate }, { dueDate: t.dueDate })}
          />
          <DueField
            label='start'
            value={t.startDate}
            canWrite={canWrite}
            disabled={inlinePatch.isPending}
            onChange={(startDate) => patchInline({ startDate }, { startDate: t.startDate })}
          />
          {/* Доска — через `MoveTask`, как и колонка. Подпись внутри чипа: «production» рядом со
              статусом без неё читалось бы как ещё один статус. */}
          <Select
            name='detail-board'
            placeholder='board'
            items={boardOptions}
            value={task.board}
            onValueChange={(v: string) => moveTo(v as TaskBoard, task.status)}
            readOnly={!canWrite}
            className={CHIP}
            renderValue={(_, item) => (
              <span className='flex items-center gap-2'>
                <span className='text-labelColor'>board</span>
                {item?.label}
              </span>
            )}
          />
          {/* ИСПОЛНИТЕЛЕЙ НЕСКОЛЬКО (п.2 волны). `seen` приходит ОТ ПИКЕРА, а не берётся из
              живого `t.assignees`: пока пикер открыт, чужая правка доезжает в кэш незаметно. */}
          <div className={CHIP_BOX}>
            <Text size='control' component='span' className='shrink-0 uppercase text-labelColor'>
              assignee
            </Text>
            {canWrite ? (
              <div className={ASSIGNEE_IN_CHIP}>
                <AssigneesPicker
                  value={t.assignees}
                  disabled={inlinePatch.isPending}
                  onChange={(next, seen) => patchInline({ assignees: next }, { assignees: seen })}
                />
              </div>
            ) : (
              <span className='flex items-center gap-1.5'>
                <AvatarStack names={t.assignees} />
                <Text
                  size='control'
                  component='span'
                  className={cn('uppercase', !t.assignees.length && 'text-labelColor')}
                >
                  {t.assignees.join(', ') || 'unassigned'}
                </Text>
              </span>
            )}
          </div>
          {/* Себе в один тап — без открытия пикера. */}
          {canWrite && account?.username && !isMine && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              aria-label='assign to me'
              disabled={inlinePatch.isPending}
              onClick={() =>
                patchInline(
                  { assignees: [...t.assignees, account.username!] },
                  { assignees: t.assignees },
                )
              }
              className='min-h-11 shrink-0 self-center text-labelColor hover:text-textColor sm:min-h-0'
            >
              + me
            </Button>
          )}
          <Button
            type='button'
            variant='default'
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(CHIP_BOX, 'text-labelColor hover:text-textColor')}
          >
            {moreOpen ? 'less' : 'more'}
            <span
              aria-hidden
              className={cn(
                'shrink-0 text-textColor transition-transform duration-150 ease-out motion-reduce:transition-none',
                !moreOpen && 'rotate-180',
              )}
            >
              <Arrow />
            </span>
          </Button>
        </div>

        {moreOpen && (
          <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase tracking-label'
            >
              started {task.startedAt ? format(new Date(task.startedAt), 'PP') : <EmptyCell />}
            </Text>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase tracking-label'
            >
              created {task.createdBy ? `${task.createdBy} · ` : ''}
              {task.createdAt ? format(new Date(task.createdAt), 'PP') : <EmptyCell />}
            </Text>
            {t.labels.map((l) => (
              <Pill key={l} tone='mut'>
                {l}
              </Pill>
            ))}
          </div>
        )}

        {canWrite && pickingParent && (
          <ParentPicker task={task} onDone={() => setPickingParent(false)} />
        )}

        {/* ОДНА СТРОКА «blocked» — на что карточка ждёт, а не только сколько. Тон и форма — из
            утверждённого макета; слово `blocked` несёт состояние и без цвета. */}
        {blockers.length > 0 && (
          <CalloutBox
            tone='warning'
            className='flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 sm:min-h-0'
          >
            <Text size='micro' component='span' className='uppercase tracking-label'>
              blocked
            </Text>
            <Link
              to={`/tasks/${blockers[0].taskId}`}
              title={blockers.map((b) => b.title || `#${b.taskId}`).join(', ')}
              className='min-w-0 truncate text-micro underline decoration-transparent underline-offset-2 hover:decoration-current'
            >
              {blockers[0].title || `#${blockers[0].taskId}`}
            </Link>
            {blockers.length > 1 && (
              <Text size='micro' component='span' className='tabular-nums'>
                +{blockers.length - 1}
              </Text>
            )}
          </CalloutBox>
        )}

        {isArchived && (
          <CalloutBox tone='note' className='flex flex-wrap items-center justify-between gap-2'>
            <Text size='micro' component='span' className='uppercase tracking-label'>
              archived{task.archivedAt ? ` · ${format(new Date(task.archivedAt), 'PP')}` : ''}
            </Text>
            <Text size='micro' variant='label' component='span'>
              Hidden from the board. Restore to make it active again.
            </Text>
          </CalloutBox>
        )}
      </div>

      {/* Body — ОДНА КОЛОНКА (выбор владельца 19.10): рейки справа нет, свойства живут чипами
          под заголовком, поэтому сбоку не остаётся пустого места ни при каком содержимом.
          Порядок: описание → чеклист → вложения → связи → комментарии. */}
      <SectionStack className='min-w-0'>
        {/* ── 4. Описание ─────────────────────────────────────────────────────────────── */}
        <Section
          title='description'
          className='min-w-0'
          action={
            canWrite &&
            !editingDescription && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='min-h-11 sm:min-h-0'
                /* Имя РАЗЛИЧИМОЕ: на этой странице есть и «edit all fields» в меню, открывающий
                     модалку. Два одинаковых имени на одном экране — это загадка для читалки с
                     экрана и ловушка для стенда. */
                aria-label='edit description'
                onClick={() => setEditingDescription(true)}
              >
                {t.description ? 'edit' : '+ add'}
              </Button>
            )
          }
        >
          {editingDescription ? (
            /* БЕЗ `key` ПО СЕРВЕРНОМУ ЗНАЧЕНИЮ. Он здесь стоял и размонтировал редактор на
                 каждом фоновом перечитывании описания — то есть молча заменял набранное чужим
                 текстом. Черновик редактор засеивает сам, один раз при открытии. */
            <InlineDescription
              value={t.description}
              media={media}
              saving={inlinePatch.isPending}
              onSave={async (description, seenDescription) => {
                if (await patchInline({ description }, { description: seenDescription }))
                  setEditingDescription(false);
              }}
              onCancel={() => setEditingDescription(false)}
            />
          ) : (
            /* ЩЕЛЧОК ОТКРЫВАЕТ ПРАВКУ, наведение подчёркивает — по слову владельца. Щелчок
                 ПО живому элементу (ссылка, чип вложения, снимок) правку не открывает: он уже
                 сделал своё дело. Протянутое выделение — тоже нет. */
            <div
              onClick={canWrite ? editDescriptionOnClick : undefined}
              className={cn(canWrite && 'cursor-text hover:underline')}
            >
              {t.description ? (
                /* МАРКДАУН, А НЕ СЫРОЙ ТЕКСТ (п.6 волны) — тем же разметчиком, что у заметок
                     библиотеки. Ссылки на вложения карточки при этом остаются чипами: шов между
                     двумя языками одной строки описан в `task-description.tsx`. */
                <TaskDescriptionView
                  text={t.description}
                  media={media}
                  onOpen={attachments.openMedia}
                />
              ) : (
                <Text size='micro' variant='label' component='span'>
                  No description.
                </Text>
              )}
            </div>
          )}
        </Section>

        {/* ── 6. Чеклист ──────────────────────────────────────────────────────────────── */}
        <TaskChecklist
          taskId={task.id}
          items={task.checklist}
          canWrite={canWrite}
          className='min-w-0'
        />

        {/* ── 7. Вложения ─────────────────────────────────────────────────────────────── */}
        {(attachmentCount > 0 || canWrite) && (
          /* Одна секция на оба источника: для читающего карточку «вложение» — это
               вложение, независимо от того, в каком бакете лежат байты.

               ШОВ ДВУХ ВЕТОК, разрешённый в пользу ОБЕИХ. Плитки заменили список документов
                (`task.v2`), а указания на снимках пришли отдельной веткой и уже стоят на бете —
                поэтому плитки унесли с собой всё, что несла галерея: отметку числа указаний и
                открытие ЧЕРЕЗ ОБЩИЙ просмотрщик страницы. Своего просмотрщика у плиток больше
                нет: к вложению ведут три двери (плитка, ссылка в описании, ссылка из
                комментария), и вторая дверь в другой зал означала бы, что выделенное ссылкой
                указание видно не всегда.

                Счёт по `media`, а не по `task.media`: нумерация вложений идёт от `mediaIds`
                самой карточки, и если сервер не разрешил какой-то id, два экрана назвали бы одно
                вложение разными номерами.

                Пусто — секция всё равно стоит (с правом записи): одна дверь «+ media», чтобы
                было видно, что к задаче можно добавить медиа. */
          <Section title={`attachments · ${attachmentCount}`} className='min-w-0'>
            {attachmentCount > 0 ? (
              <AttachmentTiles
                taskId={task.id}
                media={media}
                files={task.files}
                annotations={annotations}
                onOpenMedia={attachments.openIndex}
                onAdd={canWrite && !editLocked ? openMediaPicker : undefined}
              />
            ) : (
              <AddDoor
                className='min-h-11 justify-center py-6'
                disabled={editLocked}
                onClick={openMediaPicker}
              >
                media
              </AddDoor>
            )}
          </Section>
        )}

        {/* ── 8. Сабтаски, блокеры, связи. Пусто — один ряд дверей «+ …». */}
        <TaskRelations task={task} canWrite={canWrite} className='min-w-0' />

        {links.length > 0 && (
          <Section title='links' className='min-w-0'>
            <div className='flex flex-wrap gap-2'>
              {links.map((l) => (
                <LinkChip key={`${l.kind}-${l.to}`} link={l} />
              ))}
            </div>
          </Section>
        )}

        {/* ── 9. Комментарии — последними, под чтением задачи (и на телефоне, и на столе). */}
        <TaskComments
          taskId={task.id}
          media={media}
          onOpenMedia={attachments.openMedia}
          className='min-w-0'
        />
      </SectionStack>

      {attachments.node}

      {/* Медиатека держит своё окно сама и открывается только своим триггером; триггер спрятан,
          его жмут «+ media» секции вложений и плитка «+ media». */}
      {canWrite && (
        <MediaSelector
          label='media'
          purpose='attachment'
          aspectRatio={['Custom']}
          allowMultiple
          showVideos
          saveSelectedMedia={(picked) => {
            const seen = t.mediaIds ?? [];
            const next = mergePickedMedia(seen, picked);
            if (next !== seen) patchInline({ mediaIds: next }, { mediaIds: seen });
          }}
          trigger={
            <Button ref={mediaTrigger} type='button' tabIndex={-1} aria-hidden className='sr-only'>
              media
            </Button>
          }
        />
      )}

      {initial && (
        <TaskFormModal
          open={editing}
          onOpenChange={setEditing}
          mode='edit'
          initial={initial}
          saving={updateTask.isPending || move.isPending}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmationModal
        open={deleting}
        onOpenChange={setDeleting}
        onConfirm={confirmDelete}
        title='delete task'
        confirmLabel='delete'
        width='sm'
      >
        <Text size='micro' component='span'>
          Delete “{t.title}”? This can’t be undone.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
