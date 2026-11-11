import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ARCHIVED_WORD } from 'components/managers/files/components/topic-chips';
import { useFileTopics } from 'components/managers/files/hooks/useFiles';
import { ROUTES, SECTION } from 'constants/routes';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AddInline, Button, LiquidTabs, SkeletonBlocks, SkeletonLine, Text } from 'ui';
import { emptyFormValues, Task, TaskBoardEntry, TaskStatus } from './api/types';
import { Board } from './components/board';
import { BoardSkeleton } from './components/board-skeleton';
import {
  BoardSort,
  boardSortRoom,
  type DeadlineFilter,
  matchesDeadline,
  type SortKey,
} from './components/board-sort';
import { ClosedSummary } from './components/closed-summary';
import { DeleteBoardModal } from './components/delete-board-modal';
import {
  applyFilters,
  assigneePiles,
  emptyFilters,
  filtersActive,
  setFilter,
  TaskFilters,
} from './components/filters-bar';
import { LiveTile, type TileMode } from './components/live-tile';
import { TaskHead } from './components/task-head';
import { TaskSearchResults, TaskSearchScope } from './components/task-search';
import { moveTaskPins } from './hooks/useTaskPins';
import { useSearchQuery } from './hooks/useSearchQuery';
import {
  useAddTaskBoard,
  useDeleteTaskBoard,
  useRenameTaskBoard,
  useReorderTaskBoards,
  useTask,
  useTaskBoards,
  useTaskSearch,
  useInlineTaskPatch,
  useTasks,
} from './hooks/useTasks';
import { TaskActionBar, TaskDim, TaskForm } from './panel/task-form';
import { type TaskPanelValues, TaskSessionProvider } from './panel/task-session';
import { SheetEmbedsProvider } from './task-detail/file-view/sheet-embeds';
import { searchTasks } from './utils/search';
import './tasks-screen.css';

const SORT_KEY = 'grbpwr.kanban.sort';
const FILTERS_KEY = 'grbpwr.kanban.filters';
const ARCHIVED_KEY = 'grbpwr.kanban.archived';
const CLOSED_VIEW_KEY = 'grbpwr.kanban.closedView';
const NEW = 'new';

/** The side gutter of the board (frame: 187px of 1440). */
const GUTTER = 'px-4 md:px-[clamp(1.5rem,13vw,11.6875rem)]';
/** The left area while the board stands alone: it takes the screen and never scrolls. */
const BOARD_AREA = `flex min-h-0 min-w-0 flex-1 flex-col pt-6 pb-4 ${GUTTER}`;
/** The left area while a task is open: its title and its live tile. */
const LEFT = 'flex min-w-0 flex-1 flex-col pt-6 pr-8 pb-16 pl-4 md:pl-[clamp(1.5rem,5vw,4.5rem)]';
/** The panel: the Models panel's place — sticky on the right above the action bar. */
const PANEL =
  'w-[min(32.9375rem,46vw)] shrink-0 self-start bg-bgColor px-block pb-16 motion-safe:animate-[tasks-open-r_1100ms_var(--ease-soft)_90ms_both] min-[56.25rem]:sticky min-[56.25rem]:top-26 min-[56.25rem]:max-h-[calc(100dvh-10rem)] min-[56.25rem]:origin-right min-[56.25rem]:overflow-y-auto max-[56.25rem]:w-full max-[56.25rem]:[--panel-sticky-offset:3.5rem] [overflow-anchor:none]';

type Scope = 'all' | 'mine' | 'archived';
const MODES: { value: TileMode; label: string }[] = [
  { value: 'card', label: 'Opened Card' },
  { value: 'tile', label: 'Tile Preview' },
];

/** A modal or a popover is open: the page's own keys stand down. */
function overlayOpen() {
  return !!document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]');
}

