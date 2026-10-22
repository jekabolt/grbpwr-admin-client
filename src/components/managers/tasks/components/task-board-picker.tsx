import { notifyFailure } from 'components/shared/notify-failure';
import { cn } from 'lib/utility';
import { type JSX, useEffect, useMemo, useState } from 'react';
import {
  Board as BoardRow,
  BoardColumn,
  BoardEmpty,
  Button,
  CalloutBox,
  Chip,
  ChipRow,
  Drawer,
  Input,
  Pill,
  SkeletonBlocks,
  Text,
} from 'ui';
import type { ListTasksFilter, Task, TaskBoardEntry, TaskStatus } from '../api/types';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { boardNameOf, useTaskBoards, useTasks } from '../hooks/useTasks';
import { STATUS_LABEL } from '../utils/meta';
import { pickStateOf, type PickState } from '../utils/pick-state';
import { groupByStatus } from './board';
import { applyFilters, emptyFilters } from './filters-bar';
import { TaskCardBody } from './task-card';

export type TaskPickMode = 'blocker' | 'link' | 'subtask';

export interface TaskBoardPickerProps {
  open: boolean;
  mode: TaskPickMode;
  task: Task;
  onClose: () => void;
  onPick: (picked: Task) => Promise<void>;
  /** Set = the search text can become a new task (subtask mode). Throws on failure. */
  onCreate?: (title: string) => Promise<void>;
}

const PICKER_FILTER: ListTasksFilter = { includeArchived: true };
const PHONE_QUERY = '(max-width: 639px)';
const OPEN_STATUSES: TaskStatus[] = [
  'TASK_STATUS_BACKLOG',
  'TASK_STATUS_TODO',
  'TASK_STATUS_IN_PROGRESS',
  'TASK_STATUS_REVIEW',
];

const TITLE: Record<TaskPickMode, string> = {
  blocker: 'pick blocker',
  link: 'link task',
  subtask: 'add subtask',
};

const FAILURE: Record<TaskPickMode, string> = {
  blocker: 'blocker not added',
  link: 'link not added',
  subtask: 'subtask not added',
};

const STATE_LABEL: Record<Exclude<PickState, 'ok'>, string> = {
  self: 'this task',
  linked: 'linked',
  cycle: 'cycle',
  done: 'done',
};

const PHONE_STATUS_LABEL: Record<TaskStatus, string> = {
  TASK_STATUS_UNKNOWN: 'unknown',
  TASK_STATUS_BACKLOG: 'backlog',
  TASK_STATUS_TODO: 'to do',
  TASK_STATUS_IN_PROGRESS: 'doing',
  TASK_STATUS_REVIEW: 'review',
  TASK_STATUS_DONE: 'done',
};

function taskMatches(task: Task, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return task.task.title.toLowerCase().includes(needle) || `#${task.id}`.includes(needle);
}

function boardCounts(tasks: Task[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const task of tasks) counts.set(task.boardId, (counts.get(task.boardId) ?? 0) + 1);
  return counts;
}

function TaskPickOption({
  candidate,
  state,
  boardName,
  compact,
  busy,
  pending,
  onPick,
}: {
  candidate: Task;
  state: PickState;
  boardName?: string;
  compact?: boolean;
  busy: boolean;
  pending: boolean;
  onPick: () => void;
}) {
  const available = state === 'ok';
  const assignee = candidate.task.assignees.filter(Boolean).join(', ') || 'unassigned';
  return (
    <Button
      disabled={!available || busy}
      onClick={onPick}
      aria-label={
        available
          ? `Pick task #${candidate.id}: ${candidate.task.title}`
          : `Task #${candidate.id}: ${STATE_LABEL[state as Exclude<PickState, 'ok'>]}`
      }
      className={cn(
        'w-full border border-borderColor bg-bgColor text-left transition-[border-color,transform] duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor motion-reduce:transition-none',
        compact && 'min-h-16',
        available &&
          !busy &&
          'cursor-pointer hover:-translate-y-px hover:border-textColor motion-reduce:hover:translate-y-0',
        available && busy && 'cursor-wait',
        !available && 'cursor-not-allowed opacity-50',
      )}
    >
      <TaskCardBody task={candidate} compact={compact} framed={false} />
      <span className='flex min-w-0 items-center gap-1.5 border-t border-hairline px-2.5 py-1.5'>
        <Text size='micro' variant='label' component='span' className='shrink-0 tabular-nums'>
          #{candidate.id}
        </Text>
        <span className='ml-auto flex min-w-0 items-center justify-end gap-1.5'>
          {!!boardName && <Pill>{boardName}</Pill>}
          <Text size='micro' variant='label' component='span' title={assignee} className='truncate'>
            {pending ? 'adding' : assignee}
          </Text>
          {!available && <Pill>{STATE_LABEL[state]}</Pill>}
        </span>
      </span>
    </Button>
  );
}

