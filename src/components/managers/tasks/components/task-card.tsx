import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'lib/utility';
import { Chip, Media, Pill, Select, Text } from 'ui';
import { Task, TaskPriority, TaskStatus } from '../api/types';
import { taskLinkCount } from '../utils/links';
import { dueMeta, PRIORITY_LABEL, STATUS_LABEL, STATUSES, toOptions } from '../utils/meta';
import { openBlockers } from '../utils/relations';
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

const STATUS_OPTIONS = toOptions(STATUSES, STATUS_LABEL);

/**
 * СТАТУС С КАРТОЧКИ — путь переезда без драга (на телефоне драга нет вовсе). Обёртка глушит
 * pointerdown/keydown/click: иначе нажатие на select поднимало бы карточку (PointerSensor /
 * KeyboardSensor слушают узел карточки) и открывало бы задачу. Список Radix порталится, но
 * React-события из портала всплывают по дереву компонентов — через эту же обёртку.
 */
function StatusSelect({
  task,
  onMove,
}: {
  task: Task;
  onMove: (task: Task, status: TaskStatus) => void;
}) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className='shrink-0' onPointerDown={stop} onKeyDown={stop} onClick={stop}>
      <Select
        name={`status-${task.id}`}
        placeholder='status'
        value={task.status}
        items={STATUS_OPTIONS}
        onValueChange={(v: string) => onMove(task, v as TaskStatus)}
        className='min-h-11 w-auto sm:min-h-5.5'
      />
    </div>
  );
}

// Presentational card body — reused by the sortable card and the drag overlay.
export function TaskCardBody({
  task,
  dragging,
  onMove,
}: {
  task: Task;
  dragging?: boolean;
  /** Set = the card carries a status select in its footer. */
  onMove?: (task: Task, status: TaskStatus) => void;
}) {
  const t = task.task;
  // Решённая карточка не краснеет: done и архив показывают срок нейтральной датой.
  const due = dueMeta(t.dueDate, task.status === 'TASK_STATUS_DONE' || !!task.archivedAt);
  const cover = task.media[0];
  const coverUrl = cover?.thumbnail || cover?.fullSize;
  const linkCount = taskLinkCount(t);
  const checkTotal = task.checklist.length;
  const checkDone = task.checklist.filter((c) => c.isDone).length;
  const isArchived = !!task.archivedAt;
  // Заархивированный блокер считается ОТКРЫТЫМ, пока не done (довод — в `utils/relations.ts`).
  const blockers = openBlockers(task.relations);

  const meta: string[] = [];
  if (checkTotal) meta.push(`✓ ${checkDone}/${checkTotal}`);
  // Свёртку сабтасок считает СЕРВЕР (`subtask_total`/`subtask_done`): доска не читает детей и
  // не имеет права их пересчитывать — на списке их просто нет.
  if (task.subtaskTotal) meta.push(`⊞ ${task.subtaskDone}/${task.subtaskTotal}`);
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
        <div className='border-b border-borderColor'>
          <Media src={coverUrl} alt='' aspectRatio='16/10' />
        </div>
      )}

      <div className='flex flex-col gap-1.5 p-2'>
        {(isArchived || blockers.length > 0 || t.labels.length > 0) && (
          <div className='flex flex-wrap gap-1'>
            {isArchived && <Pill tone='ink'>archived</Pill>}
            {/* `warn` = «сломано / мешает / блокирует» по словарю тонов самого примитива.
                Число, а не голое слово: «blocked · 2» говорит, сколько ещё ждать. */}
            {blockers.length > 0 && (
              <Pill tone='warn' title={blockers.map((b) => b.title || `#${b.taskId}`).join(', ')}>
                blocked · {blockers.length}
              </Pill>
            )}
            {t.labels.map((l) => (
              <Pill key={l} tone='mut'>
                {l}
              </Pill>
            ))}
          </div>
        )}

        <Text className='leading-snug'>{t.title}</Text>

        {(t.priority !== 'TASK_PRIORITY_UNKNOWN' || due.state !== 'none') && (
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
        )}

        {meta.length > 0 && (
          <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
            {meta.join(' · ')}
          </Text>
        )}

        <div className='flex items-center justify-between gap-2'>
          <AvatarStack names={t.assignees} />
          {onMove && <StatusSelect task={task} onMove={onMove} />}
        </div>
      </div>
    </div>
  );
}

// Draggable (mouse / keyboard) + clickable card inside a column. Touch never drags, so the
// card carries no `touch-none`: a finger that lands on it scrolls the page.
export function SortableTask({
  task,
  onOpen,
  onMove,
  disabled,
}: {
  task: Task;
  onOpen: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
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
        disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <TaskCardBody task={task} onMove={disabled ? undefined : onMove} />
    </div>
  );
}
