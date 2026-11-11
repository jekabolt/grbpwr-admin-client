import { useDroppable } from '@dnd-kit/core';
import { cn } from 'lib/utility';
import { type CSSProperties, Fragment, type ReactNode, useMemo, useState } from 'react';
import { Button, Iconoir, QUIET_PRESS, SortCount, Text, useStepScroll } from 'ui';
import { Task, TaskStatus } from '../api/types';
import { COLUMN_LABEL, isOverdue } from '../utils/meta';
import type { DropSlot } from './board-drag';
import { DraggableTile } from './task-tile';

/** A card being moved, as a lane sees it. */
export type HeldCard = { id: number; height: number; gone: boolean };

/** The header's height: the step tiles `<` `>` beside the columns take the same square. */
export const COLUMN_HEAD = 'h-11';

/** One tile's turn in the fold cascade, ms; the cascade never takes longer than `FOLD_TURNS`. */
export const FOLD_TURN_MS = 35;
export const FOLD_TURNS = 8;

/**
 * HOW A COLUMN IS ORDERED (a click on one of the header's counts):
 * `overdue` — the red count: overdue first (the longest overdue on top), then the rest by deadline;
 * `soonest` — the grey total, first click: by deadline, the nearest on top, no deadline last;
 * `latest`  — the grey total, second click: the reverse; a third click is the board's own order.
 * The red count is a switch: on / off.
 */
type ColumnSort = null | 'overdue' | 'soonest' | 'latest';

