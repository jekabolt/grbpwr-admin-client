import { useDockBottom } from 'hooks/useDockBottom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ARCHIVED_WORD } from 'components/managers/files/components/topic-chips';
import { isProjectTopic, useFileTopics } from 'components/managers/files/hooks/useFiles';
import { ROUTES, SECTION } from 'constants/routes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AddDoor,
  Button,
  CalloutBox,
  Chip,
  ChipRow,
  Section,
  SectionHeader,
  Select,
  SideRail,
  SideRailGroup,
  SideRailItem,
  SideRailLayout,
  SkeletonLine,
  Text,
  TILE_QUIET,
  Toolbar,
} from 'ui';
import { TASKS_PAGE_LIMIT } from './api/tasksService';
import { emptyFormValues, Task, TaskBoardEntry, TaskFormValues, TaskStatus } from './api/types';
import { Board } from './components/board';
import { BoardNameField } from './components/board-name-field';
import { BoardSkeleton } from './components/board-skeleton';
import { ClosedSummary } from './components/closed-summary';
import {
  applyFilters,
  assigneePiles,
  emptyFilters,
  filtersActive,
  FiltersBar,
  PhoneFilterGroups,
  setFilter,
  taskFilterCount,
  TaskFilters,
  TaskProjectFilter,
} from './components/filters-bar';
import { TAP } from './components/filters-bar';
import { DeleteBoardModal } from './components/delete-board-modal';
import { TaskFormModal } from './components/task-form-modal';
import { TaskSearchField, TaskSearchResults, TaskSearchScope } from './components/task-search';
import { useSearchQuery } from './hooks/useSearchQuery';
import { useMediaQuery } from './hooks/useMediaQuery';
import {
  useAddTaskBoard,
  useCreateTask,
  useDeleteTaskBoard,
  useRenameTaskBoard,
  useTaskBoards,
  useTaskSearch,
  useTasks,
} from './hooks/useTasks';
import { searchTasks } from './utils/search';

const ACTIVE_BOARD_KEY = 'grbpwr.kanban.activeBoard';
const FILTERS_KEY = 'grbpwr.kanban.filters';
const ARCHIVED_KEY = 'grbpwr.kanban.archived';
const CLOSED_VIEW_KEY = 'grbpwr.kanban.closedView';
/** Rail entry that is not a board: the summary of cards closed in a period, every board. */
const CLOSED_VIEW = 'closed';
/** The phone select's last line opens the new-board field instead of choosing a board. */
const ADD_BOARD = 'add-board';
const RAIL_QUERY = '(min-width: 1024px)';
const PHONE_SCREEN_QUERY = '(max-width: 639px)';

