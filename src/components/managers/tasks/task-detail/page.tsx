import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { TaskBoard, TaskFormValues, TaskMediaAnnotations, TaskPriority, TaskStatus } from '../api/types';
import { AvatarStack } from '../components/avatar-stack';
import { LinkChip } from '../components/link-chip';
import { PriorityTag } from '../components/task-card';
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
import { FieldLabel, InlineDate, InlineDescription, InlineField, InlineTitle } from './inline-fields';
import { AssigneesPicker } from '../components/assignees-picker';
import { TaskDescriptionView } from '../components/task-description';
import { TaskRelations } from '../components/task-relations';
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
 * tskDetail v2 — two columns. The LEFT reads the task (description / checklist /
 * links / media); the RIGHT is the working rail: the facts (placement, priority,
 * assignee, dates) over the activity (tskComments v1). Placement stays inline-editable
 * so a move never needs the full editor. All off-system greys traded for tokens.
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

// Local label node matching the fact rows' previous uppercase micro styling — the
// shared `Row` takes a plain ReactNode label, it doesn't style it itself.
function FactLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

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
  const navigate = useNavigate();

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
    readOnlyNote: canWrite ? 'press edit on the card to draw on this attachment' : undefined,
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
        <Button asChild variant='main' size='lg'>
          <Link to={ROUTES.tasks}>← back to board</Link>
        </Button>
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

  return (
    <div className='mx-auto flex w-full max-w-5xl flex-col gap-5 pb-10'>
      {/* Header */}
      <div className='flex flex-col gap-3 border-b border-borderColor pb-3'>
        <Link
          to={ROUTES.tasks}
          className='w-fit text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
        >
          ← board
        </Link>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex min-w-0 flex-col gap-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                {BOARD_LABEL[task.board]} · {STATUS_LABEL[task.status]}
              </Text>
              {/* `warn` — В СИСТЕМЕ ЭТО «сломано / мешает / блокирует», а не акцент: тон назван
                  так прямо в шапке примитива, и заблокированная карточка — ровно этот случай. */}
              {blockers.length > 0 && (
                <Pill tone='warn' title={blockers.map((b) => b.title || `#${b.taskId}`).join(', ')}>
                  blocked · {blockers.length}
                </Pill>
              )}
              {task.parentTaskId > 0 && (
                <Link
                  to={`/tasks/${task.parentTaskId}`}
                  className='text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
                >
                  ↑ parent #{task.parentTaskId}
                </Link>
              )}
            </div>
            <InlineTitle
              value={t.title}
              canWrite={canWrite}
              saving={inlinePatch.isPending}
              onSave={(title, seenTitle) => patchInline({ title }, { title: seenTitle })}
            />
          </div>
          {canWrite && (
            <div className='flex shrink-0 flex-wrap justify-end gap-2'>
              <Button type='button' variant='secondary' size='sm' onClick={() => setEditing(true)}>
                edit
              </Button>
              {isArchived ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  loading={archiveBusy}
                  onClick={() => unarchiveTask.mutate(task.id)}
                >
                  restore
                </Button>
              ) : (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  loading={archiveBusy}
                  onClick={() => archiveTask.mutate(task.id)}
                >
                  archive
                </Button>
              )}
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className='text-error'
                onClick={() => setDeleting(true)}
              >
                delete
              </Button>
            </div>
          )}
        </div>

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

      {/* Body */}
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]'>
        {/* Left — reading the task */}
        <SectionStack className='min-w-0'>
          <Section
            title='description'
            action={
              canWrite &&
              !editingDescription && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  /* Имя РАЗЛИЧИМОЕ: на этой странице есть вторая кнопка «edit» — заголовочная,
                     открывающая модалку. Два одинаковых имени на одном экране — это загадка
                     для читалки с экрана и ловушка для стенда. */
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
            ) : t.description ? (
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
          </Section>

          <TaskChecklist taskId={task.id} items={task.checklist} canWrite={canWrite} />

          {/* САБТАСКИ, БЛОКЕРЫ И СВЯЗИ (п.7 волны). Блок стоит СЛЕВА, вместе с чтением задачи, а
              не в рейке фактов: «что мешает начать» и «что из этого уже сделано» — это
              содержание работы, а не её метка. */}
          <TaskRelations task={task} canWrite={canWrite} />

          {links.length > 0 && (
            <Section title='links'>
              <div className='flex flex-wrap gap-2'>
                {links.map((l) => (
                  <LinkChip key={`${l.kind}-${l.to}`} link={l} />
                ))}
              </div>
            </Section>
          )}

          {(media.length > 0 || task.files.length > 0) && (
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
                вложение разными номерами. */
            <Section title={`attachments · ${media.length + task.files.length}`}>
              <AttachmentTiles
                taskId={task.id}
                media={media}
                files={task.files}
                annotations={annotations}
                onOpenMedia={attachments.openIndex}
              />
            </Section>
          )}
        </SectionStack>

        {/* Right — facts + activity */}
        <aside>
          <SectionStack>
            <Section>
              <div className='flex flex-col gap-3'>
                {/* Placement — inline move without opening the editor */}
                <label className='flex flex-col gap-1'>
                  <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                    board
                  </Text>
                  <SelectComponent
                    name='detail-board'
                    items={boardOptions}
                    value={task.board}
                    onValueChange={(v: string) =>
                      canWrite &&
                      v !== task.board &&
                      move.mutate({ id: task.id, board: v as TaskBoard, status: task.status, position: 0 })
                    }
                    readOnly={!canWrite}
                    fullWidth
                  />
                </label>
                <label className='flex flex-col gap-1'>
                  <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
                    column
                  </Text>
                  <SelectComponent
                    name='detail-status'
                    items={statusOptions}
                    value={task.status}
                    onValueChange={(v: string) =>
                      canWrite &&
                      v !== task.status &&
                      move.mutate({ id: task.id, board: task.board, status: v as TaskStatus, position: 0 })
                    }
                    readOnly={!canWrite}
                    fullWidth
                  />
                </label>
              </div>

              {/* ЧЕТЫРЕ ПРАВИМЫХ ФАКТА СТАЛИ КОНТРОЛАМИ — тем же узором «подпись сверху,
                  контрол снизу», что доска и колонка прямо над ними: рейка говорит на одном
                  языке, а не на двух. Читателю без права записи по-прежнему показываются
                  строки-факты: контрол, который нельзя тронуть, — обещание, которого нет. */}
              {canWrite ? (
                <div className='flex flex-col gap-3 border-t border-hairline pt-3'>
                  <InlineField label='priority'>
                    <SelectComponent
                      name='detail-priority'
                      items={priorityOptions}
                      value={t.priority}
                      onValueChange={(v: string) =>
                        v !== t.priority && patchInline({ priority: v as TaskPriority }, { priority: t.priority })
                      }
                      disabled={inlinePatch.isPending}
                      fullWidth
                    />
                  </InlineField>
                  {/* ИСПОЛНИТЕЛЕЙ НЕСКОЛЬКО (п.2 волны). Не `InlineField`: тот оборачивает
                      контрол в `<label>`, а внутри пикера живут кнопка-триггер и поле поиска —
                      клик по слову «assignees» стал бы вторым нажатием триггера.

                      `seen` приходит ОТ ПИКЕРА, а не берётся из живого `t.assignees`: пока
                      пикер открыт, чужая правка доезжает в кэш незаметно, и сверка с живым
                      сравнивала бы чужую правку саму с собой. */}
                  <div className='flex flex-col gap-1'>
                    <FieldLabel>assignees</FieldLabel>
                    <AssigneesPicker
                      value={t.assignees}
                      disabled={inlinePatch.isPending}
                      onChange={(next, seen) => patchInline({ assignees: next }, { assignees: seen })}
                    />
                  </div>
                  <InlineDate
                    label='planned start'
                    value={t.startDate}
                    disabled={inlinePatch.isPending}
                    onChange={(startDate) => patchInline({ startDate }, { startDate: t.startDate })}
                  />
                  <InlineDate
                    label='due'
                    value={t.dueDate}
                    disabled={inlinePatch.isPending}
                    onChange={(dueDate) => patchInline({ dueDate }, { dueDate: t.dueDate })}
                  />
                </div>
              ) : (
                <div className='flex flex-col border-t border-hairline'>
                  <Row
                    label={<FactLabel>priority</FactLabel>}
                    value={
                      t.priority !== 'TASK_PRIORITY_UNKNOWN' ? (
                        <PriorityTag priority={t.priority} />
                      ) : (
                        <Text size='micro' variant='label' component='span'>
                          none
                        </Text>
                      )
                    }
                  />
                  <Row
                    label={<FactLabel>assignee</FactLabel>}
                    value={
                      <span className='flex items-center justify-end gap-1.5'>
                        <AvatarStack names={t.assignees} />
                        <Text
                          size='micro'
                          component='span'
                          className={cn(!t.assignees.length && 'text-labelColor', isMine && 'font-bold')}
                        >
                          {t.assignees.join(', ') || 'unassigned'}
                        </Text>
                      </span>
                    }
                  />
                  <Row
                    label={<FactLabel>planned start</FactLabel>}
                    value={
                      <Text size='micro' component='span' className={cn(!t.startDate && 'text-labelColor')}>
                        {t.startDate ? format(new Date(t.startDate), 'PP') : '—'}
                      </Text>
                    }
                  />
                  <Row
                    label={<FactLabel>due</FactLabel>}
                    value={
                      <Text size='micro' component='span' className={cn(due.state === 'overdue' && 'text-error')}>
                        {t.dueDate ? format(new Date(t.dueDate), 'PP') : '—'}
                      </Text>
                    }
                  />
                </div>
              )}

              <div className='flex flex-col border-t border-hairline'>
                <Row
                  label={<FactLabel>started</FactLabel>}
                  value={
                    <Text size='micro' variant='label' component='span'>
                      {task.startedAt ? format(new Date(task.startedAt), 'PP') : 'not started'}
                    </Text>
                  }
                />
                <Row
                  label={<FactLabel>created</FactLabel>}
                  value={
                    <Text size='micro' variant='label' component='span'>
                      {task.createdBy ? `${task.createdBy} · ` : ''}
                      {task.createdAt ? format(new Date(task.createdAt), 'PP') : '—'}
                    </Text>
                  }
                />
              </div>

              {t.labels.length > 0 && (
                <div className='flex flex-wrap gap-1'>
                  {t.labels.map((l) => (
                    <Pill key={l} tone='mut'>
                      {l}
                    </Pill>
                  ))}
                </div>
              )}
            </Section>

            <TaskComments taskId={task.id} media={media} onOpenMedia={attachments.openMedia} />
          </SectionStack>
        </aside>
      </div>

      {attachments.node}

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