function sortTasks(tasks: Task[], sort: ColumnSort): Task[] {
  if (!sort) return tasks;
  const time = (t: Task) => {
    const ms = t.task.dueDate ? new Date(t.task.dueDate).getTime() : NaN;
    return Number.isNaN(ms) ? null : ms;
  };
  const late = (t: Task) => (isOverdue(t.task.dueDate, !!t.archivedAt) ? 0 : 1);
  const dir = sort === 'latest' ? -1 : 1;
  return [...tasks].sort((a, b) => {
    if (sort === 'overdue' && late(a) !== late(b)) return late(a) - late(b);
    const x = time(a);
    const y = time(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return (x - y) * dir;
  });
}

/**
 * The room for the held tile: a quiet `cardOn` gap. Every gap between tiles exists while a tile is
 * held, so opening one is a height transition and the neighbours part by themselves (soft ease).
 */
function DropGap({ open, height }: { open: boolean; height: number }) {
  return (
    <div
      aria-hidden
      data-drop-slot={open ? '' : undefined}
      style={{ height: open ? height : 0 }}
      className={cn(
        'shrink-0 bg-cardOn transition-[height,opacity] duration-500 ease-soft motion-reduce:transition-none',
        open ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}

/**
 * ONE STATUS COLUMN of the taskboard: a 44px `fieldFill` header — the column's name in 12px ink,
 * the overdue count in the new red and the total in grey, a grey `+` at the right — and the tiles
 * under it. Hovering the header turns every grey title of the column ink; a click on it opens the
 * status (`onToggle`); a click on a COUNT orders the column (`ColumnSort`). The dnd-kit droppable
 * is the whole column, so a tile can be dropped on the header too.
 */
export function BoardColumn({
  status,
  tasks,
  selected,
  holding,
  onSelect,
  onOpen,
  onHold,
  onAdd,
  onToggle,
  opened,
  folded,
  canWrite,
  filtered,
  held,
  slot,
  style,
  className,
  renderTile,
}: {
  status: TaskStatus;
  tasks: Task[];
  selected: number | null;
  /** The tile being pressed and held. */
  holding: number | null;
  onSelect: (id: number | null) => void;
  onOpen: (task: Task) => void;
  onHold: (id: number | null) => void;
  onAdd: (status: TaskStatus) => void;
  /** The header was pressed: open this status / close it. */
  onToggle: (status: TaskStatus) => void;
  /** This status is opened: wide tiles, no drag. */
  opened: boolean;
  /** Every tile is folded under the header (a status is opening or closing). */
  folded: boolean;
  canWrite: boolean;
  filtered?: boolean;
  held: HeldCard | null;
  /** Set on the lane the held card would land in. */
  slot: DropSlot | null;
  style?: CSSProperties;
  className?: string;
  renderTile: (task: Task, minimal: boolean) => ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const gaps = held?.gone ? held.height : null;
  const [sort, setSort] = useState<ColumnSort>(null);
  const rows = useMemo(() => sortTasks(tasks, sort), [tasks, sort]);
  const { list, at, free } = useStepScroll(rows.length);
  const overdue =
    status === 'TASK_STATUS_DONE'
      ? 0
      : tasks.filter((t) => isOverdue(t.task.dueDate, !!t.archivedAt)).length;
  const turns = Math.min(rows.length, FOLD_TURNS);

  return (
    <section
      ref={setNodeRef}
      data-drop-column={status}
      aria-label={COLUMN_LABEL[status]}
      style={style}
      className={cn('flex min-h-0 min-w-0 shrink-0 flex-col', className)}
    >
      <div
        data-column-head
        className={cn(
          'relative flex shrink-0 items-center gap-2 px-2 text-textBaseSize transition-colors duration-500 ease-soft',
          COLUMN_HEAD,
          slot ? 'bg-cardOn' : 'bg-fieldFill',
        )}
      >
        <Button
          type='button'
          variant='default'
          aria-expanded={opened}
          aria-label={`${opened ? 'close' : 'open'} ${COLUMN_LABEL[status]}`}
          onClick={() => onToggle(status)}
          className={cn('absolute inset-0 cursor-pointer', QUIET_PRESS)}
        >
          <span className='sr-only'>{COLUMN_LABEL[status]}</span>
        </Button>
        <Text component='h2' className='pointer-events-none relative min-w-0 truncate text-ink'>
          {COLUMN_LABEL[status]}
        </Text>
        <span className='flex shrink-0 gap-1'>
          {overdue > 0 && (
            <SortCount
              tone='alert'
              count={overdue}
              state={sort === 'overdue' ? 'on' : null}
              label={`${overdue} overdue — sort`}
              title='overdue first'
              onClick={() => setSort((s) => (s === 'overdue' ? null : 'overdue'))}
            />
          )}
          <SortCount
            count={tasks.length}
            state={sort === 'soonest' ? 'asc' : sort === 'latest' ? 'desc' : null}
            label={`${tasks.length} tasks — sort by deadline`}
            title={
              sort === 'soonest'
                ? 'latest first'
                : sort === 'latest'
                  ? 'board order'
                  : 'by deadline'
            }
            onClick={() =>
              setSort((s) => (s === 'soonest' ? 'latest' : s === 'latest' ? null : 'soonest'))
            }
          />
        </span>
        {canWrite && !opened && (
          <Button
            type='button'
            variant='default'
            aria-label={`new task in ${COLUMN_LABEL[status]}`}
            title='new task'
            onClick={() => onAdd(status)}
            className={cn(
              'relative ml-auto grid size-6 shrink-0 cursor-pointer place-items-center text-placeholder transition-colors duration-500 ease-soft hover:text-ink press:text-ink',
              QUIET_PRESS,
            )}
          >
            <Iconoir name='plus' strokeWidth={1.6} className='size-3' />
          </Button>
        )}
      </div>

      <div
        ref={list}
        tabIndex={-1}
        className={cn(
          'flex min-h-24 flex-1 flex-col px-1 pt-2 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          free ? 'overflow-y-auto overscroll-contain scroll-smooth' : 'overflow-hidden',
          opened && 'pt-4',
        )}
      >
        {rows.map((t, i) => (
          <Fragment key={t.id}>
            {gaps != null && <DropGap open={slot?.before === t.id} height={gaps} />}
            <DraggableTile
              task={t}
              selected={selected === t.id}
              onSelect={onSelect}
              onOpen={onOpen}
              onHold={onHold}
              disabled={!canWrite}
              noDrag={opened}
              minimal={i < at}
              folded={folded}
              // Folding runs bottom → top, unfolding top → bottom.
              order={(folded ? Math.max(0, turns - 1 - i) : Math.min(i, turns)) * FOLD_TURN_MS}
              held={t.id === held?.id ? (held.gone ? 'gone' : 'hold') : undefined}
              tile={(minimal) => renderTile(t, minimal && holding !== t.id)}
            />
          </Fragment>
        ))}
        {gaps != null && <DropGap open={!!slot && slot.before === null} height={gaps} />}

        {tasks.length === 0 && !slot && !folded && (
          <Text className='px-2 py-6 text-placeholder'>{filtered ? 'No matches' : 'Empty'}</Text>
        )}
      </div>
    </section>
  );
}
