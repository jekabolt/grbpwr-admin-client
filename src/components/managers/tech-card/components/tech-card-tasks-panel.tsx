import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  emptyFormValues,
  Task,
  TaskFormValues,
  TaskStatus,
} from 'components/managers/tasks/api/types';
import { TaskFormModal } from 'components/managers/tasks/components/task-form-modal';
import { useCreateTask, useTasks } from 'components/managers/tasks/hooks/useTasks';
import { dueMeta, PRIORITY_LABEL, STATUS_LABEL } from 'components/managers/tasks/utils/meta';
import { ROUTES, SECTION } from 'constants/routes';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

// TASKS hub panel (#75) — this tech card as a working hub: the work items linked to it, at a
// glance, without leaving the card. Mounted in the tech-card FORM (near the lifecycle strip) so
// it's visible regardless of which tab is open, unlike the minimal read-only `RelatedTasks`
// summary tasks/related-tasks.tsx already renders at the very bottom of tech-card/page.tsx (a
// dense text list, no create affordance, no per-row deep link — kept as-is; out of this
// component's edit scope). This panel reuses the tasks domain's own hooks/modal/utils end to end
// (useTasks/useCreateTask, TaskFormModal, the meta label/due helpers) rather than re-deriving
// task business logic, and adds the one thing neither existing surface has: a scannable card grid
// with a status chip per card (owner preference — cards over dense lists) plus a "+ new task"
// affordance that pre-links techCardId. Each card deep-links to /tasks/:id; the reverse link back
// to this tech card already exists for free on that page (TaskDetail renders `taskLinks(t)` via
// LinkChip, which resolves techCardId into a "техкарта: <name>" chip — no tasks/ edits needed).
const STATUS_STYLE: Record<TaskStatus, string> = {
  TASK_STATUS_UNKNOWN: 'border-textInactiveColor text-labelColor',
  TASK_STATUS_BACKLOG: 'border-textInactiveColor text-labelColor',
  TASK_STATUS_TODO: 'border-textColor text-textColor',
  TASK_STATUS_IN_PROGRESS: 'border-textColor bg-textColor text-bgColor',
  TASK_STATUS_REVIEW: 'border-textColor text-textColor',
  TASK_STATUS_DONE: 'border-success text-success',
};

function TaskTile({ task }: { task: Task }) {
  const t = task.task;
  const due = dueMeta(t.dueDate);
  const checkTotal = task.checklist.length;
  const checkDone = task.checklist.filter((c) => c.isDone).length;

  return (
    <Link
      to={`${ROUTES.tasks}/${task.id}`}
      className='flex flex-col gap-1.5 border border-textInactiveColor bg-bgColor p-2.5 outline-none transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor motion-reduce:hover:translate-y-0'
    >
      <div className='flex items-center justify-between gap-2'>
        <span
          className={cn(
            'border px-1.5 py-px text-[10px] uppercase leading-4',
            STATUS_STYLE[task.status],
          )}
        >
          {STATUS_LABEL[task.status]}
        </span>
        {t.priority !== 'TASK_PRIORITY_UNKNOWN' && (
          <span className='shrink-0 text-[10px] uppercase text-labelColor'>
            {PRIORITY_LABEL[t.priority]}
          </span>
        )}
      </div>

      <Text size='small' className='leading-snug'>
        {t.title || 'untitled task'}
      </Text>

      <div className='flex items-center justify-between gap-2 text-[10px] uppercase text-labelColor'>
        <span className='truncate'>{t.assignee || 'unassigned'}</span>
        {due.state !== 'none' && (
          <span
            className={cn(
              'shrink-0',
              due.state === 'overdue'
                ? 'text-error'
                : due.state === 'today' || due.state === 'soon'
                  ? 'text-textColor'
                  : 'text-labelColor',
            )}
          >
            {due.label}
          </span>
        )}
      </div>

      {checkTotal > 0 && (
        <span className='text-[10px] uppercase text-labelColor'>
          ✓ {checkDone}/{checkTotal}
        </span>
      )}
    </Link>
  );
}

// Non-done tasks with the soonest due date lead; done tasks sink to the bottom — so the panel
// reads as "what needs attention on this style" rather than creation order.
function sortForHub(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'TASK_STATUS_DONE' ? 1 : 0;
    const bDone = b.status === 'TASK_STATUS_DONE' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aDue = a.task.dueDate ?? '';
    const bDue = b.task.dueDate ?? '';
    if (aDue && bDue) return aDue.localeCompare(bDue);
    if (aDue) return -1;
    if (bDue) return 1;
    return b.id - a.id;
  });
}

export function TechCardTasksPanel({ techCardId }: { techCardId: number }) {
  const { canRead, canWrite, resolved } = usePermissions();
  const canView = !resolved || canRead(SECTION.tasks);
  const writable = canWrite(SECTION.tasks);

  const filter = useMemo(() => ({ techCardId }), [techCardId]);
  const { data, isLoading, isError, refetch } = useTasks(filter);
  const tasks = useMemo(() => sortForHub(data?.tasks ?? []), [data]);

  const [creating, setCreating] = useState(false);
  const createTask = useCreateTask();
  // Pre-linked create: techCardId is baked into the initial values, so a task opened from this
  // panel is scoped to this style from the start (the modal's own "links" section still lets the
  // user add further links or change it, same as any other task).
  const initial: TaskFormValues = useMemo(
    () => ({
      ...emptyFormValues('TASK_BOARD_DEVELOPMENT', 'TASK_STATUS_TODO'),
      techCardId,
    }),
    [techCardId],
  );

  async function handleCreate(values: TaskFormValues) {
    const { board, status, ...content } = values;
    try {
      await createTask.mutateAsync({ content, board, status });
      setCreating(false);
    } catch {
      /* snackbar shown by the mutation; keep the modal open */
    }
  }

  if (!canView) return null;

  return (
    <div className='-mx-2.5 flex flex-col gap-2 border-b border-textInactiveColor px-2.5 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='small'>
            tasks
          </Text>
          {tasks.length > 0 && (
            <Text variant='inactive' size='small'>
              {tasks.length}
            </Text>
          )}
        </div>
        {writable && (
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            onClick={() => setCreating(true)}
          >
            + new task
          </Button>
        )}
      </div>

      {isLoading ? (
        <Text variant='inactive' size='small'>
          loading tasks…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load tasks
          </Text>
          <button
            type='button'
            onClick={() => refetch()}
            className='text-textBaseSize uppercase underline hover:text-textColor'
          >
            retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <Text variant='inactive' size='small'>
          no tasks linked to this tech card yet — use “+ new task” to start tracking work here.
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {tasks.map((task) => (
            <TaskTile key={task.id} task={task} />
          ))}
        </div>
      )}

      <TaskFormModal
        open={creating}
        onOpenChange={setCreating}
        mode='create'
        initial={initial}
        saving={createTask.isPending}
        onSubmit={handleCreate}
      />
    </div>
  );
}
