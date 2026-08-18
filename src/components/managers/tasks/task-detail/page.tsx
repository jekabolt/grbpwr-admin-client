import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { TaskBoard, TaskFormValues, TaskMediaAnnotations, TaskStatus } from '../api/types';
import { LinkChip } from '../components/link-chip';
import { PriorityTag } from '../components/task-card';
import { TaskChecklist } from '../components/task-checklist';
import { TaskComments } from '../components/task-comments';
import { TaskFormModal } from '../components/task-form-modal';
import { orderedMedia } from '../api/tasksService';
import { useTaskMediaViewer } from '../components/task-media-viewer';
import { TaskText } from '../components/task-text';
import {
  useArchiveTask,
  useDeleteTask,
  useMoveTask,
  useTask,
  useUnarchiveTask,
  useUpdateTask,
} from '../hooks/useTasks';
import { AttachmentTiles } from './attachment-tiles';
import { taskLinks } from '../utils/links';
import { BOARD_LABEL, BOARDS, dueMeta, STATUS_LABEL, STATUSES, toOptions } from '../utils/meta';

/**
 * tskDetail v2 — two columns. The LEFT reads the task (description / checklist /
 * links / media); the RIGHT is the working rail: the facts (placement, priority,
 * assignee, dates) over the activity (tskComments v1). Placement stays inline-editable
 * so a move never needs the full editor. All off-system greys traded for tokens.
 */

const boardOptions = toOptions(BOARDS, BOARD_LABEL);
const statusOptions = toOptions(STATUSES, STATUS_LABEL);

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
  const deleteTask = useDeleteTask();
  const archiveTask = useArchiveTask();
  const unarchiveTask = useUnarchiveTask();
  const move = useMoveTask(useMemo(() => ({ board: task?.board }), [task?.board]));

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  /**
   * НА СТРАНИЦЕ КАРТОЧКИ УКАЗАНИЯ ТОЛЬКО ЧИТАЮТСЯ. Рисуют в модалке правки, где есть явная кнопка
   * сохранения, — то же правило, что у описания, ссылок и состава вложений.
   *
   * Правка отсюда стоила бы записи ВСЕЙ карточки содержимым последнего чтения: `UpdateTask`
   * заменяет заголовок, описание, метки и ссылки целиком, а перечитывать карточку по своей воле
   * страница не станет — `staleTime` у чтения 30 секунд (`hooks/useTasks.ts`), но протухшее
   * чтение перезапрашивается только на новом монтировании, а не по фокусу окна: открытая
   * карточка висит с тем содержимым, с которым её открыли, хоть час. То есть «посмотрел картинку
   * и закрыл» молча откатывало бы чужую правку описания, сделанную после открытия страницы.
   * Инлайновые селекты доски и колонки на этой же
   * странице такого не делают и сравнением не годятся: они идут через `MoveTask`, которая
   * содержимого не касается вовсе.
   *
   * Вместе с этим путём ушли и три его следствия: потеря нарисованного при уходе со страницы
   * «назад», невозможность повторить запись после отказа сервера и затирание набранного в
   * открытой модалке фоновым `reset(initial)` после инвалидации, которую порождал обычный
   * просмотр картинки.
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
  const due = dueMeta(t.dueDate);
  const links = taskLinks(t);
  const isMine = !!account?.username && t.assignee === account.username;
  const isArchived = !!task.archivedAt;
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
            <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
              {BOARD_LABEL[task.board]} · {STATUS_LABEL[task.status]}
            </Text>
            <h1 className='text-lg leading-tight'>{t.title}</h1>
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
          <Section title='description'>
            {t.description ? (
              <TaskText text={t.description} media={media} onOpen={attachments.openMedia} />
            ) : (
              <Text size='micro' variant='label' component='span'>
                No description.
              </Text>
            )}
          </Section>

          <TaskChecklist taskId={task.id} items={task.checklist} canWrite={canWrite} />

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
                      <Avatar name={t.assignee} />
                      <Text size='micro' component='span' className={cn(!t.assignee && 'text-labelColor', isMine && 'font-bold')}>
                        {t.assignee || 'unassigned'}
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
