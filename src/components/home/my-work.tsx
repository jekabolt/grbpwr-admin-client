// «my work» — the home of a team host (mockup HOME, variant a, owner's pick 19.11). Four blocks, in
// phone order: my tasks, fittings this week, production running, recent files. Each block shows
// only when the team has its feature on AND the person may read its section; a block with nothing
// in it is not drawn (my tasks keeps its door). Existing list RPCs only.
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  useModelsByIds,
  useSamplesByIds,
  useTechCardsByIds,
} from 'components/managers/fittings/components/useResolvers';
import {
  overdueDays,
  runDetailPath,
  runStatusLabel,
  runStatusToDbFilter,
} from 'components/managers/production-runs/components/options';
import { runQty } from 'components/managers/production-runs/components/run-rows';
import { tasksService } from 'components/managers/tasks/api/tasksService';
import { emptyFormValues, type TaskFormValues } from 'components/managers/tasks/api/types';
import { TaskFormModal } from 'components/managers/tasks/components/task-form-modal';
import { tasksKeys, useCreateTask, useTaskBoards } from 'components/managers/tasks/hooks/useTasks';
import { ROUTES, SECTION } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { featureOn } from 'lib/workspace/features';
import { useWorkspace } from 'lib/workspace/use-workspace';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AddDoor, EmptyCell, Loader, Section } from 'ui';
import {
  agoWord,
  dueWord,
  fittingWhen,
  inNextWeek,
  shortDate,
  sortOpenTasks,
  toDate,
  visibleBlocks,
  type Tone,
} from './model';

const TASK_STATUS: Record<string, string> = {
  TASK_STATUS_BACKLOG: 'backlog',
  TASK_STATUS_TODO: 'to do',
  TASK_STATUS_IN_PROGRESS: 'in progress',
  TASK_STATUS_REVIEW: 'review',
};
const TONE: Record<Tone, string> = {
  ink: 'text-textColor',
  mut: 'text-labelColor',
  warn: 'text-error',
};
const TASKS_SHOWN = 8;
const RUNS_SHOWN = 6;
const FILES_SHOWN = 4;

// Column templates of the mockup; below `sm` a row folds to two lines (name over its quiet line).
const TASK_COLS = 'sm:grid-cols-[minmax(0,1fr)_9.5rem_6rem_4rem]';
const RUN_COLS = 'sm:grid-cols-[minmax(0,1fr)_6rem_2.75rem_4rem]';
const FIT_COLS = 'grid-cols-[4.5rem_minmax(0,1fr)] sm:grid-cols-[6rem_minmax(0,1fr)_auto]';

/** One list line: the whole row is the link; the name underlines on hover. */
function Line({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group grid min-h-9 items-center gap-x-3 gap-y-0.5 border-t border-hairline py-1.5 text-textColor first:border-t-0',
        className,
      )}
    >
      {children}
    </Link>
  );
}

function Head({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'hidden gap-x-3 pb-1 text-micro tracking-label text-labelColor sm:grid',
        className,
      )}
      aria-hidden
    >
      {children}
    </div>
  );
}

const NAME = 'min-w-0 truncate group-hover:underline group-hover:underline-offset-2';

function HomeList({
  title,
  note,
  action,
  className,
  children,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Section
      title={title}
      question={note}
      action={action}
      className={className}
      headerClassName='[&_h3]:normal-case'
    >
      {children}
    </Section>
  );
}

const garmentOf = (tc?: { styleNumber?: string; name?: string }) =>
  tc ? [tc.styleNumber, tc.name].filter(Boolean).join(' ') : '';

