import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from 'lib/utility';
import { AddDoor, BoardColumn as BoardLane, BoardEmpty } from 'ui';
import { Task, TaskStatus } from '../api/types';
import { STATUS_LABEL } from '../utils/meta';
import { SortableTask } from './task-card';

// tskBoard v2 — one status lane on the ui `BoardColumn` shell. The dnd-kit droppable lives on
// the lane's body (the shell does not forward a ref), and `isOver` drives the shell's own ring.
// Below sm the lane is the only one on screen and takes the full width.
export function BoardColumn({
  status,
  tasks,
  onOpen,
  onAdd,
  onMove,
  canWrite,
  filtered,
  className,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  canWrite: boolean;
  filtered?: boolean;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <BoardLane
      title={STATUS_LABEL[status]}
      count={tasks.length}
      isDropTarget={isOver}
      className={cn(
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
      <div ref={setNodeRef} className='flex min-h-24 flex-1 flex-col gap-1.5'>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableTask
              key={t.id}
              task={t}
              onOpen={onOpen}
              onMove={onMove}
              disabled={!canWrite}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 &&
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
