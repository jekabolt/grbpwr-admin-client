import { useDroppable } from '@dnd-kit/core';
import { cn } from 'lib/utility';
import { Fragment } from 'react';
import { AddDoor, BoardColumn as BoardLane, BoardEmpty } from 'ui';
import { Task, TaskStatus } from '../api/types';
import { STATUS_LABEL } from '../utils/meta';
import type { DropSlot } from './board-drag';
import { DraggableTask } from './task-card';

/** A card being moved, as a lane sees it. */
export type HeldCard = { id: number; height: number; gone: boolean };

/**
 * The room for the held card. Every gap between cards exists while a card is held, so opening and
 * closing one is a height transition and the neighbours part by themselves. A closed gap has no
 * height and cancels the lane's 6px flex gap.
 */
function DropGap({ open, height }: { open: boolean; height: number }) {
  return (
    <div
      aria-hidden
      data-drop-slot={open ? '' : undefined}
      style={{ height: open ? height : 0 }}
      className={cn(
        'shrink-0 overflow-hidden transition-[height,margin,opacity] duration-150 ease-out motion-reduce:transition-none',
        open ? 'opacity-100' : '-mt-1.5 opacity-0',
      )}
    >
      <div className='h-full border border-dashed border-textColor bg-bgColor' />
    </div>
  );
}

// tskBoard v2 — one status lane on the ui `BoardColumn` shell. The dnd-kit droppable lives on
// the lane's body (the shell does not forward a ref); the shell's ring follows the drop slot.
// Below sm the lane is the only one on screen and takes the full width.
export function BoardColumn({
  status,
  tasks,
  onOpen,
  onAdd,
  onMove,
  canWrite,
  filtered,
  held,
  slot,
  className,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  canWrite: boolean;
  filtered?: boolean;
  held: HeldCard | null;
  /** Set on the lane the held card would land in. */
  slot: DropSlot | null;
  className?: string;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const gaps = held?.gone ? held.height : null;

  return (
    <BoardLane
      title={STATUS_LABEL[status]}
      count={tasks.length}
      isDropTarget={!!slot}
      className={cn(
        'transition-shadow duration-150 motion-reduce:transition-none',
        'max-sm:w-full max-sm:max-w-none max-sm:border-0 max-sm:bg-transparent max-sm:[&>div:first-child]:hidden max-sm:[&>div:last-child]:bg-transparent max-sm:[&>div:last-child]:p-0',
        className,
      )}
      action={
        canWrite && (
          <AddDoor
            shape='inline'
            onClick={() => onAdd(status)}
            aria-label={`add task to ${STATUS_LABEL[status]}`}
            className='hidden sm:flex'
          >
            task
          </AddDoor>
        )
      }
    >
      <div
        ref={setNodeRef}
        data-drop-column={status}
        className='flex min-h-24 flex-1 flex-col gap-1.5'
      >
        {tasks.map((t) => (
          <Fragment key={t.id}>
            {gaps != null && <DropGap open={slot?.before === t.id} height={gaps} />}
            <DraggableTask
              task={t}
              onOpen={onOpen}
              onMove={onMove}
              disabled={!canWrite}
              held={t.id === held?.id ? (held.gone ? 'gone' : 'hold') : undefined}
            />
          </Fragment>
        ))}
        {gaps != null && <DropGap open={!!slot && slot.before === null} height={gaps} />}

        {tasks.length === 0 &&
          !slot &&
          (filtered ? (
            <BoardEmpty className='flex flex-1 items-center justify-center'>no matches</BoardEmpty>
          ) : canWrite ? (
            <>
              <BoardEmpty className='flex flex-1 items-center justify-center sm:hidden'>
                empty
              </BoardEmpty>
              <AddDoor
                className='hidden flex-1 justify-center sm:flex'
                onClick={() => onAdd(status)}
              >
                task
              </AddDoor>
            </>
          ) : (
            <BoardEmpty className='flex flex-1 items-center justify-center'>empty</BoardEmpty>
          ))}
      </div>
    </BoardLane>
  );
}