function PhoneStatusTabs({
  value,
  counts,
  onChange,
}: {
  value: TaskStatus;
  counts: Record<TaskStatus, Task[]>;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <div
      role='tablist'
      aria-label='status'
      className='sticky top-0 z-[var(--z-sticky)] -mx-2.5 grid grid-cols-4 overflow-hidden border-y border-hairline bg-bgColor sm:hidden'
    >
      {OPEN_STATUSES.map((status) => {
        const selected = status === value;
        return (
          <Button
            key={status}
            role='tab'
            aria-selected={selected}
            onClick={() => onChange(status)}
            className={
              selected
                ? '!flex h-13 min-w-0 flex-col items-center justify-center gap-0.5 border-b-2 border-textColor px-0 text-textColor'
                : '!flex h-13 min-w-0 flex-col items-center justify-center gap-0.5 border-b-2 border-bgColor px-0 text-labelColor hover:text-textColor'
            }
          >
            <Text
              size='micro'
              variant='uppercase'
              tracking='pill'
              component='span'
              className='!text-inherit'
            >
              {PHONE_STATUS_LABEL[status]}
            </Text>
            <Text component='span' className='font-bold tabular-nums !text-inherit'>
              {counts[status].length}
            </Text>
          </Button>
        );
      })}
    </div>
  );
}