function MyTasks({ me, canAdd, className }: { me: string; canAdd: boolean; className: string }) {
  const now = new Date();
  const filter = { assignee: me };
  const q = useQuery({
    queryKey: tasksKeys.list(filter),
    queryFn: () => tasksService.listTasks(filter),
    enabled: !!me,
  });
  const open = useMemo(() => sortOpenTasks(q.data?.tasks ?? []), [q.data]);
  const shown = open.slice(0, TASKS_SHOWN);
  const cards = useTechCardsByIds(shown.map((t) => t.task.techCardId));

  const boards = useTaskBoards(canAdd);
  const createTask = useCreateTask();
  const [adding, setAdding] = useState(false);
  const initial: TaskFormValues = useMemo(
    () => ({
      ...emptyFormValues(boards.data?.[0]?.id ?? 0, 'TASK_STATUS_TODO'),
      assignees: me ? [me] : [],
    }),
    [boards.data, me],
  );
  const create = async (values: TaskFormValues) => {
    const { boardId, status, ...content } = values;
    try {
      await createTask.mutateAsync({ content, boardId, status });
      setAdding(false);
    } catch {
      /* the mutation's snackbar says it; the form stays open */
    }
  };

  return (
    <HomeList
      title='my tasks'
      note={q.data ? open.length : undefined}
      className={className}
      action={
        canAdd ? (
          <AddDoor shape='inline' lowercase onClick={() => setAdding(true)}>
            task
          </AddDoor>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <Loader />
      ) : (
        <div>
          {shown.length > 0 && (
            <Head className={TASK_COLS}>
              <span>task</span>
              <span>garment</span>
              <span>status</span>
              <span className='text-right'>due</span>
            </Head>
          )}
          {shown.map((t) => {
            const due = dueWord(t.task.dueDate, now);
            const garment = garmentOf(cards.get(t.task.techCardId)?.techCard);
            return (
              <Line
                key={t.id}
                to={ROUTES.taskDetails.replace(':id', String(t.id))}
                className={cn('grid-cols-[minmax(0,1fr)_auto]', TASK_COLS)}
              >
                <span className={NAME}>{t.task.title}</span>
                <span className='col-start-1 row-start-2 min-w-0 truncate text-labelColor sm:col-start-auto sm:row-start-auto'>
                  {garment}
                </span>
                <span className='hidden whitespace-nowrap text-labelColor sm:block'>
                  {TASK_STATUS[t.status] ?? ''}
                </span>
                <span
                  className={cn(
                    'col-start-2 row-start-1 whitespace-nowrap text-right sm:col-start-auto sm:row-start-auto',
                    TONE[due.tone],
                  )}
                >
                  {due.text}
                </span>
              </Line>
            );
          })}
          {shown.length === 0 && <EmptyCell />}
        </div>
      )}
      {canAdd && (
        <TaskFormModal
          open={adding}
          onOpenChange={(o) => !o && setAdding(false)}
          mode='create'
          initial={initial}
          saving={createTask.isPending}
          onSubmit={create}
          draftKey='home'
        />
      )}
    </HomeList>
  );
}

function WeekFittings({ className }: { className: string }) {
  const now = new Date();
  // ListFittings has no date filter: the newest page, narrowed to the next seven days here.
  const q = useQuery({
    queryKey: ['fittings', 'list', 'home'],
    queryFn: () =>
      adminService.ListFittings({
        limit: 100,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
        productId: 0,
        modelId: 0,
        techCardId: 0,
      }),
  });
  const week = useMemo(
    () =>
      (q.data?.fittings ?? [])
        .filter(
          (f) =>
            f.fitting?.status !== 'FITTING_STATUS_CANCELLED' &&
            inNextWeek(f.fitting?.fittingDate, now),
        )
        .sort(
          (a, b) =>
            (toDate(a.fitting?.fittingDate)?.getTime() ?? 0) -
            (toDate(b.fitting?.fittingDate)?.getTime() ?? 0),
        ),
    // `now` moves every render; the list only needs the data
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data],
  );
  const cards = useTechCardsByIds(week.map((f) => f.fitting?.techCardId ?? 0));
  const models = useModelsByIds(week.map((f) => f.fitting?.modelId ?? 0));
  const samples = useSamplesByIds(week.map((f) => f.fitting?.sampleId ?? 0));
  const { dictionary } = useDictionary();

  if (q.isLoading || week.length === 0) return null;
  return (
    <HomeList title='fittings' note={`${week.length} this week`} className={className}>
      <div>
        {week.map((f) => {
          const ins = f.fitting;
          const sizeId = ins?.sampleId ? samples.get(ins.sampleId)?.sample?.sizeId : undefined;
          const quiet = [
            ins?.roundNumber ? `round ${ins.roundNumber}` : '',
            ins?.modelId ? models.get(ins.modelId)?.model?.name ?? '' : '',
            sizeId ? String(findInDictionary(dictionary, sizeId, 'size') ?? '') : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Line key={f.id} to={`${ROUTES.fittings}/${f.id}`} className={FIT_COLS}>
              <span className='whitespace-nowrap'>{fittingWhen(ins?.fittingDate)}</span>
              <span className={NAME}>
                {garmentOf(cards.get(ins?.techCardId ?? 0)?.techCard) || 'fitting'}
              </span>
              <span className='col-start-2 min-w-0 truncate text-labelColor sm:col-start-auto sm:text-right'>
                {quiet}
              </span>
            </Line>
          );
        })}
      </div>
    </HomeList>
  );
}

