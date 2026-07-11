import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { emptyFormValues, TaskBoard, TaskFormValues, TaskStatus } from './api/types';
import { Board } from './components/board';
import { BoardSkeleton } from './components/board-skeleton';
import {
  applyFilters,
  emptyFilters,
  filtersActive,
  FiltersBar,
  TaskFilters,
} from './components/filters-bar';
import { TaskFormModal } from './components/task-form-modal';
import { useCreateTask, useTasks } from './hooks/useTasks';
import { BOARD_LABEL, BOARDS } from './utils/meta';

const ACTIVE_BOARD_KEY = 'grbpwr.kanban.activeBoard';
const FILTERS_KEY = 'grbpwr.kanban.filters';
const ARCHIVED_KEY = 'grbpwr.kanban.archived';

export function Tasks() {
  const { account, canRead, canWrite, resolved } = usePermissions();
  const navigate = useNavigate();

  const canView = !resolved || canRead(SECTION.tasks);
  const writable = canWrite(SECTION.tasks);

  const [activeBoard, setActiveBoard] = useState<TaskBoard>(
    () => (localStorage.getItem(ACTIVE_BOARD_KEY) as TaskBoard) || BOARDS[0],
  );
  useEffect(() => localStorage.setItem(ACTIVE_BOARD_KEY, activeBoard), [activeBoard]);

  // Archived view: fetch with include_archived and show only archived cards
  // (read-only — restore happens on the detail page). Persisted across nav.
  const [showArchived, setShowArchived] = useState(
    () => sessionStorage.getItem(ARCHIVED_KEY) === '1',
  );
  useEffect(() => sessionStorage.setItem(ARCHIVED_KEY, showArchived ? '1' : '0'), [showArchived]);

  const filter = useMemo(
    () => ({ board: activeBoard, includeArchived: showArchived }),
    [activeBoard, showArchived],
  );
  const { data, isLoading, isError, error, refetch } = useTasks(filter);
  const tasks = data?.tasks ?? [];

  // Persist filters across navigation (opening a task detail unmounts the board).
  const [filters, setFilters] = useState<TaskFilters>(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      return raw ? { ...emptyFilters, ...(JSON.parse(raw) as Partial<TaskFilters>) } : emptyFilters;
    } catch {
      return emptyFilters;
    }
  });
  useEffect(() => sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)), [filters]);

  const active = filtersActive(filters);
  const visible = useMemo(() => {
    // Keep active and archived boards cleanly separated regardless of what the
    // server returns for the include_archived flag.
    const scoped = tasks.filter((t) => (showArchived ? !!t.archivedAt : !t.archivedAt));
    return applyFilters(scoped, filters, account?.username);
  }, [tasks, filters, account?.username, showArchived]);

  // The create modal; `null` = closed. Column seeds the new card's status.
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const createTask = useCreateTask();

  const initial: TaskFormValues = useMemo(
    () => emptyFormValues(activeBoard, creating ?? 'TASK_STATUS_TODO'),
    [activeBoard, creating],
  );

  async function handleCreate(values: TaskFormValues) {
    const { board, status, ...content } = values;
    try {
      await createTask.mutateAsync({ content, board, status });
      setCreating(null);
    } catch {
      /* snackbar shown by the mutation; keep the modal open */
    }
  }

  if (!canView) {
    return (
      <div className='mx-auto flex max-w-md flex-col items-center gap-2 border border-textInactiveColor p-10 text-center'>
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
            {showArchived
              ? 'Archived cards, read-only. Open one to restore it to the board.'
              : 'Track work across departments. Drag a card between columns to change its status.'}
          </Text>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            type='button'
            onClick={() => setShowArchived((v) => !v)}
            aria-pressed={showArchived}
            className={cn(
              'border px-3 py-2 text-textBaseSize uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              showArchived
                ? 'border-textColor bg-textColor text-bgColor'
                : 'border-textInactiveColor text-textColor hover:bg-textColor hover:text-bgColor',
            )}
          >
            {showArchived ? 'exit archive' : 'archived'}
          </button>
          {writable && !showArchived && (
            <Button variant='main' size='lg' onClick={() => setCreating('TASK_STATUS_TODO')}>
              + new task
            </Button>
          )}
        </div>
      </div>

      {/* Board tabs */}
      <div className='flex gap-2 overflow-x-auto border-b border-textInactiveColor pb-2'>
        {BOARDS.map((board) => (
          <button
            key={board}
            type='button'
            onClick={() => setActiveBoard(board)}
            aria-pressed={board === activeBoard}
            className={cn(
              'shrink-0 border px-3 py-1 text-textBaseSize uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              board === activeBoard
                ? 'border-textColor bg-textColor text-bgColor'
                : 'border-textInactiveColor text-labelColor hover:border-textInactiveColor hover:text-textColor',
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
        <div className='flex flex-col items-start gap-2 border border-textInactiveColor p-4'>
          <Text variant='error' size='small'>
            {error instanceof Error ? error.message : 'Failed to load tasks'}
          </Text>
          <Button variant='secondary' size='lg' onClick={() => refetch()}>
            retry
          </Button>
        </div>
      ) : (
        <>
          {showArchived && !active && visible.length === 0 && (
            <div className='border border-textInactiveColor p-3'>
              <Text variant='label' size='small'>
                No archived tasks on this board.
              </Text>
            </div>
          )}
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
            filtered={active || showArchived}
            canWrite={writable && !showArchived}
            onOpen={(task) => navigate(`${ROUTES.tasks}/${task.id}`)}
            onAdd={(status) => setCreating(status)}
          />
        </>
      )}

      <TaskFormModal
        open={creating !== null}
        onOpenChange={(o) => !o && setCreating(null)}
        mode='create'
        initial={initial}
        saving={createTask.isPending}
        onSubmit={handleCreate}
      />
    </div>
  );
}
