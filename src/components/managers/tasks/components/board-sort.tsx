import { differenceInCalendarDays } from 'date-fns';
import type { ComponentProps } from 'react';
import { CascadeList, FilterFaces, FilterItem, FilterRow } from 'ui';
import type { Task, TaskBoardEntry, TaskPriority } from '../api/types';
import { HOT_DAYS, NEAR_DAYS, PRIORITIES, PRIORITY_TITLE } from '../utils/meta';
import { DepartmentList } from './department-list';

export type SortKey = 'department' | 'deadline' | 'priority' | 'assignees';
export type DeadlineFilter = '' | 'overdue' | 'soon' | 'week' | 'none';

const ANY = 'any';
const UNASSIGNED = '\u0000';

const DEADLINE_LABEL: Record<DeadlineFilter, string> = {
  '': 'Any',
  overdue: 'Overdue',
  soon: '2 Days',
  week: 'Week',
  none: 'No Deadline',
};
const DEADLINES: DeadlineFilter[] = ['', 'overdue', 'soon', 'week', 'none'];

/** The board's deadline narrowing (open tasks only: a settled one is never late). */
export function matchesDeadline(task: Task, filter: DeadlineFilter): boolean {
  if (!filter) return true;
  const raw = task.task.dueDate;
  const date = raw ? new Date(raw) : null;
  const valid = date && !Number.isNaN(date.getTime()) ? date : null;
  if (filter === 'none') return !valid;
  if (!valid || task.status === 'TASK_STATUS_DONE' || task.archivedAt) return false;
  const days = differenceInCalendarDays(valid, new Date());
  if (filter === 'overdue') return days < 0;
  return days >= 0 && days <= (filter === 'soon' ? HOT_DAYS : NEAR_DAYS);
}

export type BoardSortState = {
  boards: TaskBoardEntry[];
  /** 0 = every department. */
  board: number;
  closed: boolean;
  deadline: DeadlineFilter;
  priority: TaskPriority | '';
  /** `undefined` = everybody, `''` = nobody took it. */
  assignee: string | undefined;
  people: { name: string; count: number }[];
};

type Tools = Pick<
  ComponentProps<typeof DepartmentList>,
  | 'writable'
  | 'onAdd'
  | 'onReorder'
  | 'renaming'
  | 'onRenamingChange'
  | 'onRename'
  | 'renameBusy'
  | 'onDelete'
>;

/** The room the open list needs under the title row, px (`FilterRow.room`). */
export function boardSortRoom(state: BoardSortState, open: SortKey | null, writable: boolean) {
  if (!open) return 0;
  return FilterRow.room(
    open === 'department'
      ? state.boards.length + 2 + (writable ? 1.4 : 0)
      : open === 'deadline'
        ? DEADLINES.length
        : open === 'priority'
          ? PRIORITIES.length + 1
          : state.people.length + 1,
  );
}

/**
 * THE BOARD'S SORT, at the right end of the title row — a `FilterRow`:
 * `Department: [ Any ]  Deadline: [ Any ]  Priority: [ All ]  [ Assignees ]` and the faces.
 * The Department list carries the board tools (rename, delete, reorder, add).
 */
export function BoardSort({
  state,
  open,
  onOpen,
  onBoard,
  onClosed,
  tools,
  onDeadline,
  onPriority,
  onAssignee,
}: {
  state: BoardSortState;
  open: SortKey | null;
  onOpen: (key: SortKey | null) => void;
  onBoard: (id: number) => void;
  onClosed: () => void;
  /** The board tools on the Department rows: add, rename, delete, reorder. */
  tools: Tools;
  onDeadline: (next: DeadlineFilter) => void;
  onPriority: (next: TaskPriority | '') => void;
  onAssignee: (next: string | undefined) => void;
}) {
  const done = (fn: () => void) => {
    fn();
    onOpen(null);
  };
  const department = state.closed
    ? 'Closed'
    : state.boards.find((b) => b.id === state.board)?.name ?? 'Any';
  const who =
    state.assignee === undefined
      ? 'Assignees'
      : state.assignee === ''
        ? 'Unassigned'
        : state.assignee;
  return (
    <FilterRow open={open} onOpenChange={(id) => onOpen(id as SortKey | null)}>
      <FilterItem id='department' label='Department' value={department}>
        <DepartmentList
          open={open === 'department'}
          boards={state.boards}
          board={state.board}
          closed={state.closed}
          onBoard={(id) => done(() => onBoard(id))}
          onClosed={() => done(onClosed)}
          {...tools}
        />
      </FilterItem>
      <FilterItem id='deadline' label='Deadline' value={DEADLINE_LABEL[state.deadline]}>
        <CascadeList
          label='deadline'
          size='compact'
          open={open === 'deadline'}
          options={DEADLINES.map((d) => ({ value: d || ANY, label: DEADLINE_LABEL[d] }))}
          value={state.deadline || ANY}
          onChange={(v) => done(() => onDeadline(v === ANY ? '' : (v as DeadlineFilter)))}
        />
      </FilterItem>
      <FilterItem
        id='priority'
        label='Priority'
        value={state.priority ? PRIORITY_TITLE[state.priority] : 'All'}
      >
        <CascadeList
          label='priority'
          size='compact'
          open={open === 'priority'}
          options={[
            { value: ANY, label: 'All' },
            ...PRIORITIES.map((p) => ({ value: p as string, label: PRIORITY_TITLE[p] })),
          ]}
          value={state.priority || ANY}
          onChange={(v) => done(() => onPriority(v === ANY ? '' : (v as TaskPriority)))}
        />
      </FilterItem>
      <FilterItem
        id='assignees'
        value={who}
        after={
          <FilterFaces
            id='assignees'
            names={state.people.map((p) => p.name)}
            value={state.assignee || undefined}
            onChange={(next) => done(() => onAssignee(next))}
          />
        }
      >
        <CascadeList
          label='assignees'
          size='compact'
          open={open === 'assignees'}
          options={[
            { value: ANY, label: 'Everybody' },
            ...state.people.map((p) => ({
              value: p.name || UNASSIGNED,
              label: p.name || 'Unassigned',
            })),
          ]}
          value={state.assignee === undefined ? ANY : state.assignee || UNASSIGNED}
          onChange={(v) =>
            done(() => onAssignee(v === ANY ? undefined : v === UNASSIGNED ? '' : v))
          }
        />
      </FilterItem>
    </FilterRow>
  );
}
