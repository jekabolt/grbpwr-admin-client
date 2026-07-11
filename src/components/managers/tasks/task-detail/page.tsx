import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { MediaGallery } from 'ui/components/media-gallery';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { TaskBoard, TaskFormValues, TaskStatus } from '../api/types';
import { LinkChip } from '../components/link-chip';
import { TaskChecklist } from '../components/task-checklist';
import { TaskComments } from '../components/task-comments';
import { TaskFormModal } from '../components/task-form-modal';
import {
  useArchiveTask,
  useDeleteTask,
  useMoveTask,
  useTask,
  useUnarchiveTask,
  useUpdateTask,
} from '../hooks/useTasks';
import { taskLinks } from '../utils/links';
import {
  BOARD_LABEL,
  BOARDS,
  dueMeta,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUSES,
  toOptions,
} from '../utils/meta';

const boardOptions = toOptions(BOARDS, BOARD_LABEL);
const statusOptions = toOptions(STATUSES, STATUS_LABEL);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex items-start justify-between gap-3 py-2'>
      <Text variant='label' size='small' component='span'>
        {label}
      </Text>
      <span className='text-right text-textBaseSize'>{children}</span>
    </div>
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

  // Memoized so a background refetch of useTask doesn't hand the open edit modal
  // a fresh object and reset the form mid-edit (react-query structural sharing
  // keeps `task` stable while its data is unchanged).
  const initial: TaskFormValues | null = useMemo(
    () => (task ? { ...task.task, board: task.board, status: task.status } : null),
    [task],
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
        <Text variant='label' size='small'>
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
      <div className='flex flex-col gap-3 border-b border-textInactiveColor pb-3'>
        <Link
          to={ROUTES.tasks}
          className='w-fit text-textBaseSize lowercase text-labelColor underline hover:text-textColor'
        >
          ← board
        </Link>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex min-w-0 flex-col gap-1'>
            <Text variant='uppercase' size='small' className='text-labelColor'>
              {BOARD_LABEL[task.board]} · {STATUS_LABEL[task.status]}
            </Text>
            <h1 className='text-lg leading-tight'>{t.title}</h1>
          </div>
          {canWrite && (
            <div className='flex shrink-0 flex-wrap justify-end gap-2'>
              <Button type='button' variant='secondary' size='lg' onClick={() => setEditing(true)}>
                edit
              </Button>
              {isArchived ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  loading={archiveBusy}
                  onClick={() => unarchiveTask.mutate(task.id)}
                >
                  restore
                </Button>
              ) : (
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  loading={archiveBusy}
                  onClick={() => archiveTask.mutate(task.id)}
                >
                  archive
                </Button>
              )}
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='text-error'
                onClick={() => setDeleting(true)}
              >
                delete
              </Button>
            </div>
          )}
        </div>

        {isArchived && (
          <div className='flex flex-wrap items-center justify-between gap-2 border border-textInactiveColor px-3 py-2'>
            <Text size='small' className='uppercase'>
              archived{task.archivedAt ? ` · ${format(new Date(task.archivedAt), 'PP')}` : ''}
            </Text>
            <Text variant='label' size='small'>
              Hidden from the board. Restore to make it active again.
            </Text>
          </div>
        )}
      </div>

      {/* Body */}
      <div className='grid grid-cols-1 gap-6 md:grid-cols-[1fr_18rem]'>
        {/* Main */}
        <div className='flex min-w-0 flex-col gap-6 md:order-1'>
          <section className='flex flex-col gap-2'>
            <Text variant='uppercase' size='small' className='text-labelColor'>
              description
            </Text>
            {t.description ? (
              <Text size='small' className='whitespace-pre-wrap break-words'>
                {t.description}
              </Text>
            ) : (
              <Text variant='label' size='small'>
                No description.
              </Text>
            )}
          </section>

          <TaskChecklist taskId={task.id} items={task.checklist} canWrite={canWrite} />

          {task.media.length > 0 && (
            <section className='flex flex-col gap-2'>
              <Text variant='uppercase' size='small' className='text-labelColor'>
                attachments · {task.media.length}
              </Text>
              <MediaGallery
                items={task.media.map((m) => ({
                  src: m.fullSize || m.thumbnail || '',
                  thumbnail: m.thumbnail,
                }))}
              />
            </section>
          )}
        </div>

        {/* Aside */}
        <aside className='flex flex-col gap-4 border border-textInactiveColor p-4 md:order-2 md:h-fit'>
          {/* Placement — inline move without opening the editor */}
          <div className='flex flex-col gap-3'>
            <label className='flex flex-col gap-1'>
              <Text variant='label' size='small' component='span'>
                board
              </Text>
              <SelectComponent
                name='detail-board'
                items={boardOptions}
                value={task.board}
                onValueChange={(v: string) =>
                  canWrite &&
                  v !== task.board &&
                  move.mutate({
                    id: task.id,
                    board: v as TaskBoard,
                    status: task.status,
                    position: 0,
                  })
                }
                readOnly={!canWrite}
                fullWidth
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text variant='label' size='small' component='span'>
                column
              </Text>
              <SelectComponent
                name='detail-status'
                items={statusOptions}
                value={task.status}
                onValueChange={(v: string) =>
                  canWrite &&
                  v !== task.status &&
                  move.mutate({
                    id: task.id,
                    board: task.board,
                    status: v as TaskStatus,
                    position: 0,
                  })
                }
                readOnly={!canWrite}
                fullWidth
              />
            </label>
          </div>

          <div className='flex flex-col divide-y divide-textInactiveColor border-t border-textInactiveColor'>
            <Row label='priority'>{PRIORITY_LABEL[t.priority]}</Row>
            <Row label='assignee'>
              {t.assignee ? (
                <span className={cn(isMine && 'font-bold')}>{t.assignee}</span>
              ) : (
                <span className='text-labelColor'>unassigned</span>
              )}
            </Row>
            <Row label='planned start'>
              <span className={cn(!t.startDate && 'text-labelColor')}>
                {t.startDate ? format(new Date(t.startDate), 'PPP') : '—'}
              </span>
            </Row>
            <Row label='due'>
              <span className={cn(due.state === 'overdue' && 'text-error')}>
                {t.dueDate ? format(new Date(t.dueDate), 'PPP') : '—'}
              </span>
            </Row>
            <Row label='started'>
              <span className='text-labelColor'>
                {task.startedAt ? format(new Date(task.startedAt), 'PP') : 'not started'}
              </span>
            </Row>
            <Row label='created'>
              <span className='text-labelColor'>
                {task.createdBy ? `${task.createdBy} · ` : ''}
                {task.createdAt ? format(new Date(task.createdAt), 'PP') : '—'}
              </span>
            </Row>
          </div>

          {t.labels.length > 0 && (
            <div className='flex flex-wrap gap-1'>
              {t.labels.map((l) => (
                <span
                  key={l}
                  className='border border-textInactiveColor px-1.5 py-px text-textBaseSize uppercase text-labelColor'
                >
                  {l}
                </span>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
              <Text variant='uppercase' size='small' className='text-labelColor'>
                links
              </Text>
              <div className='flex flex-wrap gap-2'>
                {links.map((l) => (
                  <LinkChip key={`${l.kind}-${l.to}`} link={l} />
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Comments — full width, below the fold on mobile */}
      <section className='max-w-3xl border-t border-textInactiveColor pt-4'>
        <TaskComments taskId={task.id} />
      </section>

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
      >
        <Text size='small'>Delete “{t.title}”? This can’t be undone.</Text>
      </ConfirmationModal>
    </div>
  );
}
