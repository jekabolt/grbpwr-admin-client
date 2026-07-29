import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { Task, TaskStatus } from '../api/types';
import { STATUS_LABEL } from '../utils/meta';
import { SortableTaskCard } from './task-card';

// tskBoard v1 (KEEP) — the five status columns and their cross-column drag stay put;
// this file only trades the off-system greys (bg-black/[0.0x], text-[11px]) for the
// design tokens. A column is a drop target: idle it is a faint zebra fill, hot it
// tints bgSecondary and rings ink.
export function BoardColumn({
  status,
  tasks,
  onOpen,
  onAdd,
  canWrite,
  filtered,
}: {
  status: TaskStatus;
  tasks: Task[];
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
  canWrite: boolean;
  filtered?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section className='flex w-[85vw] shrink-0 snap-start flex-col sm:w-72'>
      <header className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-borderColor bg-bgColor pb-1.5'>
        <div className='flex items-baseline gap-1.5'>
          <Text size='micro' variant='label' tracking='group' component='span' className='font-bold uppercase'>
            {STATUS_LABEL[status]}
          </Text>
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {tasks.length}
          </Text>
        </div>
        {canWrite && (
          <button
            type='button'
            onClick={() => onAdd(status)}
            aria-label={`add task to ${STATUS_LABEL[status]}`}
            className='px-1 text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            +
          </button>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          'mt-2 flex min-h-24 flex-1 flex-col gap-2 p-1 transition-colors',
          isOver ? 'bg-bgSecondary ring-2 ring-inset ring-textColor' : 'bg-bgZebra',
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => (
            <SortableTaskCard key={t.id} task={t} onOpen={onOpen} disabled={!canWrite} />
          ))}
        </SortableContext>

        {tasks.length === 0 &&
          (filtered ? (
            <div className='flex flex-1 items-center justify-center py-6'>
              <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
                no matches
              </Text>
            </div>
          ) : canWrite ? (
            <button
              type='button'
              onClick={() => onAdd(status)}
              className='flex flex-1 items-center justify-center border border-dashed border-borderColor py-6 text-micro uppercase tracking-label text-labelColor transition-colors hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              + add task
            </button>
          ) : (
            <div className='flex flex-1 items-center justify-center py-6'>
              <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
                empty
              </Text>
            </div>
          ))}
      </div>
    </section>
  );
}