function RunningRuns({ className }: { className: string }) {
  const list = (req: { status?: string; overdueOnly?: boolean }) =>
    adminService.ListProductionRuns({
      techCardId: undefined,
      status: req.status,
      limit: 50,
      offset: 0,
      staleDays: undefined,
      overdueOnly: req.overdueOnly,
    });
  // running = in progress; overdue = still open past its promised date (planned ones too)
  const running = useQuery({
    queryKey: ['productionRuns', 'home', 'running'],
    queryFn: () => list({ status: runStatusToDbFilter('PRODUCTION_RUN_STATUS_IN_PROGRESS') }),
  });
  const late = useQuery({
    queryKey: ['productionRuns', 'home', 'overdue'],
    queryFn: () => list({ overdueOnly: true }),
  });
  const runs = useMemo(() => {
    const byId = new Map(
      [...(late.data?.runs ?? []), ...(running.data?.runs ?? [])].map((r) => [r.id, r]),
    );
    const promised = (ts?: string) => toDate(ts)?.getTime() ?? Number.POSITIVE_INFINITY;
    return [...byId.values()].sort(
      (a, b) => promised(a.run?.promisedAt) - promised(b.run?.promisedAt),
    );
  }, [running.data, late.data]);
  const shown = runs.slice(0, RUNS_SHOWN);
  const cards = useTechCardsByIds(shown.map((r) => r.run?.techCardId ?? 0));

  if (running.isLoading || late.isLoading || runs.length === 0) return null;
  return (
    <HomeList title='production' note={`${runs.length} running`} className={className}>
      <div>
        <Head className={RUN_COLS}>
          <span>run</span>
          <span>stage</span>
          <span>pcs</span>
          <span className='text-right'>promised</span>
        </Head>
        {shown.map((r) => {
          const ins = r.run;
          const promised = toDate(ins?.promisedAt);
          const overdue = overdueDays(ins?.promisedAt, ins?.status) > 0;
          return (
            <Line
              key={r.id}
              to={runDetailPath(r.id ?? 0)}
              className={cn('grid-cols-[minmax(0,1fr)_auto]', RUN_COLS)}
            >
              <span className={NAME}>
                {garmentOf(cards.get(ins?.techCardId ?? 0)?.techCard) || `run ${r.id}`}
              </span>
              <span className='col-start-1 row-start-2 whitespace-nowrap text-labelColor sm:col-start-auto sm:row-start-auto'>
                {runStatusLabel(ins?.status)}
              </span>
              <span className='hidden tabular-nums text-labelColor sm:block'>
                {runQty(r).planned}
              </span>
              <span
                className={cn(
                  'col-start-2 row-start-1 whitespace-nowrap text-right sm:col-start-auto sm:row-start-auto',
                  overdue ? 'text-error' : 'text-labelColor',
                )}
              >
                {promised ? shortDate(promised) : <EmptyCell />}
              </span>
            </Line>
          );
        })}
      </div>
    </HomeList>
  );
}

function RecentFiles({ me, className }: { me: string; className: string }) {
  const now = new Date();
  const q = useQuery({
    queryKey: ['files', 'home', 'recent'],
    queryFn: () =>
      adminService.ListLibraryFiles({
        topicId: 0,
        untopiced: false,
        search: '',
        limit: FILES_SHOWN,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
        topicIds: [],
        sortBy: undefined,
        personId: 0,
        personRole: undefined,
        projectTopicId: 0,
        withoutRole: false,
        roleId: 0,
      }),
  });
  const files = q.data?.files ?? [];
  if (q.isLoading || files.length === 0) return null;
  return (
    <HomeList title='files' note='recent' className={className}>
      <div>
        {files.map((f) => (
          <Line
            key={f.id}
            to={ROUTES.file.replace(':id', String(f.id))}
            className='grid-cols-[minmax(0,1fr)_auto]'
          >
            <span className={NAME}>{f.fileName}</span>
            <span className='whitespace-nowrap text-right text-labelColor'>
              {[f.uploadedBy === me ? 'you' : f.uploadedBy, agoWord(f.createdAt, now)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Line>
        ))}
      </div>
    </HomeList>
  );
}

export default function MyWork() {
  const { canRead, canWrite, account, homeRoute } = usePermissions();
  const { workspace, readOnly } = useWorkspace();
  const me = account?.username ?? '';
  const blocks = visibleBlocks((f) => featureOn(workspace, f), canRead);

  if (blocks.size === 0) return <Navigate to={homeRoute ?? ROUTES.me} replace />;

  // Desktop: tasks + files on the left, fittings + production on the right. Below `lg` the two
  // columns dissolve and the blocks fall into phone order.
  const col = 'flex min-w-0 flex-col gap-gutter max-lg:contents';
  return (
    <div className='grid grid-cols-1 items-start gap-gutter lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'>
      <div className={col}>
        {blocks.has('tasks') && (
          <MyTasks
            me={me}
            canAdd={canWrite(SECTION.tasks) && !readOnly}
            className='max-lg:order-1'
          />
        )}
        {blocks.has('files') && <RecentFiles me={me} className='max-lg:order-4' />}
      </div>
      <div className={col}>
        {blocks.has('fittings') && <WeekFittings className='max-lg:order-2' />}
        {blocks.has('production') && <RunningRuns className='max-lg:order-3' />}
      </div>
    </div>
  );
}
