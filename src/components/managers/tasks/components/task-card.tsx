import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'lib/utility';
import { Chip } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Task, TaskPriority } from '../api/types';
import { taskLinkCount } from '../utils/links';
import { dueMeta, PRIORITY_LABEL } from '../utils/meta';
import { AvatarStack } from './avatar-stack';

/**
 * tskCard v3 — a card leads with its PICTURE. The first attached media (resolved by
 * the list read) becomes a cover band; a card with no media shows no band rather
 * than a forced placeholder, so a wall of cards reads as "these three have refs".
 *
 * Priority stops being a bespoke hue map: urgent fills ink (Chip), high is an ink
 * outline, everything lower is a quiet grey Pill — weight carries urgency, no health
 * colours borrowed. Assignees are an overlapping `AvatarStack`; labels are read-only Pills.
 */

// tskPriority — weight over hue. Urgent is the only filled tag; nothing here spends a
// health colour (red/green/blue) on what is really an importance rank.
export function PriorityTag({ priority }: { priority: TaskPriority }) {
  if (priority === 'TASK_PRIORITY_UNKNOWN') return null;
  const label = PRIORITY_LABEL[priority];
  if (priority === 'TASK_PRIORITY_URGENT') return <Chip selected>{label}</Chip>;
  if (priority === 'TASK_PRIORITY_HIGH') return <Pill tone='ink'>{label}</Pill>;
  return <Pill tone='mut'>{label}</Pill>;
}

// Presentational card body — reused by the sortable card and the drag overlay.
export function TaskCardBody({ task, dragging }: { task: Task; dragging?: boolean }) {
  const t = task.task;
  // Решённая карточка не краснеет: done и архив показывают срок нейтральной датой.
  const due = dueMeta(t.dueDate, task.status === 'TASK_STATUS_DONE' || !!task.archivedAt);
  const cover = task.media[0];
  const coverUrl = cover?.thumbnail || cover?.fullSize;
  const linkCount = taskLinkCount(t);
  const checkTotal = task.checklist.length;
  const checkDone = task.checklist.filter((c) => c.isDone).length;
  const isArchived = !!task.archivedAt;

  const meta: string[] = [];
  if (checkTotal) meta.push(`✓ ${checkDone}/${checkTotal}`);
  if (linkCount) meta.push(`${linkCount} link${linkCount > 1 ? 's' : ''}`);
  if (t.mediaIds.length) meta.push(`${t.mediaIds.length} file${t.mediaIds.length > 1 ? 's' : ''}`);

  return (
    <div
      className={cn(
        'flex flex-col border bg-bgColor transition-[border-color,transform] duration-150',
        dragging
          ? 'border-textColor'
          : 'border-borderColor hover:-translate-y-0.5 hover:border-textColor motion-reduce:hover:translate-y-0',
        isArchived && 'opacity-60',
      )}
    >
      {coverUrl && (
        <img
          src={coverUrl}
          alt=''
          className='block aspect-[16/10] w-full border-b border-borderColor object-cover'
        />
      )}

      <div className='flex flex-col gap-1.5 p-2'>
        {(isArchived || t.labels.length > 0) && (
          <div className='flex flex-wrap gap-1'>
            {isArchived && <Pill tone='ink'>archived</Pill>}
            {t.labels.map((l) => (
              <Pill key={l} tone='mut'>
                {l}
              </Pill>
            ))}
          </div>
        )}

        <Text className='leading-snug'>{t.title}</Text>

        <div className='flex items-center justify-between gap-2'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <PriorityTag priority={t.priority} />
            {due.state !== 'none' && (
              <Text
                size='micro'
                component='span'
                className={cn(
                  'shrink-0 uppercase tracking-label',
                  due.state === 'overdue'
                    ? 'text-error'
                    : due.state === 'today' || due.state === 'soon'
                      ? 'text-textColor'
                      : 'text-labelColor',
                )}
              >
                {due.label}
              </Text>
            )}
          </div>
          <AvatarStack names={t.assignees} />
        </div>

        {meta.length > 0 && (
          <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
            {meta.join(' · ')}
          </Text>
        )}
      </div>
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
        'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
        disabled ? 'cursor-pointer' : 'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <TaskCardBody task={task} />
    </div>
  );
}