function readNumber(key: string): number {
  try {
    const v = Number(localStorage.getItem(key) ?? 0);
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

type Active = number | typeof NEW | null;

/** The open task: loaded from GetTask (files, history and checklist live only there). */
function StoredSession({
  id,
  children,
  fallback,
}: {
  id: number;
  children: (task: Task) => ReactNode;
  fallback: (state: 'loading' | 'missing') => ReactNode;
}) {
  const { data: task, isLoading, isError } = useTask(id);
  if (isLoading) return <>{fallback('loading')}</>;
  if (isError || !task) return <>{fallback('missing')}</>;
  return <>{children(task)}</>;
}

/** Tables typed into a stored task's description attach their file to it at once. */
function StoredEmbeds({ task, children }: { task: Task; children: ReactNode }) {
  const inline = useInlineTaskPatch(task.id);
  const ref = useRef(task);
  ref.current = task;
  const attachFile = useCallback(
    async (fileId: number) => {
      const current = ref.current;
      if (current.task.fileIds.includes(fileId)) return true;
      const seen = current.task.fileIds;
      try {
        await inline.mutateAsync({
          patch: { fileIds: [...seen, fileId] },
          base: { ...current.task, fileIds: seen },
        });
        return true;
      } catch {
        return false;
      }
    },
    [inline],
  );
  return (
    <SheetEmbedsProvider taskId={task.id} files={task.files} attachFile={attachFile}>
      {children}
    </SheetEmbedsProvider>
  );
}

/**
 * `/tasks` — the taskboard; `/tasks/:id` — that task open in the fill panel on the right;
 * `/tasks/new` — a new task in the panel. The route is the open task, so deep links, refresh and
 * back keep working (the Models screen's model).
 *
 * LEAVING A DIRTY TASK IS HELD, NOT ASKED IN A MODAL. Back arrow, Esc, another task: the
 * navigation waits in `pending` and the action bar asks «You have unsaved changes, what to do?» —
 * Save saves and goes on, Cancel discards and goes on.
 */
export function Tasks() {
  const { id } = useParams<{ id: string }>();
  const { search: locationSearch } = useLocation();
  const navigate = useNavigate();
  const { account, canRead, canWrite, resolved } = usePermissions();
  const canView = !resolved || canRead(SECTION.tasks);
  const writable = canWrite(SECTION.tasks);

  const parsed = id && id !== NEW ? parseInt(id, 10) : NaN;
  const active: Active = id === NEW ? NEW : Number.isFinite(parsed) ? parsed : null;
  const activeKey = String(active);

  // ── project narrowing lives in the address (`?project=N`, links from the project page) ──
  const [params, setParams] = useSearchParams();
  const rawProject = Math.trunc(Number(params.get('project') ?? 0));
  const projectId = Number.isFinite(rawProject) && rawProject > 0 ? rawProject : 0;
  const dropProject = () => {
    const next = new URLSearchParams(params);
    next.delete('project');
    setParams(next, { replace: true });
  };
  const projectTopics = useFileTopics(true, canView && projectId > 0).data?.topics ?? [];
  const projectTopic = projectTopics.find((t) => Number(t.id) === projectId);
  const projectLabel = projectId
    ? projectTopic?.name
      ? projectTopic.archived
        ? `${projectTopic.name} · ${ARCHIVED_WORD}`
        : projectTopic.name
      : `#${projectId}`
    : '';

  // ── boards = the Sort categories ──
  const boardsQuery = useTaskBoards(canView);
  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const [sortBoard, setSortBoardRaw] = useState(() => readNumber(SORT_KEY));
  const chosenBoard = boards.some((b) => b.id === sortBoard) ? sortBoard : 0;
  const [closedView, setClosedView] = useState(() => {
    try {
      return localStorage.getItem(CLOSED_VIEW_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CLOSED_VIEW_KEY, closedView ? '1' : '0');
      localStorage.setItem(SORT_KEY, String(sortBoard));
    } catch {
      /* storage blocked: the view just is not remembered */
    }
  }, [closedView, sortBoard]);
  const chooseBoard = (boardId: number) => {
    setClosedView(false);
    setSortBoardRaw(boardId);
  };

  const addBoard = useAddTaskBoard();
  const deleteBoard = useDeleteTaskBoard();
  const renameBoard = useRenameTaskBoard();
  const reorderBoards = useReorderTaskBoards();
  const [renaming, setRenaming] = useState<number | null>(null);
  async function submitRename(boardId: number, name: string) {
    try {
      await renameBoard.mutateAsync({ id: boardId, name });
      setRenaming(null);
    } catch {
      /* snackbar shown by the mutation; keep the field open */
    }
  }
  const [deletingBoard, setDeletingBoard] = useState<TaskBoardEntry | null>(null);
  /** Rejects when the board was not created, so the field that typed it stays open. */
  async function submitNewBoard(name: string) {
    const created = await addBoard.mutateAsync(name);
    if (created.id) chooseBoard(created.id);
  }
  async function confirmDeleteBoard(moveToId: number) {
    if (!deletingBoard) return;
    try {
      await deleteBoard.mutateAsync({ id: deletingBoard.id, moveToId });
      if (chosenBoard === deletingBoard.id) chooseBoard(0);
      setDeletingBoard(null);
      setRenaming(null);
    } catch {
      /* snackbar shown by the mutation; keep the dialog open */
    }
  }

  // ── filters ──
  const [showArchived, setShowArchived] = useState(
    () => sessionStorage.getItem(ARCHIVED_KEY) === '1',
  );
  useEffect(() => sessionStorage.setItem(ARCHIVED_KEY, showArchived ? '1' : '0'), [showArchived]);
  const [filters, setFilters] = useState<TaskFilters>(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      return raw ? setFilter(emptyFilters, JSON.parse(raw) as Partial<TaskFilters>) : emptyFilters;
    } catch {
      return emptyFilters;
    }
  });
  useEffect(() => sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)), [filters]);
  const [deadline, setDeadline] = useState<DeadlineFilter>('');
  const [sortOpen, setSortOpen] = useState<SortKey | null>(null);

  const filter = useMemo(
    () => ({ boardId: chosenBoard, includeArchived: showArchived, projectTopicId: projectId }),
    [chosenBoard, showArchived, projectId],
  );
  const tasksQuery = useTasks(filter, canView && !boardsQuery.isLoading);
  const tasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  const isError = tasksQuery.isError || boardsQuery.isError;
  const error = tasksQuery.error ?? boardsQuery.error;
  const isLoading = tasksQuery.isLoading || boardsQuery.isLoading;
  const boardTruncated = (tasksQuery.data?.total ?? 0) > tasks.length;

  // The Archived tab shows what is archived, and only that.
  const scoped = useMemo(
    () => (showArchived ? tasks.filter((t) => !!t.archivedAt) : tasks),
    [tasks, showArchived],
  );
  const visible = useMemo(
    () =>
      applyFilters(scoped, filters, account?.username).filter((t) => matchesDeadline(t, deadline)),
    [scoped, filters, account?.username, deadline],
  );
  const scope: Scope = showArchived ? 'archived' : filters.mine ? 'mine' : 'all';
  const setScope = (next: Scope) => {
    setShowArchived(next === 'archived');
    setFilters((f) => (f.mine === (next === 'mine') ? f : setFilter(f, { mine: next === 'mine' })));
  };
  const people = useMemo(() => assigneePiles(tasks, filters.assignee), [tasks, filters.assignee]);
  const narrowed = filtersActive(filters) || deadline !== '';

  // ── search: `?q=` in the address; a query swaps the board for the results ──
  const search = useSearchQuery();
  const [searchOpen, setSearchOpen] = useState(() => search.query.length > 0);
  const searching = search.query.length > 0 && !closedView;
  const [allBoards, setAllBoards] = useState(true);
  const found = useTaskSearch(search.query);
  const hits = useMemo(() => {
    const all = searchTasks(found.data?.tasks ?? [], search.query, found.data?.matches);
    return allBoards || !chosenBoard ? all : all.filter((h) => h.task.boardId === chosenBoard);
  }, [found.data, search.query, allBoards, chosenBoard]);

  // ── the open task, the held leave ──
  const [selected, setSelected] = useState<number | null>(
    typeof active === 'number' ? active : null,
  );
  const [createSeed, setCreateSeed] = useState<{ status: TaskStatus; boardId: number } | null>(
    null,
  );
  const [mode, setMode] = useState<TileMode>('tile');
  const captureTile = useRef<(() => void) | null>(null);
  const dirty = useRef(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (typeof active === 'number') setSelected(active);
    setPending(null);
  }, [active]);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);
  const guard = useCallback((go: () => void) => {
    if (dirty.current) setPending(() => go);
    else go();
  }, []);
  const goTo = useCallback(
    (target: Active) => {
      dirty.current = false;
      setPending(null);
      const pathname =
        target === null ? ROUTES.tasks : `${ROUTES.tasks}/${target === NEW ? NEW : target}`;
      navigate({ pathname, search: locationSearch }, { replace: true });
    },
    [navigate, locationSearch],
  );
  const open = useCallback(
    (target: number | typeof NEW) => {
      if (target === active && target !== NEW) return;
      guard(() => goTo(target));
    },
    [active, guard, goTo],
  );
  const openTask = useCallback(
    (task: Task, as: TileMode = 'tile') => {
      setMode(as);
      open(task.id);
    },
    [open],
  );
  const startCreate = useCallback(
    (status: TaskStatus = 'TASK_STATUS_TODO') =>
      guard(() => {
        setCreateSeed({ status, boardId: chosenBoard || boards[0]?.id || 0 });
        setMode('tile');
        goTo(NEW);
      }),
    [guard, goTo, chosenBoard, boards],
  );
  const back = useCallback(() => guard(() => goTo(null)), [guard, goTo]);

  const onCreated = useCallback(
    (newId: number) => {
      moveTaskPins('new', newId);
      setSelected(newId);
      if (!pending) goTo(newId);
    },
    [goTo, pending],
  );
  const onDeleted = useCallback(() => {
    setSelected(null);
    goTo(null);
  }, [goTo]);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select')))
        return;
      if (overlayOpen()) return;
      back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, back]);

  const newSeed: TaskPanelValues | undefined = useMemo(() => {
    if (active !== NEW) return undefined;
    const boardId = createSeed?.boardId || chosenBoard || boards[0]?.id || 0;
    return {
      ...emptyFormValues(boardId, createSeed?.status ?? 'TASK_STATUS_TODO'),
      projectTopicId: projectId,
      draftSteps: [],
      parentTaskId: 0,
    };
  }, [active, createSeed, chosenBoard, boards, projectId]);

  if (!canView) {
    return (
      <div className='tasks-screen mx-auto flex max-w-md flex-col items-center gap-2 p-10 text-center'>
        <h1 className='text-display text-ink'>Tasks</h1>
        <Text className='text-placeholder'>No access</Text>
      </div>
    );
  }

  const title = active === NEW ? 'New Task' : active !== null ? 'Task Info' : 'Taskboard';
  const sortState = {
    boards,
    board: chosenBoard,
    closed: closedView,
    deadline,
    priority: filters.priority,
    assignee: filters.assignee,
    people,
  };
  const head = (
    <TaskHead
      title={title}
      search={{
        open: searchOpen,
        value: search.draft,
        setOpen: setSearchOpen,
        setValue: search.setDraft,
        clear: search.clear,
      }}
      onBack={active !== null ? back : undefined}
      onAdd={writable && active === null ? () => startCreate() : undefined}
      filter={
        active === null ? (
          <BoardSort
            state={sortState}
            open={sortOpen}
            onOpen={setSortOpen}
            onBoard={chooseBoard}
            onClosed={() => setClosedView(true)}
            tools={{
              writable,
              onAdd: (name) => void submitNewBoard(name).catch(() => undefined),
              onReorder: reorderBoards.mutate,
              renaming,
              onRenamingChange: setRenaming,
              onRename: (id, name) => void submitRename(id, name),
              renameBusy: renameBoard.isPending,
              onDelete: setDeletingBoard,
            }}
            onDeadline={setDeadline}
            onPriority={(priority) => setFilters((f) => setFilter(f, { priority }))}
            onAssignee={(assignee) =>
              setFilters((f) =>
                assignee === undefined ? { ...f, assignee: undefined } : setFilter(f, { assignee }),
              )
            }
          />
        ) : undefined
      }
    />
  );

  const boardHead = (
    <>
      <div
        aria-hidden='true'
        className='transition-[height] duration-700 ease-soft motion-reduce:transition-none'
        style={{ height: boardSortRoom(sortState, sortOpen, writable) }}
      />
      <LiquidTabs
        label='boards'
        className='mt-[clamp(1rem,4vh,2.75rem)] mb-1'
        items={[
          { value: 'all', label: 'All' },
          ...(account?.username ? [{ value: 'mine' as const, label: 'My Tasks' }] : []),
          { value: 'archived', label: 'Archived' },
        ]}
        value={closedView ? null : scope}
        onChange={(next: Scope) => {
          setClosedView(false);
          setScope(next);
        }}
        end={
          <>
            {projectLabel && (
              <Button
                type='button'
                variant='default'
                aria-label={`project: ${projectLabel} — clear`}
                onClick={dropProject}
                className='mr-4 cursor-pointer truncate text-textBaseSize text-ink hover:text-labelDark'
              >
                [ Project: {projectLabel} ]
              </Button>
            )}
            {writable && (
              <AddInline
                label='Add New Board'
                onSubmit={submitNewBoard}
                busy={addBoard.isPending}
              />
            )}
          </>
        }
      />
    </>
  );

  const main = closedView ? (
    <ClosedSummary boards={boards} onOpen={openTask} />
  ) : searching ? (
    <div className='flex flex-col gap-3'>
      {chosenBoard > 0 && (
        <TaskSearchScope
          allBoards={allBoards}
          onScope={setAllBoards}
          boardName={boards.find((b) => b.id === chosenBoard)?.name ?? ''}
          count={found.data ? hits.length : undefined}
        />
      )}
      {found.isError && !found.data ? (
        <div className='flex items-center gap-3'>
          <Text className='text-error'>Search failed</Text>
          <Button variant='underline' size='xs' onClick={() => found.refetch()}>
            retry
          </Button>
        </div>
      ) : !found.data ? (
        <div aria-busy className='flex flex-col gap-3 py-4'>
          <SkeletonLine width='60%' />
          <SkeletonLine width='45%' />
        </div>
      ) : (
        <TaskSearchResults
          hits={hits}
          query={search.query}
          onOpen={(task) => {
            search.clear();
            setSearchOpen(false);
            openTask(task);
          }}
        />
      )}
    </div>
  ) : isLoading ? (
    <BoardSkeleton />
  ) : isError ? (
    <div className='flex items-center gap-3'>
      <Text className='text-error'>
        {error instanceof Error ? error.message : 'failed to load tasks'}
      </Text>
      <Button
        variant='underline'
        size='xs'
        onClick={() => (boardsQuery.isError ? boardsQuery.refetch() : tasksQuery.refetch())}
      >
        retry
      </Button>
    </div>
  ) : (
    <>
      {boardTruncated && (
        <Text className='mb-2 text-error'>
          Showing {tasks.length} of {tasksQuery.data?.total}
        </Text>
      )}
      <Board
        tasks={visible}
        allTasks={tasks}
        filter={filter}
        filtered={narrowed}
        canWrite={writable}
        selected={selected}
        onSelect={setSelected}
        onOpen={openTask}
        onAdd={(status) => startCreate(status)}
      />
    </>
  );

  /** The board alone: the title row, the sort, the tabs, and the board in what is left. */
  const boardArea = (
    <div className={BOARD_AREA}>
      {head}
      {boardHead}
      <div
        className={closedView || searching ? 'min-h-0 flex-1 overflow-y-auto' : 'min-h-0 flex-1'}
      >
        {main}
      </div>
    </div>
  );

  /** A task is open: its title and — inside a session — its live tile. */
  const left = (tile: ReactNode, dim?: (node: ReactNode) => ReactNode) => {
    const body = (
      <>
        {head}
        <div className='mt-[clamp(1.5rem,8vh,5.5rem)] md:pl-10'>{tile}</div>
      </>
    );
    return <div className={`${LEFT} max-[56.25rem]:hidden`}>{dim ? dim(body) : body}</div>;
  };

  const panelFallback = (state: 'loading' | 'missing') => (
    <>
      {left(null)}
      <aside aria-label='task info' className={PANEL}>
        {state === 'loading' ? (
          <SkeletonBlocks count={4} className='py-4' />
        ) : (
          <Text className='py-4 text-placeholder'>Task not found</Text>
        )}
      </aside>
    </>
  );

  const session = (task: Task | undefined) => (
    <TaskSessionProvider
      key={activeKey}
      task={task}
      initial={newSeed}
      onCreated={onCreated}
      onDeleted={onDeleted}
      onDirtyChange={onDirtyChange}
    >
      {left(<LiveTile mode={mode} captureRef={captureTile} />, (node) => (
        <TaskDim leaving={!!pending}>{node}</TaskDim>
      ))}
      <aside aria-label='task info' className={PANEL}>
        <TaskDim leaving={!!pending}>
          <div className='flex items-center justify-between gap-4 pt-2'>
            <Text component='span' className='text-ink'>
              {title}
            </Text>
            <LiquidTabs
              label='tile view'
              items={MODES}
              value={mode}
              onChange={(next: TileMode) => {
                captureTile.current?.();
                setMode(next);
              }}
            />
          </div>
          <TaskForm />
        </TaskDim>
      </aside>
      <TaskActionBar
        leaving={!!pending}
        onContinue={() => {
          const go = pending;
          dirty.current = false;
          setPending(null);
          go?.();
        }}
        onClose={() => goTo(null)}
      />
    </TaskSessionProvider>
  );

  return (
    <div
      className={
        active === null
          ? 'tasks-screen tasks-board-mode flex h-[calc(100dvh-6.5rem)] items-stretch overflow-hidden'
          : 'tasks-screen flex min-h-[calc(100dvh-6.5rem)] items-stretch'
      }
    >
      {active === null ? (
        boardArea
      ) : active === NEW ? (
        boardsQuery.isLoading || !newSeed?.boardId ? (
          panelFallback('loading')
        ) : (
          session(undefined)
        )
      ) : (
        <StoredSession key={activeKey} id={active} fallback={panelFallback}>
          {(task) => <StoredEmbeds task={task}>{session(task)}</StoredEmbeds>}
        </StoredSession>
      )}

      <DeleteBoardModal
        board={deletingBoard}
        boards={boards}
        busy={deleteBoard.isPending}
        onOpenChange={(o) => !o && setDeletingBoard(null)}
        onConfirm={confirmDeleteBoard}
      />
    </div>
  );
}
