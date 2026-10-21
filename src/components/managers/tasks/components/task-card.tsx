import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'lib/utility';
import { Chip, ClockIcon, Media, Pill, Select, Text } from 'ui';
import { Task, TaskPriority, TaskStatus } from '../api/types';
import { dueMeta, PRIORITY_LABEL, STATUS_LABEL, STATUSES, toOptions } from '../utils/meta';
import { openBlockers } from '../utils/relations';
import { AvatarStack } from './avatar-stack';

/**
 * (v4 notes, kept for PriorityTag — the card itself is v5, see TaskCardBody.)
 * tskCard v4 — the title leads. The first attached media (resolved by the list read)
 * becomes one compact square beside it; a card with no media keeps the text column full width.
 *
 * Priority stops being a bespoke hue map: urgent fills ink (Chip), high is an ink
 * outline, everything lower is a quiet grey Pill — weight carries urgency, no health
 * colours borrowed. Assignees are an overlapping `AvatarStack`; labels are read-only Pills on
 * desktop and yield to operational metadata on a phone.
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
const SLOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const SLOW_STATUSES: TaskStatus[] = [
  'TASK_STATUS_TODO',
  'TASK_STATUS_IN_PROGRESS',
  'TASK_STATUS_REVIEW',
];

function slowDaysInColumn(task: Task): number | null {
  if (!SLOW_STATUSES.includes(task.status)) return null;
  const statusSince = Date.parse(task.statusSince);
  if (!Number.isFinite(statusSince)) return null;
  const days = Math.floor((Date.now() - statusSince) / DAY_MS);
  return days >= SLOW_DAYS ? days : null;
}

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
    <div className='shrink-0 sm:hidden' onPointerDown={stop} onKeyDown={stop} onClick={stop}>
      <Select
        name={`status-${task.id}`}
        placeholder='status'
        value={task.status}
        items={STATUS_OPTIONS}
        fullWidth
        itemClassName='min-h-11 sm:min-h-6 data-[state=checked]:bg-bgSecondary data-[state=checked]:font-bold'
        onValueChange={(v: string) => onMove(task, v as TaskStatus)}
        className='min-h-11 min-w-32 sm:min-h-5.5 sm:min-w-0'
      />
    </div>
  );
}

// Presentational card body — reused by the sortable card and the drag overlay.
// tskCard v5 «picture» (owner pick 19.10): photo, title, one row — priority mark + due on the
// left, people (and the phone's status select) on the right. Checklist, files and labels live
// on the task page only.
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
  const isArchived = !!task.archivedAt;
  const slowDays = slowDaysInColumn(task);
  // Заархивированный блокер считается ОТКРЫТЫМ, пока не done (довод — в `utils/relations.ts`).
  const blockers = openBlockers(task.relations);
  const urgent = t.priority === 'TASK_PRIORITY_URGENT';
  const high = t.priority === 'TASK_PRIORITY_HIGH';

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
          <Media src={coverUrl} alt='' aspectRatio='4/3' fit='cover' />
        </div>
      )}

      <div className='flex flex-col gap-2 p-2.5'>
        <Text className='line-clamp-2 break-words font-bold leading-snug'>{t.title}</Text>

        <div className='flex min-h-11 items-center justify-between gap-2 sm:min-h-0'>
          <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
            {/* Приоритет — знак, а не слово: заливка = urgent, контур = high, ниже — ничего. */}
            {(urgent || high) && (
              <span
                role='img'
                aria-label={PRIORITY_LABEL[t.priority]}
                title={PRIORITY_LABEL[t.priority]}
                className={cn('size-2 shrink-0 border border-textColor', urgent && 'bg-textColor')}
              />
            )}
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
            {slowDays !== null && (
              <Text
                size='micro'
                variant='label'
                component='span'
                aria-label={`in column ${slowDays} days`}
                title={`${slowDays} days in this column`}
                className='flex shrink-0 items-center gap-1 tabular-nums'
              >
                <ClockIcon aria-hidden='true' className='size-3' />
                {slowDays}d
              </Text>
            )}
            {isArchived && <Pill tone='ink'>archived</Pill>}
            {/* `warn` = «сломано / мешает / блокирует» по словарю тонов самого примитива. */}
            {blockers.length > 0 && (
              <Pill tone='warn' title={blockers.map((b) => b.title || `#${b.taskId}`).join(', ')}>
                blocked · {blockers.length}
              </Pill>
            )}
          </span>
          <span className='flex shrink-0 items-center gap-2'>
            <AvatarStack names={t.assignees} />
            {onMove && <StatusSelect task={task} onMove={onMove} />}
          </span>
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
