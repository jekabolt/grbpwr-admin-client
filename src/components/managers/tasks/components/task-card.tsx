import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { Task, TaskPriority } from '../api/types';
import { PRIORITY_LABEL, dueMeta } from '../utils/meta';

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  TASK_PRIORITY_URGENT: 'bg-textColor text-bgColor',
  TASK_PRIORITY_HIGH: 'border border-textColor text-textColor',
  TASK_PRIORITY_MEDIUM: 'border border-textInactiveColor text-labelColor',
  TASK_PRIORITY_LOW: 'text-labelColor',
  TASK_PRIORITY_UNKNOWN: 'hidden',
};

function initials(username: string) {
  // Keep letters/digits across scripts (Cyrillic usernames included).
  return username.replace(/\s+/g, '').slice(0, 2).toUpperCase() || '?';
}

// Presentational card body — reused by the sortable card and the drag overlay.
export function TaskCardBody({ task, dragging }: { task: Task; dragging?: boolean }) {
  const t = task.task;
  const due = dueMeta(t.dueDate);
  const linkCount =
    [t.techCardId, t.productId, t.archiveId].filter((v) => v > 0).length + (t.orderUuid ? 1 : 0);
  const meta: string[] = [];
  if (linkCount) meta.push(`${linkCount} link${linkCount > 1 ? 's' : ''}`);
  if (t.mediaIds.length) meta.push(`${t.mediaIds.length} file${t.mediaIds.length > 1 ? 's' : ''}`);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 border bg-bgColor p-3 transition-[border-color,transform,box-shadow] duration-150',
        dragging
          ? 'border-textColor shadow-[4px_4px_0_0_var(--text)]'
          : 'border-textInactiveColor hover:-translate-y-0.5 hover:border-textColor hover:shadow-[2px_2px_0_0_var(--text)] motion-reduce:hover:translate-y-0',
      )}
    >
      {t.labels.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          {t.labels.map((l) => (
            <span
              key={l}
              className='border border-textInactiveColor px-1.5 py-px text-[10px] uppercase leading-4 text-labelColor'
            >
              {l}
            </span>
          ))}
        </div>
      )}

      <Text className='text-textBaseSize leading-snug'>{t.title}</Text>

      <div className='flex items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          {t.priority !== 'TASK_PRIORITY_UNKNOWN' && (
            <span
              className={cn(
                'shrink-0 px-1.5 py-px text-[10px] uppercase leading-4',
                PRIORITY_STYLE[t.priority],
              )}
            >
              {PRIORITY_LABEL[t.priority]}
            </span>
          )}
          {due.state !== 'none' && (
            <span
              className={cn(
                'shrink-0 text-[10px] uppercase',
                due.state === 'overdue'
                  ? 'text-error'
                  : due.state === 'today' || due.state === 'soon'
                    ? 'text-textColor'
                    : 'text-labelColor',
              )}
            >
              {due.label}
            </span>
          )}
        </div>

        {t.assignee ? (
          <span
            title={t.assignee}
            className='flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-textColor text-[10px] leading-none text-bgColor'
          >
            {initials(t.assignee)}
          </span>
        ) : (
          <span
            title='unassigned'
            className='h-5 w-5 shrink-0 rounded-full border border-dashed border-textInactiveColor'
          />
        )}
      </div>

      {meta.length > 0 && (
        <div className='text-[10px] uppercase text-labelColor'>{meta.join(' · ')}</div>
      )}
    </div>
  );
}

// Draggable + clickable card inside a column.
export function SortableTaskCard({
  task,
  onOpen,
  disabled,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  disabled?: boolean;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: task.id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      aria-label={`Open task: ${task.task.title}`}
      className={cn(
        'rounded-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        disabled ? 'cursor-pointer' : 'touch-none cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <TaskCardBody task={task} />
    </div>
  );
}
