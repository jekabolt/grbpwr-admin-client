import { useQuery } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { filesService } from 'components/managers/files/api/filesService';
import { ARCHIVED_WORD } from 'components/managers/files/components/topic-chips';
import { ROUTES, SECTION } from 'constants/routes';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { TASKS_PAGE_LIMIT } from './api/tasksService';
import { emptyFormValues, TaskBoard, TaskFormValues, TaskStatus } from './api/types';
import { Board } from './components/board';
import { BoardSkeleton } from './components/board-skeleton';
import {
  applyFilters,
  assigneePiles,
  emptyFilters,
  filtersActive,
  FiltersBar,
  setFilter,
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
  const dropProject = () => {
    const next = new URLSearchParams(params);
    next.delete('project');
    setParams(next, { replace: true });
  };
  // Имя проекта — ИЗ СЛОВАРЯ С АРХИВОМ: доска законно сужается и по заархивированной съёмке
  // (хвост задач по законченной работе нормален), и «project #17» вместо имени читалось бы
  // как поломка. Запрос уходит только когда сужение есть.
  const { data: projectTopics } = useQuery({
    queryKey: ['tasks', 'project-scope', projectId],
    enabled: projectId > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => filesService.listTopics(true),
  });
  const projectTopic = (projectTopics?.topics ?? []).find((t) => Number(t.id) === projectId);
  const projectLabel = projectId
    ? projectTopic?.name
      ? projectTopic.archived
        ? `${projectTopic.name} · ${ARCHIVED_WORD}`
        : projectTopic.name
      : `#${projectId}`
    : undefined;

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
    () => ({ board: activeBoard, includeArchived: showArchived, projectTopicId: projectId }),
    [activeBoard, showArchived, projectId],
  );
  const { data, isLoading, isError, error, refetch } = useTasks(filter);
  const tasks = data?.tasks ?? [];

  // Per-board open-task counts for the rail — one all-boards, active-only read. Сужение
  // проектом входит и сюда: иначе число в рельсе противоречило бы колонкам под ним.
  const countsFilter = useMemo(() => ({ projectTopicId: projectId }), [projectId]);
  const { data: countsData } = useTasks(countsFilter);

  // ListTasks is a single page capped at TASKS_PAGE_LIMIT. Past that the board silently drops
  // cards and the rail counts undercount, which is indistinguishable from a deleted task — so
  // compare the server's `total` against what we actually got and say when it's short.
  const boardTruncated = (data?.total ?? 0) > tasks.length;
  const countsTruncated = (countsData?.total ?? 0) > (countsData?.tasks.length ?? 0);
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

  const active = filtersActive(filters);
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

  // The create modal; `null` = closed. Column seeds the new card's status.
  const [creating, setCreating] = useState<TaskStatus | null>(null);
  const createTask = useCreateTask();

  // Заводя карточку на суженной проектом доске, человек заводит её ПО ЭТОМУ ПРОЕКТУ:
  // преселект ссылки — то же самое, что преселект колонки, из которой нажали «+».
  const initial: TaskFormValues = useMemo(
    () => ({ ...emptyFormValues(activeBoard, creating ?? 'TASK_STATUS_TODO'), projectTopicId: projectId }),
    [activeBoard, creating, projectId],
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
              people={people}
              showArchived={showArchived}
              onToggleArchived={() => setShowArchived((v) => !v)}
              onClear={clearFilters}
              projectLabel={projectLabel}
              onClearProject={dropProject}
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
              {(boardTruncated || countsTruncated) && (
                <CalloutBox tone='warning' className='flex flex-wrap items-baseline gap-1.5'>
                  <Text size='micro' component='span' className='font-bold uppercase tracking-label'>
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
