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
      <div className='flex min-w-0 items-start gap-2.5 p-2.5'>
        <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
          <Text className='break-words font-bold leading-snug'>{t.title}</Text>

          {(isArchived ||
            blockers.length > 0 ||
            t.labels.length > 0 ||
            t.priority !== 'TASK_PRIORITY_UNKNOWN' ||
            due.state !== 'none' ||
            meta.length > 0) && (
            <div className='flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1'>
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
              {isArchived && <Pill tone='ink'>archived</Pill>}
              {/* `warn` = «сломано / мешает / блокирует» по словарю тонов самого примитива.
                Число, а не голое слово: «blocked · 2» говорит, сколько ещё ждать. */}
              {blockers.length > 0 && (
                <Pill tone='warn' title={blockers.map((b) => b.title || `#${b.taskId}`).join(', ')}>
                  blocked · {blockers.length}
                </Pill>
              )}
              {meta.length > 0 && (
                <Text
                  size='nano'
                  variant='label'
                  tracking='label'
                  component='span'
                  className='uppercase'
                >
                  {meta.join(' · ')}
                </Text>
              )}
              <span className='hidden flex-wrap items-center gap-1 sm:flex'>
                {t.labels.map((label) => (
                  <Pill key={label} tone='mut'>
                    {label}
                  </Pill>
                ))}
              </span>
            </div>
          )}
        </div>

        {coverUrl && (
          <div className='h-13 w-13 shrink-0 overflow-hidden border border-borderColor'>
            <Media src={coverUrl} alt='' aspectRatio='1/1' fit='cover' />
          </div>
        )}
      </div>

      <div className='flex min-h-11 items-center justify-between gap-2 border-t border-hairline pl-2.5 sm:min-h-0 sm:px-2.5 sm:py-1.5'>
        <AvatarStack names={t.assignees} />
        {onMove && <StatusSelect task={task} onMove={onMove} />}
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
