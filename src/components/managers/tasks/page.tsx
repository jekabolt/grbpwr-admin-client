import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useEffect, useMemo, useState } from 'react';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { emptyTaskInsert, Task, TaskBoard, TaskInsert, TaskStatus } from './api/types';
import { setLocalActor } from './api/tasksService';
import { Board } from './components/board';
import { BoardSkeleton } from './components/board-skeleton';
import {
  applyFilters,
  emptyFilters,
  filtersActive,
  FiltersBar,
  TaskFilters,
} from './components/filters-bar';
import { TaskDetailDrawer } from './components/task-detail-drawer';
import { TaskFormModal } from './components/task-form-modal';
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from './hooks/useTasks';
import { BOARD_LABEL, BOARDS } from './utils/meta';

const ACTIVE_BOARD_KEY = 'grbpwr.kanban.activeBoard';

type ModalState = { mode: 'create'; status: TaskStatus } | { mode: 'edit'; task: Task } | null;

export function Tasks() {
  const { account, canRead, canWrite, resolved } = usePermissions();
  useEffect(() => setLocalActor(account?.username), [account?.username]);

  const canView = !resolved || canRead(SECTION.tasks);
  const writable = canWrite(SECTION.tasks);

  const [activeBoard, setActiveBoard] = useState<TaskBoard>(
    () => (localStorage.getItem(ACTIVE_BOARD_KEY) as TaskBoard) || BOARDS[0],
  );
  useEffect(() => localStorage.setItem(ACTIVE_BOARD_KEY, activeBoard), [activeBoard]);

  const filter = useMemo(() => ({ board: activeBoard }), [activeBoard]);
  const { data, isLoading, isError, error, refetch } = useTasks(filter);
  const tasks = data?.tasks ?? [];

  const [filters, setFilters] = useState<TaskFilters>(emptyFilters);
  const active = filtersActive(filters);
  const visible = useMemo(
    () => applyFilters(tasks, filters, account?.username),
    [tasks, filters, account?.username],
  );

  const [modal, setModal] = useState<ModalState>(null);
  const [selected, setSelected] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const initial: TaskInsert = useMemo(() => {
    if (modal?.mode === 'edit') return modal.task.task;
    if (modal?.mode === 'create') return emptyTaskInsert(activeBoard, modal.status);
    return emptyTaskInsert(activeBoard, 'TASK_STATUS_TODO');
  }, [modal, activeBoard]);

  async function handleSubmit(values: TaskInsert) {
    try {
      if (modal?.mode === 'edit') {
        await updateTask.mutateAsync({ id: modal.task.id, input: values });
      } else {
        await createTask.mutateAsync(values);
      }
      setModal(null);
    } catch {
      /* snackbar shown by the mutation; keep the modal open */
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteTask.mutate(deleting.id);
    if (selected?.id === deleting.id) setSelected(null);
    setDeleting(null);
  }

  if (!canView) {
    return (
      <div className='mx-auto flex max-w-md flex-col items-center gap-2 border border-textColor p-10 text-center'>
        <Text variant='uppercase' size='large'>
          tasks
        </Text>
        <Text variant='label' size='small'>
          You don’t have access to this section. Ask a super admin to grant it.
        </Text>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col gap-4 pb-10'>
      {/* Header */}
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='flex flex-col gap-1'>
          <Text variant='uppercase' size='large'>
            tasks
          </Text>
          <Text variant='label' size='small'>
            Track work across departments. Drag a card between columns to change its status.
          </Text>
        </div>
        {writable && (
          <Button
            variant='main'
            size='lg'
            onClick={() => setModal({ mode: 'create', status: 'TASK_STATUS_TODO' })}
          >
            + new task
          </Button>
        )}
      </div>

      {/* Board tabs */}
      <div className='flex gap-2 overflow-x-auto border-b border-textColor pb-2'>
        {BOARDS.map((board) => (
          <button
            key={board}
            type='button'
            onClick={() => setActiveBoard(board)}
            className={cn(
              'shrink-0 border px-3 py-1 text-textBaseSize uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              board === activeBoard
                ? 'border-textColor bg-textColor text-bgColor'
                : 'border-textInactiveColor text-labelColor hover:border-textColor hover:text-textColor',
            )}
          >
            {BOARD_LABEL[board]}
          </button>
        ))}
      </div>

      {/* Filters */}
      <FiltersBar filters={filters} onChange={setFilters} showMine={!!account?.username} />

      {/* Content */}
      {isLoading ? (
        <BoardSkeleton />
      ) : isError ? (
        <div className='flex flex-col items-start gap-2 border border-textColor p-4'>
          <Text variant='error' size='small'>
            {error instanceof Error ? error.message : 'Failed to load tasks'}
          </Text>
          <Button variant='secondary' size='lg' onClick={() => refetch()}>
            retry
          </Button>
        </div>
      ) : (
        <>
          {active && visible.length === 0 && (
            <div className='flex flex-wrap items-center gap-3 border border-textInactiveColor p-3'>
              <Text variant='label' size='small'>
                No tasks match your filters.
              </Text>
              <button
                type='button'
                onClick={() => setFilters(emptyFilters)}
                className='text-textBaseSize uppercase underline hover:text-textColor'
              >
                clear filters
              </button>
            </div>
          )}
          <Board
            tasks={visible}
            filter={filter}
            filtered={active}
            canWrite={writable}
            onOpen={(task) => setSelected(task)}
            onAdd={(status) => setModal({ mode: 'create', status })}
          />
        </>
      )}

      <TaskDetailDrawer
        task={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
        canWrite={writable}
        onEdit={(task) => {
          setSelected(null);
          setModal({ mode: 'edit', task });
        }}
        onDelete={(task) => setDeleting(task)}
      />

      <TaskFormModal
        open={modal !== null}
        onOpenChange={(o) => !o && setModal(null)}
        mode={modal?.mode ?? 'create'}
        initial={initial}
        saving={createTask.isPending || updateTask.isPending}
        onSubmit={handleSubmit}
      />

      <ConfirmationModal
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={confirmDelete}
        title='delete task'
        confirmLabel='delete'
      >
        <Text size='small'>
          Delete “{deleting?.task.title}”? This can’t be undone.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
