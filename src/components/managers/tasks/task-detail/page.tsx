import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { Task, TaskBoard, TaskFormValues, TaskStatus } from '../api/types';
import { LinkChip } from '../components/link-chip';
import { TaskComments } from '../components/task-comments';
import { TaskFormModal } from '../components/task-form-modal';
import { useDeleteTask, useMoveTask, useTask, useUpdateTask } from '../hooks/useTasks';
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
  const move = useMoveTask(useMemo(() => ({ board: task?.board }), [task?.board]));

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const initial: TaskFormValues | null = task
    ? { ...task.task, board: task.board, status: task.status }
    : null;

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

  return (
    <div className='mx-auto flex w-full max-w-5xl flex-col gap-5 pb-10'>
      {/* Header */}
      <div className='flex flex-col gap-3 border-b border-textColor pb-3'>
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
            <h1 className='text-xl leading-tight'>{t.title}</h1>
          </div>
          {canWrite && (
            <div className='flex shrink-0 gap-2'>
              <Button type='button' variant='secondary' size='lg' onClick={() => setEditing(true)}>
                edit
              </Button>
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

          {task.media.length > 0 && (
            <section className='flex flex-col gap-2'>
              <Text variant='uppercase' size='small' className='text-labelColor'>
                attachments · {task.media.length}
              </Text>
              <div className='flex flex-wrap gap-2'>
                {task.media.map((m) => (
                  <a
                    key={m.id}
                    href={m.fullSize || m.thumbnail}
                    target='_blank'
                    rel='noreferrer'
                    className='block h-20 w-20 border border-textInactiveColor hover:border-textColor'
                  >
                    <img src={m.thumbnail} alt='' className='h-full w-full object-cover' />
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className='border-t border-textInactiveColor pt-4'>
            <TaskComments taskId={task.id} />
          </section>
        </div>

        {/* Aside */}
        <aside className='flex flex-col divide-y divide-textInactiveColor border border-textColor p-4 md:order-2 md:h-fit'>
          <div className='pb-1'>
            <Text variant='label' size='small' component='span'>
              board
            </Text>
            <div className='mt-1'>
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
            </div>
          </div>
          <div className='py-2'>
            <Text variant='label' size='small' component='span'>
              column
            </Text>
            <div className='mt-1'>
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
            </div>
          </div>

          <Row label='priority'>{PRIORITY_LABEL[t.priority]}</Row>
          <Row label='assignee'>
            {t.assignee ? (
              <span className={cn(isMine && 'font-bold')}>{t.assignee}</span>
            ) : (
              <span className='text-labelColor'>unassigned</span>
            )}
          </Row>
          <Row label='due'>
            <span className={cn(due.state === 'overdue' && 'text-error')}>
              {t.dueDate ? format(new Date(t.dueDate), 'PPP') : '—'}
            </span>
          </Row>
          <Row label='created'>
            <span className='text-labelColor'>
              {task.createdBy ? `${task.createdBy} · ` : ''}
              {task.createdAt ? format(new Date(task.createdAt), 'PP') : '—'}
            </span>
          </Row>

          {t.labels.length > 0 && (
            <div className='flex flex-wrap gap-1 py-2'>
              {t.labels.map((l) => (
                <span
                  key={l}
                  className='border border-textInactiveColor px-1.5 py-px text-[10px] uppercase text-labelColor'
                >
                  {l}
                </span>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className='flex flex-col gap-2 pt-3'>
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