function readStoredBoard(): string {
  try {
    return localStorage.getItem(ACTIVE_BOARD_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * The stored board is an id since custom boards; before, it was the enum string
 * (`TASK_BOARD_MARKETING`). An enum is translated through `legacyBoard`, an unknown or deleted id
 * falls back to the first board.
 */
function resolveBoard(stored: string, boards: TaskBoardEntry[]): number {
  if (!boards.length) return 0;
  const asId = Number(stored);
  const hit =
    (Number.isInteger(asId) && asId > 0 && boards.find((b) => b.id === asId)) ||
    (stored.startsWith('TASK_BOARD_') && boards.find((b) => b.legacyBoard === stored));
  return hit ? hit.id : boards[0].id;
}

export function Tasks() {
  const { account, canRead, canWrite, resolved } = usePermissions();
  const navigate = useNavigate();
  const canView = !resolved || canRead(SECTION.tasks);
  /**
   * СУЖЕНИЕ ПРОЕКТОМ ЖИВЁТ В АДРЕСЕ, а не в сессионных фильтрах: сюда приходят ссылкой со
   * страницы проекта («open board»), и такая ссылка обязана пережить перезагрузку и уехать
   * в чужой чат. Сессионный фильтр этого не умеет по построению.
   */
  const [params, setParams] = useSearchParams();
  /**
   * КЛАМП `> 0` — НЕ ПЕДАНТИЗМ. Сервер сужает `ListTasks` только по ПОЛОЖИТЕЛЬНОМУ id
   * (`if f.ProjectTopicId > 0`), поэтому `?project=-5` уехал бы на него и не сузил ничего, а
   * чип над доской утверждал бы сужение — экран говорил бы одно, а показывал другое. Дробное
   * режется тем же движением: id темы целый, и «2.5» на проводе значит ровно то, что клиент
   * не посмотрел на свой адрес.
   */
  const rawProject = Math.trunc(Number(params.get('project') ?? 0));
  const projectId = Number.isFinite(rawProject) && rawProject > 0 ? rawProject : 0;
  const setProject = (id: number) => {
    const next = new URLSearchParams(params);
    if (id > 0) next.set('project', String(id));
    else next.delete('project');
    setParams(next, { replace: true });
  };
  const dropProject = () => setProject(0);
  // Проекты — ИЗ СЛОВАРЯ С АРХИВОМ: телефон строит отсюда первый ряд фильтров, а выбранный
  // архивный проект обязан сохранить имя (хвост задач по законченной работе нормален).
  const projectTopicsQuery = useFileTopics(true, canView);
  const projectTopics = projectTopicsQuery.data?.topics ?? [];
  const projectTopic = projectTopics.find((t) => Number(t.id) === projectId);
  const projectLabel = projectId
    ? projectTopic?.name
      ? projectTopic.archived
        ? `${projectTopic.name} · ${ARCHIVED_WORD}`
        : projectTopic.name
      : `#${projectId}`
    : undefined;

  const writable = canWrite(SECTION.tasks);
  const saveBarRef = useRef<HTMLDivElement>(null);
  useDockBottom(saveBarRef, [writable]);

  // tskTabs v2 — the board is chosen from a left rail, persisted as before. Boards come from
  // ListTaskBoards; the stored value is migrated from the old enum to the id on first read.
  const boardsQuery = useTaskBoards(canView);
  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const [storedBoard, setStoredBoard] = useState(readStoredBoard);
  const activeBoard = useMemo(() => resolveBoard(storedBoard, boards), [storedBoard, boards]);
  // «closed» sits in the rail after the boards; the last board stays chosen underneath it, and
  // choosing any board (rail, chip, select, a new board, a search hit) leaves the summary.
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
    } catch {
      /* storage blocked: the view just is not remembered */
    }
  }, [closedView]);
  const setActiveBoard = (id: number) => {
    setClosedView(false);
    setStoredBoard(String(id));
  };
  useEffect(() => {
    if (!activeBoard) return;
    try {
      localStorage.setItem(ACTIVE_BOARD_KEY, String(activeBoard));
    } catch {
      /* storage blocked: the board just is not remembered */
    }
  }, [activeBoard]);
  const activeEntry = boards.find((b) => b.id === activeBoard);
  const activeName = activeEntry?.name ?? '';

  // CUSTOM-BOARDS: add / rename in place, delete asks where the tasks go.
  const railShown = useMediaQuery(RAIL_QUERY);
  const phoneScreen = useMediaQuery(PHONE_SCREEN_QUERY);
  const [addingBoard, setAddingBoard] = useState(false);
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState<TaskBoardEntry | null>(null);
  const addBoard = useAddTaskBoard();
  const renameBoard = useRenameTaskBoard();
  const deleteBoard = useDeleteTaskBoard();
  const canDeleteBoard = boards.length > 1;
  const stopEditingBoard = () => {
    setAddingBoard(false);
    setRenamingBoard(false);
  };
  async function submitNewBoard(name: string) {
    try {
      const created = await addBoard.mutateAsync(name);
      setAddingBoard(false);
      if (created.id) setActiveBoard(created.id);
    } catch {
      /* snackbar shown by the mutation; keep the field open */
    }
  }
  async function submitRename(name: string) {
    if (!activeBoard) return;
    try {
      await renameBoard.mutateAsync({ id: activeBoard, name });
      setRenamingBoard(false);
    } catch {
      /* snackbar shown by the mutation; keep the field open */
    }
  }
  async function confirmDeleteBoard(moveToId: number) {
    if (!deletingBoard) return;
    try {
      await deleteBoard.mutateAsync({ id: deletingBoard.id, moveToId });
      setDeletingBoard(null);
      setRenamingBoard(false);
      const next = moveToId || boards.find((b) => b.id !== deletingBoard.id)?.id;
      if (next) setActiveBoard(next);
    } catch {
      /* snackbar shown by the mutation; keep the dialog open */
    }
  }
  const startAdding = () => {
    // The new-board field lives in the board header off the rail; the summary hides it.
    setClosedView(false);
    setRenamingBoard(false);
    setAddingBoard(true);
  };
  const startRenaming = () => {
    setAddingBoard(false);
    setRenamingBoard(true);
  };

  // tskArchive v3 — archived is a filter, not a mode. On = include_archived so the
  // board shows active + archived (the cards dim themselves); off = active only.
  const [showArchived, setShowArchived] = useState(
    () => sessionStorage.getItem(ARCHIVED_KEY) === '1',
  );
  useEffect(() => sessionStorage.setItem(ARCHIVED_KEY, showArchived ? '1' : '0'), [showArchived]);

  const filter = useMemo(
    () => ({ boardId: activeBoard, includeArchived: showArchived, projectTopicId: projectId }),
    [activeBoard, showArchived, projectId],
  );
  // No board id yet = the board list is still loading; a read without it would span every board.
  const tasksQuery = useTasks(filter, activeBoard > 0);
  const { data } = tasksQuery;
  const isError = tasksQuery.isError || boardsQuery.isError;
  const error = tasksQuery.error ?? boardsQuery.error;
  const refetch = () => (boardsQuery.isError ? boardsQuery.refetch() : tasksQuery.refetch());
  const isLoading =
    tasksQuery.isLoading || boardsQuery.isLoading || (!activeBoard && !boardsQuery.isError);
  const tasks = data?.tasks ?? [];

  // Per-board open-task counts for the rail — one all-boards, active-only read. Сужение
  // проектом входит и сюда: иначе число в рельсе противоречило бы колонкам под ним.
  const countsFilter = useMemo(
    () => ({ projectTopicId: projectId, includeArchived: false }),
    [projectId],
  );
  const { data: countsData } = useTasks(countsFilter);
  const projectCountsFilter = useMemo(
    () => ({ projectTopicId: 0, includeArchived: showArchived }),
    [showArchived],
  );
  const { data: projectCountsData } = useTasks(projectCountsFilter, canView);

  // ListTasks is a single page capped at TASKS_PAGE_LIMIT. Past that the board silently drops
  // cards and the rail counts undercount, which is indistinguishable from a deleted task — so
  // compare the server's `total` against what we actually got and say when it's short.
  const boardTruncated = (data?.total ?? 0) > tasks.length;
  const countsTruncated = (countsData?.total ?? 0) > (countsData?.tasks.length ?? 0);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of countsData?.tasks ?? []) {
      if (t.archivedAt) continue;
      m.set(t.boardId, (m.get(t.boardId) ?? 0) + 1);
    }
    return m;
  }, [countsData]);
  const projectCounts = useMemo(() => {
    const result = new Map<number, number>();
    for (const task of projectCountsData?.tasks ?? []) {
      if (task.task.projectTopicId <= 0) continue;
      result.set(task.task.projectTopicId, (result.get(task.task.projectTopicId) ?? 0) + 1);
    }
    return result;
  }, [projectCountsData]);
  const projectFilters = useMemo<TaskProjectFilter[]>(
    () =>
      projectTopics
        .filter(isProjectTopic)
        .filter((topic) => !topic.archived || Number(topic.id) === projectId)
        .map((topic) => ({
          id: Number(topic.id),
          label: topic.archived ? `${topic.name} · ${ARCHIVED_WORD}` : topic.name || '',
          count: projectCountsData ? projectCounts.get(Number(topic.id)) ?? 0 : undefined,
        }))
        .filter(
          (project) =>
            project.id > 0 &&
            !!project.label &&
            (project.id === projectId || project.count === undefined || project.count > 0),
        ),
    [projectCounts, projectCountsData, projectId, projectTopics],
  );
  const boardOptions = [
    ...boards.map((b) => ({
      value: String(b.id),
      label: `${b.name} · ${counts.get(b.id) ?? 0}`,
    })),
    ...(writable ? [{ value: ADD_BOARD, label: '+ board' }] : []),
    { value: CLOSED_VIEW, label: CLOSED_VIEW },
  ];

  // Persist filters across navigation (opening a task detail unmounts the board).
  //
  // ВОССТАНОВЛЕНИЕ ИДЁТ ЧЕРЕЗ ТО ЖЕ `setFilter`, ЧТО И ЩЕЛЧОК ПО ЧИПУ. Раньше сохранённый JSON
  // раскладывался в состояние напрямую — то есть МИНУЯ правило взаимного исключения «мои ↔
  // конкретный человек». Из сегодняшнего кода такой набор недостижим (оба поля родились одной
  // волной, и записывает их только `setFilter`), но недостижимость держалась на том, что осей у
  // фильтра ровно две; с третьей это перестанет быть очевидным, а хранилище — вход, который
  // переживает выкаты и правится руками из консоли. Правило обязано стоять на КАЖДОМ входе в
  // состояние, а не на одном из двух.
  const [filters, setFilters] = useState<TaskFilters>(() => {
    try {
      const raw = sessionStorage.getItem(FILTERS_KEY);
      if (!raw) return emptyFilters;
      return setFilter(emptyFilters, JSON.parse(raw) as Partial<TaskFilters>);
    } catch {
      return emptyFilters;
    }
  });
  useEffect(() => sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters)), [filters]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const active = filtersActive(filters);
  const phoneFilterCount = taskFilterCount(filters, showArchived, projectId > 0);
  // The include_archived flag already scopes the read; the chip cards dim themselves.
  const visible = useMemo(
    () => applyFilters(tasks, filters, account?.username),
    [tasks, filters, account?.username],
  );

  /**
   * ЛЮДИ РЯДА СЧИТАЮТСЯ ПО НЕСУЖЕННЫМ ЗАДАЧАМ ЭТОЙ ДОСКИ. Не по `visible`: иначе клик по лицу
   * обнулил бы соседние числа и ряд отвечал бы на вопрос о самом себе. Архивные входят в счёт
   * ровно тогда, когда зажжён чип archived, — потому что именно тогда они и лежат в `tasks`.
   */
  const people = useMemo(() => assigneePiles(tasks, filters.assignee), [tasks, filters.assignee]);

  // SEARCH — `?q=` in the address; a non-empty query swaps the board for the results list.
  const search = useSearchQuery();
  const searching = search.query.length > 0 && !closedView;
  const [allBoards, setAllBoards] = useState(true);
  const found = useTaskSearch(search.query);
  const hits = useMemo(() => {
    const all = searchTasks(found.data?.tasks ?? [], search.query);
    return allBoards ? all : all.filter((h) => h.task.boardId === activeBoard);
  }, [found.data, search.query, allBoards, activeBoard]);
  // A hit opens the way a card does: search cleared, its board selected, then the task.
  function openHit(task: Task) {
    search.clear();
    setActiveBoard(task.boardId);
    navigate(`${ROUTES.tasks}/${task.id}`);
  }
  const phoneSearchField = (
    <TaskSearchField
      name='task-search-phone'
      value={search.draft}
      onChange={search.setDraft}
      onClear={search.clear}
    />
  );
  const searchScope = searching && (
    <TaskSearchScope
      allBoards={allBoards}
      onScope={setAllBoards}
      boardName={activeName}
      count={found.data ? hits.length : undefined}
    />
  );

  // The create modal; `null` = closed. Column seeds the new card's status.
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const createTask = useCreateTask();

  // Заводя карточку на суженной проектом доске, человек заводит её ПО ЭТОМУ ПРОЕКТУ:
  // преселект ссылки — то же самое, что преселект колонки, из которой нажали «+».
  const initial: TaskFormValues = useMemo(
    () => ({
      ...emptyFormValues(activeBoard, creating ?? 'TASK_STATUS_TODO'),
      projectTopicId: projectId,
    }),
    [activeBoard, creating, projectId],
  );

  async function handleCreate(values: TaskFormValues) {
    const { boardId, status, ...content } = values;
    try {
      await createTask.mutateAsync({ content, boardId: boardId || activeBoard, status });
      setCreating(null);
    } catch {
      /* snackbar shown by the mutation; keep the modal open */
    }
  }

  function clearFilters() {
    setFilters(emptyFilters);
    setShowArchived(false);
    // «Clear» значит одно и то же для всех сужений экрана: оставить проект зажжённым после
    // него означало бы, что слово на кнопке врёт про часть ряда.
    if (projectId) dropProject();
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
    <div className='flex w-full flex-col gap-4 pb-24 sm:pb-10'>
      <SectionHeader
        className='max-sm:hidden'
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
          <SideRail className='hidden lg:block'>
            <SideRailGroup flush>boards</SideRailGroup>
            {boards.map((board) =>
              renamingBoard && railShown && board.id === activeBoard ? (
                <BoardNameField
                  key={board.id}
                  name='task-board-rename'
                  initial={board.name}
                  busy={renameBoard.isPending}
                  onSubmit={submitRename}
                  onCancel={stopEditingBoard}
                  className='my-0.5'
                />
              ) : (
                <SideRailItem
                  key={board.id}
                  label={board.name}
                  count={counts.get(board.id) ?? 0}
                  selected={!closedView && board.id === activeBoard}
                  onClick={() => setActiveBoard(board.id)}
                />
              ),
            )}
            {writable &&
              (addingBoard && railShown ? (
                <BoardNameField
                  name='task-board-new'
                  busy={addBoard.isPending}
                  onSubmit={submitNewBoard}
                  onCancel={stopEditingBoard}
                  className='mt-1.5'
                />
              ) : (
                <AddDoor onClick={startAdding} className='mt-1.5 w-full'>
                  board
                </AddDoor>
              ))}
            <div className='mt-3 border-t border-hairline pt-2'>
              <SideRailItem
                label={CLOSED_VIEW}
                selected={closedView}
                onClick={() => setClosedView(true)}
              />
            </div>
          </SideRail>
        }
      >
        <div className='flex min-w-0 flex-col gap-2 sm:gap-3'>
          <Section
            title='tasks'
            className='sm:hidden'
            action={
              !closedView && (
                <>
                  {!!account?.username && (
                    <Chip
                      selected={filters.mine}
                      pressed={filters.mine}
                      onClick={() =>
                        setFilters((current) => setFilter(current, { mine: !current.mine }))
                      }
                      className='min-h-9'
                    >
                      mine
                    </Chip>
                  )}
                  <Chip
                    selected={phoneFilterCount > 0}
                    pressed={filtersOpen}
                    onClick={() => setFiltersOpen((open) => !open)}
                    aria-expanded={filtersOpen}
                    aria-controls='task-phone-filters'
                    className='min-h-9'
                  >
                    {phoneFilterCount > 0 ? `filters · ${phoneFilterCount}` : 'filters'}
                  </Chip>
                </>
              )
            }
          >
            {phoneScreen && (addingBoard || renamingBoard) ? (
              <div className='flex flex-col gap-2'>
                <BoardNameField
                  key={addingBoard ? 'new' : `rename-${activeBoard}`}
                  name='task-board-name-phone'
                  initial={addingBoard ? '' : activeName}
                  busy={addBoard.isPending || renameBoard.isPending}
                  onSubmit={addingBoard ? submitNewBoard : submitRename}
                  onCancel={stopEditingBoard}
                  className='min-h-11'
                  inputClassName='uppercase tracking-label'
                />
                <div className='flex justify-end gap-4'>
                  <Button variant='underline' size='xs' onClick={stopEditingBoard}>
                    cancel
                  </Button>
                  {renamingBoard && canDeleteBoard && activeEntry && (
                    <Button
                      variant='underline'
                      size='xs'
                      onClick={() => setDeletingBoard(activeEntry)}
                    >
                      delete
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className='flex items-center gap-2'>
                <Select
                  name='task-board-phone'
                  value={closedView ? CLOSED_VIEW : activeBoard ? String(activeBoard) : undefined}
                  items={boardOptions}
                  fullWidth
                  itemClassName='min-h-11'
                  className='min-h-11 uppercase tracking-label'
                  placeholder='board'
                  onValueChange={(value: string) =>
                    value === ADD_BOARD
                      ? startAdding()
                      : value === CLOSED_VIEW
                        ? setClosedView(true)
                        : setActiveBoard(Number(value))
                  }
                />
                {writable && !closedView && (
                  <Button variant='underline' size='xs' onClick={startRenaming}>
                    edit
                  </Button>
                )}
              </div>
            )}
            {!closedView && phoneSearchField}
            {searchScope}
            {!closedView && filtersOpen && (
              <div id='task-phone-filters'>
                <PhoneFilterGroups
                  filters={filters}
                  onChange={setFilters}
                  people={people}
                  projects={projectFilters}
                  projectId={projectId}
                  onProjectChange={setProject}
                  showArchived={showArchived}
                  onToggleArchived={() => setShowArchived((value) => !value)}
                  onClear={clearFilters}
                />
              </div>
            )}
          </Section>

          {/* Между sm и lg рельса нет: доски остаются строкой чипов из v1. */}
          <div className='hidden sm:block lg:hidden'>
            <ChipRow className='gap-1.5 overflow-x-auto flex-nowrap'>
              {boards.map((board) => (
                <Chip
                  key={board.id}
                  selected={!closedView && board.id === activeBoard}
                  pressed={!closedView && board.id === activeBoard}
                  onClick={() => setActiveBoard(board.id)}
                  className={TAP}
                >
                  {board.name} {counts.get(board.id) ?? 0}
                </Chip>
              ))}
              {writable && !addingBoard && (
                <AddDoor onClick={startAdding} shape='inline' className={TAP}>
                  board
                </AddDoor>
              )}
              <Chip
                selected={closedView}
                pressed={closedView}
                onClick={() => setClosedView(true)}
                className={TAP}
              >
                {CLOSED_VIEW}
              </Chip>
            </ChipRow>
          </div>
          {!!activeEntry && !closedView && (
            <div className='group hidden items-center gap-3.5 sm:flex'>
              {(renamingBoard || addingBoard) && !railShown && !phoneScreen ? (
                <BoardNameField
                  key={addingBoard ? 'new' : `rename-${activeBoard}`}
                  name='task-board-name-header'
                  initial={addingBoard ? '' : activeName}
                  busy={addBoard.isPending || renameBoard.isPending}
                  onSubmit={addingBoard ? submitNewBoard : submitRename}
                  onCancel={stopEditingBoard}
                  className='w-60'
                />
              ) : (
                <Text variant='uppercase' component='h2' className='font-bold tracking-label'>
                  {activeName}
                </Text>
              )}
              <Text size='micro' variant='label' component='span' className='uppercase'>
                {counts.get(activeBoard) ?? 0} tasks
              </Text>
              {writable && (
                <span className={`ml-auto flex items-center gap-3.5 ${TILE_QUIET}`}>
                  <Button variant='underline' size='xs' onClick={startRenaming}>
                    rename
                  </Button>
                  {canDeleteBoard && (
                    <Button
                      variant='underline'
                      size='xs'
                      onClick={() => setDeletingBoard(activeEntry)}
                    >
                      delete
                    </Button>
                  )}
                </span>
              )}
            </div>
          )}
          {!closedView && (
            <Toolbar className='hidden sm:flex'>
              <FiltersBar
                filters={filters}
                onChange={setFilters}
                showMine={!!account?.username}
                people={people}
                showArchived={showArchived}
                onToggleArchived={() => setShowArchived((v) => !v)}
                onClear={clearFilters}
                projectLabel={projectLabel}
                onClearProject={dropProject}
                search={
                  <>
                    {/* Phone gets its own copy in the header block above. */}
                    <TaskSearchField
                      value={search.draft}
                      onChange={search.setDraft}
                      onClear={search.clear}
                      className='w-60 xl:w-90'
                    />
                    {searchScope}
                  </>
                }
              />
            </Toolbar>
          )}

          {closedView ? (
            <ClosedSummary
              boards={boards}
              onOpen={(task) => navigate(`${ROUTES.tasks}/${task.id}`)}
            />
          ) : searching ? (
            found.isError && !found.data ? (
              <div className='flex items-center gap-3'>
                <Text size='micro' variant='error' tracking='label' component='span'>
                  {found.error instanceof Error ? found.error.message : 'search failed'}
                </Text>
                <Button variant='underline' size='xs' onClick={() => found.refetch()}>
                  retry
                </Button>
              </div>
            ) : !found.data ? (
              <div
                aria-busy
                className='flex flex-col gap-3 border border-borderColor bg-bgColor p-block max-sm:border-x-0'
              >
                <SkeletonLine width='60%' />
                <SkeletonLine width='45%' />
                <SkeletonLine width='70%' />
              </div>
            ) : (
              <TaskSearchResults hits={hits} query={search.query} onOpen={openHit} />
            )
          ) : isLoading ? (
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
              {(boardTruncated || countsTruncated) && (
                <CalloutBox tone='warning' className='flex flex-wrap items-baseline gap-1.5'>
                  <Text
                    size='micro'
                    component='span'
                    className='font-bold uppercase tracking-label'
                  >
                    not all tasks loaded
                  </Text>
                  <Text size='micro' component='span'>
                    {boardTruncated
                      ? `showing ${tasks.length} of ${data?.total} tasks on this board — cards are missing from the columns. `
                      : 'the per-board counts in the rail are short. '}
                    The server returns at most {TASKS_PAGE_LIMIT} tasks per read; archive finished
                    tasks to bring it back under the cap.
                  </Text>
                </CalloutBox>
              )}
              {active && visible.length === 0 && (
                <CalloutBox className='flex flex-wrap items-baseline gap-1.5'>
                  <Text
                    size='micro'
                    component='span'
                    className='font-bold uppercase tracking-label'
                  >
                    no tasks match
                  </Text>
                  <Button variant='underline' size='xs' onClick={clearFilters} className='ml-auto'>
                    clear filters
                  </Button>
                </CalloutBox>
              )}
              <Board
                tasks={visible}
                allTasks={tasks}
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

      {writable && (
        <div
          ref={saveBarRef}
          className='fixed inset-x-0 bottom-0 z-[var(--z-dock)] border-t border-borderColor bg-pageBg px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:hidden'
        >
          <Button
            variant='main'
            size='lg'
            className='min-h-12 w-full uppercase tracking-label'
            onClick={() => setCreating('TASK_STATUS_TODO')}
          >
            + new task
          </Button>
        </div>
      )}

      <DeleteBoardModal
        board={deletingBoard}
        boards={boards}
        busy={deleteBoard.isPending}
        onOpenChange={(o) => !o && setDeletingBoard(null)}
        onConfirm={confirmDeleteBoard}
      />

      <TaskFormModal
        open={creating !== null}
        onOpenChange={(o) => !o && setCreating(null)}
        mode='create'
        initial={initial}
        saving={createTask.isPending}
        onSubmit={handleCreate}
        draftKey={projectId ? `board-${activeBoard}.project-${projectId}` : `board-${activeBoard}`}
      />
    </div>
  );
}