export function TaskBoardPicker({
  open,
  mode,
  task,
  onClose,
  onPick,
  onCreate,
}: TaskBoardPickerProps): JSX.Element {
  const phone = useMediaQuery(PHONE_QUERY);
  const tasksQuery = useTasks(PICKER_FILTER, open);
  const boardsQuery = useTaskBoards(open);
  const allTasks = useMemo(() => tasksQuery.data?.tasks ?? [], [tasksQuery.data]);
  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const counts = useMemo(() => boardCounts(allTasks), [allTasks]);
  const visibleBoards = useMemo(
    () => boards.filter((board) => (counts.get(board.id) ?? 0) > 0),
    [boards, counts],
  );

  const [boardId, setBoardId] = useState(task.boardId);
  const [query, setQuery] = useState('');
  const [phoneStatus, setPhoneStatus] = useState<TaskStatus>('TASK_STATUS_TODO');
  const [showDone, setShowDone] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pickingId, setPickingId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setBoardId(task.boardId);
    setQuery('');
    setPhoneStatus(OPEN_STATUSES.includes(task.status) ? task.status : 'TASK_STATUS_TODO');
    setShowDone(false);
    setShowArchived(false);
    setPickingId(null);
  }, [open, mode, task.boardId, task.id, task.status]);

  useEffect(() => {
    if (!open || visibleBoards.length === 0) return;
    if (visibleBoards.some((board) => board.id === boardId)) return;
    const ownBoard = visibleBoards.find((board) => board.id === task.boardId);
    setBoardId(ownBoard?.id ?? visibleBoards[0].id);
  }, [boardId, open, task.boardId, visibleBoards]);

  const searching = query.trim().length > 0;
  const scopedTasks = useMemo(() => {
    const scope = searching
      ? allTasks.filter((candidate) => taskMatches(candidate, query))
      : allTasks.filter((candidate) => candidate.boardId === boardId);
    return applyFilters(scope, emptyFilters);
  }, [allTasks, boardId, query, searching]);

  const openTasks = useMemo(
    () =>
      scopedTasks.filter(
        (candidate) => !candidate.archivedAt && candidate.status !== 'TASK_STATUS_DONE',
      ),
    [scopedTasks],
  );
  const doneTasks = useMemo(
    () =>
      scopedTasks.filter(
        (candidate) => !candidate.archivedAt && candidate.status === 'TASK_STATUS_DONE',
      ),
    [scopedTasks],
  );
  const archivedTasks = useMemo(
    () => scopedTasks.filter((candidate) => !!candidate.archivedAt),
    [scopedTasks],
  );
  const grouped = useMemo(() => groupByStatus(openTasks), [openTasks]);

  const cardBoardName = (candidate: Task) =>
    searching && candidate.boardId !== boardId ? boardNameOf(boards, candidate.boardId) : undefined;

  const [creating, setCreating] = useState(false);
  async function create() {
    const title = query.trim();
    if (!onCreate || !title || creating) return;
    setCreating(true);
    try {
      await onCreate(title);
      onClose();
    } catch {
      // onCreate's mutation already shows the failure; stay open with the text kept.
    } finally {
      setCreating(false);
    }
  }

  async function pick(candidate: Task) {
    if (pickingId !== null || pickStateOf(candidate, task, mode, allTasks) !== 'ok') return;
    setPickingId(candidate.id);
    try {
      await onPick(candidate);
      onClose();
    } catch (error) {
      notifyFailure(`TASK ${candidate.id}`, FAILURE[mode], error);
      setPickingId(null);
    }
  }

  const renderCard = (candidate: Task, compact = false) => {
    const state = pickStateOf(candidate, task, mode, allTasks);
    return (
      <TaskPickOption
        key={candidate.id}
        candidate={candidate}
        state={state}
        boardName={cardBoardName(candidate)}
        compact={compact}
        busy={pickingId !== null}
        pending={pickingId === candidate.id}
        onPick={() => void pick(candidate)}
      />
    );
  };

  const renderPhoneList = (items: Task[]) => (
    <div className='flex flex-col gap-1.5 sm:hidden'>
      {items.map((candidate) => renderCard(candidate, true))}
      {items.length === 0 && <BoardEmpty>{searching ? 'no matches' : 'empty'}</BoardEmpty>}
    </div>
  );

  const renderDesktopColumn = (title: string, items: Task[]) => (
    <BoardRow className='hidden items-start sm:flex'>
      <BoardColumn title={title} count={items.length}>
        <div className='flex min-h-24 flex-col gap-1.5'>
          {items.map((candidate) => renderCard(candidate))}
          {items.length === 0 && (
            <BoardEmpty className='flex min-h-24 items-center justify-center'>
              {searching ? 'no matches' : 'empty'}
            </BoardEmpty>
          )}
        </div>
      </BoardColumn>
    </BoardRow>
  );

  const loading = tasksQuery.isLoading || boardsQuery.isLoading;
  const failed = tasksQuery.isError || boardsQuery.isError;
  const drawerWidth = Math.round(window.innerWidth * (phone ? 1 : 0.9));

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && pickingId === null) onClose();
      }}
      title={TITLE[mode]}
      width={drawerWidth}
    >
      <div className='flex min-h-full flex-col gap-2.5'>
        <ChipRow className='flex-nowrap overflow-x-auto pb-0.5'>
          {visibleBoards.map((board: TaskBoardEntry) => (
            <Chip
              key={board.id}
              selected={board.id === boardId}
              pressed={board.id === boardId}
              onClick={() => {
                setBoardId(board.id);
                setQuery('');
              }}
              className='min-h-11 shrink-0 sm:min-h-0'
            >
              {board.name} · {counts.get(board.id) ?? 0}
            </Chip>
          ))}
        </ChipRow>

        <div className='flex items-center gap-3'>
          <Input
            name='task-board-picker-search'
            type='text'
            value={query}
            autoComplete='off'
            autoFocus
            placeholder='title or #id'
            aria-label='search tasks'
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter' && onCreate && searching) {
                event.preventDefault();
                void create();
                return;
              }
              if (event.key !== 'Escape' || !query) return;
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
            }}
            className='min-h-11 max-sm:text-reading sm:min-h-0'
          />
          {onCreate && searching && (
            <Button
              variant='underline'
              loading={creating}
              onClick={() => void create()}
              className='min-h-11 shrink-0 sm:min-h-0'
            >
              + create
            </Button>
          )}
        </div>

        {failed ? (
          <CalloutBox tone='error' className='flex items-center gap-2'>
            <Text component='span'>
              <b>tasks unavailable</b>
            </Text>
            <Button
              variant='underline'
              size='xs'
              className='ml-auto'
              onClick={() => {
                void Promise.all([tasksQuery.refetch(), boardsQuery.refetch()]);
              }}
            >
              retry
            </Button>
          </CalloutBox>
        ) : loading ? (
          <div className='grid gap-2 sm:grid-cols-4'>
            {OPEN_STATUSES.map((status) => (
              <SkeletonBlocks key={status} count={3} height={96} />
            ))}
          </div>
        ) : (
          <>
            <PhoneStatusTabs value={phoneStatus} counts={grouped} onChange={setPhoneStatus} />
            {renderPhoneList(grouped[phoneStatus])}

            <BoardRow className='hidden items-start sm:flex'>
              {OPEN_STATUSES.map((status) => (
                <BoardColumn
                  key={status}
                  title={STATUS_LABEL[status]}
                  count={grouped[status].length}
                >
                  <div className='flex min-h-24 flex-col gap-1.5'>
                    {grouped[status].map((candidate) => renderCard(candidate))}
                    {grouped[status].length === 0 && (
                      <BoardEmpty className='flex min-h-24 items-center justify-center'>
                        {searching ? 'no matches' : 'empty'}
                      </BoardEmpty>
                    )}
                  </div>
                </BoardColumn>
              ))}
            </BoardRow>

            <div className='flex items-center gap-4'>
              <Button
                variant='underline'
                size='xs'
                aria-expanded={showDone}
                onClick={() => setShowDone((shown) => !shown)}
              >
                done · {doneTasks.length}
              </Button>
              <Button
                variant='underline'
                size='xs'
                aria-expanded={showArchived}
                onClick={() => setShowArchived((shown) => !shown)}
              >
                archived
              </Button>
            </div>

            {showDone && (
              <section aria-label='done' className='flex flex-col gap-1.5'>
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='group'
                  component='h3'
                  className='font-bold sm:hidden'
                >
                  done · {doneTasks.length}
                </Text>
                {renderPhoneList(doneTasks)}
                {renderDesktopColumn('done', doneTasks)}
              </section>
            )}

            {showArchived && (
              <section aria-label='archived' className='flex flex-col gap-1.5'>
                <Text
                  size='micro'
                  variant='uppercase'
                  tracking='group'
                  component='h3'
                  className='font-bold sm:hidden'
                >
                  archived
                </Text>
                {renderPhoneList(archivedTasks)}
                {renderDesktopColumn('archived', archivedTasks)}
              </section>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
