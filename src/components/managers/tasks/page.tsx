import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { SectionHeader } from 'ui/components/section-header';
import {
  SideRail,
  SideRailGroup,
  SideRailItem,
  SideRailLayout,
} from 'ui/components/side-rail';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';
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

  // tskTabs v2 — the board is chosen from a left rail, persisted as before.
  const [activeBoard, setActiveBoard] = useState<TaskBoard>(
    () => (localStorage.getItem(ACTIVE_BOARD_KEY) as TaskBoard) || BOARDS[0],
  );
  useEffect(() => localStorage.setItem(ACTIVE_BOARD_KEY, activeBoard), [activeBoard]);

  // tskArchive v3 — archived is a filter, not a mode. On = include_archived so the
  // board shows active + archived (the cards dim themselves); off = active only.
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

  // Per-board open-task counts for the rail — one all-boards, active-only read.
  const countsFilter = useMemo(() => ({}), []);
  const { data: countsData } = useTasks(countsFilter);
  const counts = useMemo(() => {
    const m = new Map<TaskBoard, number>();
    for (const b of BOARDS) m.set(b, 0);
    for (const t of countsData?.tasks ?? []) {
      if (t.archivedAt) continue;
      m.set(t.board, (m.get(t.board) ?? 0) + 1);
    }
    return m;
  }, [countsData]);

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
  // The include_archived flag already scopes the read; the chip cards dim themselves.
  const visible = useMemo(
    () => applyFilters(tasks, filters, account?.username),
    [tasks, filters, account?.username],
  );

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

  function clearFilters() {
    setFilters(emptyFilters);
    setShowArchived(false);
  }

  if (!canView) {
    return (
      <div className='mx-auto flex max-w-md flex-col items-center gap-2 border border-borderColor bg-bgColor p-10 text-center'>
        <Text variant='uppercase' size='large'>
          tasks
        </Text>
        <Text size='micro' variant='label'>
          You don’t have access to this section. Ask a super admin to grant it.
        </Text>
      </div>
    );
  }

  return (
    <div className='flex w-full flex-col gap-4 pb-10'>
      <SectionHeader
        title='tasks'
        question='what is each department working on — and what needs a hand?'
        action={
          writable && (
            <Button variant='main' size='sm' onClick={() => setCreating('TASK_STATUS_TODO')}>
              + new task
            </Button>
          )
        }
      />

      <SideRailLayout
        rail={
          <SideRail>
            <SideRailGroup flush>boards</SideRailGroup>
            {BOARDS.map((board) => (
              <SideRailItem
                key={board}
                label={BOARD_LABEL[board]}
                count={counts.get(board) ?? 0}
                selected={board === activeBoard}
                onClick={() => setActiveBoard(board)}
              />
            ))}
          </SideRail>
        }
      >
        <div className='flex min-w-0 flex-col gap-3'>
          <Toolbar>
            <FiltersBar
              filters={filters}
              onChange={setFilters}
              showMine={!!account?.username}
              showArchived={showArchived}
              onToggleArchived={() => setShowArchived((v) => !v)}
              onClear={clearFilters}
            />
          </Toolbar>

          {isLoading ? (
            <BoardSkeleton />
          ) : isError ? (
            <div className='flex items-center gap-3'>
              <Text size='micro' variant='error' tracking='label' component='span'>
                {error instanceof Error ? error.message : 'failed to load tasks'}
              </Text>
              <Button variant='underline' size='xs' onClick={() => refetch()}>
                retry
              </Button>
            </div>
          ) : (
            <>
              {active && visible.length === 0 && (
                <CalloutBox className='flex flex-wrap items-baseline gap-1.5'>
                  <Text size='micro' component='span' className='font-bold uppercase tracking-label'>
                    no tasks match
                  </Text>
                  <Button variant='underline' size='xs' onClick={clearFilters} className='ml-auto'>
                    clear filters
                  </Button>
                </CalloutBox>
              )}
              <Board
                tasks={visible}
                filter={filter}
                filtered={active}
                canWrite={writable}
                onOpen={(task) => navigate(`${ROUTES.tasks}/${task.id}`)}
                onAdd={(status) => setCreating(status)}
              />
            </>
          )}
        </div>
      </SideRailLayout>

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
