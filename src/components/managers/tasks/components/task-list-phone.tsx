import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import {
  AvatarPicker,
  BoardEmpty,
  Button,
  Chip,
  ChipRow,
  Close,
  FoldCaret,
  Input,
  Pill,
  Text,
} from 'ui';
import { Task, TaskBoard, TaskStatus } from '../api/types';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  BOARD_LABEL,
  BOARDS,
  dueMeta,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
} from '../utils/meta';
import { openBlockers } from '../utils/relations';
import { AvatarStack } from './avatar-stack';
import { applyFilters, setFilter, TaskFilters } from './filters-bar';
import { PriorityTag } from './task-card';
import { OptionRow, PickerSheet } from './task-form-shell';

/**
 * ТЕЛЕФОН (< sm): СПИСОК ВМЕСТО КАНБАНА (макет 19.10, owner OK).
 *
 * Колонки становятся группами по статусу одна под другой; done свёрнут. Наверху — доска с числом
 * (шторка со всеми досками), поиск, «mine», статус и шторка остальных фильтров; снизу — быстрое
 * добавление в «to do» текущей доски. Десктоп (≥ sm) не трогается: там остаётся доска.
 *
 * Статус и поиск — ТОЛЬКО телефонные сужения: на доске статус и так есть колонка, а поиск по
 * шести карточкам колонки не окупал бы места (довод — в `filters-bar.tsx`).
 */

/** Below Tailwind `sm` (640px) — the same edge the board's phone classes already use. */
export const LIST_PHONE_QUERY = '(max-width: 639px)';
export const useListPhone = () => useMediaQuery(LIST_PHONE_QUERY);

/** «open» = everything but done; «all»; or exactly one status. */
export type PhoneStatus = 'open' | 'all' | TaskStatus;

/** Group order on the phone: what is moving first, done last. */
export const GROUP_ORDER: TaskStatus[] = [
  'TASK_STATUS_IN_PROGRESS',
  'TASK_STATUS_REVIEW',
  'TASK_STATUS_TODO',
  'TASK_STATUS_BACKLOG',
  'TASK_STATUS_DONE',
];

const STATUS_CHOICES: PhoneStatus[] = ['open', 'all', ...GROUP_ORDER];

export function phoneStatusLabel(s: PhoneStatus): string {
  return s === 'open' || s === 'all' ? s : STATUS_LABEL[s];
}

export function readPhoneStatus(raw: string | null): PhoneStatus {
  if (raw === 'open' || raw === 'all') return raw;
  if (raw && (GROUP_ORDER as string[]).includes(raw)) return raw as TaskStatus;
  return 'open';
}

export function matchStatus(t: Task, s: PhoneStatus): boolean {
  if (s === 'all') return true;
  if (s === 'open') return t.status !== 'TASK_STATUS_DONE';
  return t.status === s;
}

/** Search by title, label and number (`482` or `#482`). */
export function matchQuery(t: Task, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const num = q.replace(/^#/, '');
  if (/^\d+$/.test(num) && String(t.id).includes(num)) return true;
  if (t.task.title.toLowerCase().includes(q)) return true;
  return t.task.labels.some((l) => l.toLowerCase().includes(num));
}

// ---- top bar --------------------------------------------------------------------------------

const BAR_TEXT = 'uppercase tracking-label';

export function BoardSwitch({
  board,
  counts,
  onChange,
}: {
  board: TaskBoard;
  counts: Map<TaskBoard, number>;
  onChange: (board: TaskBoard) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PickerSheet
      phone
      open={open}
      onOpenChange={setOpen}
      title='board'
      trigger={
        <Button
          type='button'
          variant='default'
          aria-label='switch board'
          className='flex min-h-11 min-w-0 flex-1 items-center gap-1.5 text-left'
        >
          <Text component='span' className={cn('truncate font-bold', BAR_TEXT)}>
            {BOARD_LABEL[board]}
          </Text>
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {counts.get(board) ?? 0}
          </Text>
          <FoldCaret open={open} />
        </Button>
      }
    >
      {BOARDS.map((b) => (
        <OptionRow
          key={b}
          selected={b === board}
          onClick={() => {
            onChange(b);
            setOpen(false);
          }}
        >
          <span className='flex-1 uppercase tracking-label'>{BOARD_LABEL[b]}</span>
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {counts.get(b) ?? 0}
          </Text>
        </OptionRow>
      ))}
    </PickerSheet>
  );
}

export function SearchField({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  return (
    <div className='relative'>
      <Input
        name='task-search'
        type='text'
        value={value}
        placeholder='search'
        autoComplete='off'
        enterKeyHint='search'
        aria-label='search tasks'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className='min-h-11 pr-11'
      />
      {value && (
        <Close
          aria-label='clear search'
          onClick={() => onChange('')}
          className='absolute right-0 top-0 text-labelColor'
        />
      )}
    </div>
  );
}

export function StatusSwitch({
  value,
  tasks,
  onChange,
}: {
  value: PhoneStatus;
  /** Board tasks after every other narrowing — the counts in the sheet. */
  tasks: Task[];
  onChange: (s: PhoneStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PickerSheet
      phone
      open={open}
      onOpenChange={setOpen}
      title='status'
      trigger={
        <Chip
          selected={value !== 'open'}
          pressed={open}
          aria-haspopup='dialog'
          className='min-h-11'
        >
          {phoneStatusLabel(value)}
          <FoldCaret open={open} />
        </Chip>
      }
    >
      {STATUS_CHOICES.map((s) => (
        <OptionRow
          key={s}
          selected={s === value}
          onClick={() => {
            onChange(s);
            setOpen(false);
          }}
        >
          <span className='flex-1 uppercase tracking-label'>{phoneStatusLabel(s)}</span>
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {tasks.filter((t) => matchStatus(t, s)).length}
          </Text>
        </OptionRow>
      ))}
    </PickerSheet>
  );
}

/**
 * ОСТАЛЬНЫЕ ФИЛЬТРЫ — ШТОРКА С ЧЕРНОВИКОМ. Выбор копится в черновике и применяется одной кнопкой
 * «show N»: N посчитан по уже прочитанным задачам. Archived меняет само чтение (include_archived),
 * поэтому, пока черновик расходится с ним, число не показывается — оно было бы враньём.
 */
export function FiltersSheet({
  filters,
  showArchived,
  projectLabel,
  people,
  count,
  preview,
  onApply,
}: {
  filters: TaskFilters;
  showArchived: boolean;
  projectLabel?: string;
  people: { name: string; count: number }[];
  /** Number on the door: how many of these filters are on. */
  count: number;
  /** Visible rows if the draft were applied. */
  preview: (draft: TaskFilters) => number;
  onApply: (next: { filters: TaskFilters; archived: boolean; keepProject: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [archived, setArchived] = useState(showArchived);
  const [keepProject, setKeepProject] = useState(true);

  const onOpenChange = (o: boolean) => {
    if (o) {
      setDraft(filters);
      setArchived(showArchived);
      setKeepProject(true);
    }
    setOpen(o);
  };
  const set = (patch: Partial<TaskFilters>) => setDraft((d) => setFilter(d, patch));
  // Archived and the project change the read itself: no honest number until applied.
  const n = archived === showArchived && (keepProject || !projectLabel) ? preview(draft) : null;

  return (
    <PickerSheet
      phone
      open={open}
      onOpenChange={onOpenChange}
      title='filters'
      trigger={
        <Chip selected={count > 0} pressed={open} aria-haspopup='dialog' className='min-h-11'>
          filters{count > 0 && <span className='tabular-nums'>· {count}</span>}
        </Chip>
      }
    >
      <div className='flex flex-col gap-4 px-4'>
        <div className='flex flex-col gap-2'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            priority
          </Text>
          <ChipRow className='gap-2'>
            {PRIORITIES.slice()
              .reverse()
              .map((p) => {
                const on = draft.priority === p;
                return (
                  <Chip
                    key={p}
                    selected={on}
                    pressed={on}
                    onClick={() => set({ priority: on ? '' : p })}
                    className='min-h-11'
                  >
                    {PRIORITY_LABEL[p]}
                  </Chip>
                );
              })}
          </ChipRow>
        </div>

        {people.length > 0 && (
          <div className='flex flex-col gap-2'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              people
            </Text>
            <AvatarPicker
              people={people}
              selected={draft.assignee}
              onSelect={(name) => set({ assignee: name })}
              className='gap-x-4 [&>button]:min-h-11'
            />
          </div>
        )}

        {projectLabel && (
          <div className='flex flex-col gap-2'>
            <Text
              size='micro'
              variant='label'
              tracking='label'
              component='span'
              className='uppercase'
            >
              project
            </Text>
            <ChipRow className='gap-2'>
              <Chip
                selected={keepProject}
                pressed={keepProject}
                onClick={() => setKeepProject((v) => !v)}
                className='min-h-11 min-w-0 max-w-full whitespace-normal break-words text-left'
              >
                {projectLabel}
              </Chip>
            </ChipRow>
          </div>
        )}

        <div className='flex flex-col gap-2'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            other
          </Text>
          <ChipRow className='gap-2'>
            <Chip
              selected={archived}
              pressed={archived}
              onClick={() => setArchived((v) => !v)}
              className='min-h-11'
            >
              archived
            </Chip>
          </ChipRow>
        </div>
      </div>

      <div className='mt-4 flex gap-2 border-t border-hairline px-4 pt-2.5'>
        <Button
          type='button'
          variant='simpleReverseWithBorder'
          className='min-h-12 px-4 uppercase tracking-label'
          onClick={() => {
            setDraft((d) => ({ ...d, priority: '', assignee: undefined }));
            setArchived(false);
            setKeepProject(false);
          }}
        >
          reset
        </Button>
        <Button
          type='button'
          variant='main'
          className='min-h-12 flex-1 uppercase tracking-label'
          onClick={() => {
            onApply({ filters: draft, archived, keepProject });
            setOpen(false);
          }}
        >
          {n === null ? 'show' : `show ${n}`}
        </Button>
      </div>
    </PickerSheet>
  );
}

// ---- list -----------------------------------------------------------------------------------

function TaskRow({
  task,
  onOpen,
  fresh,
}: {
  task: Task;
  onOpen: (t: Task) => void;
  fresh: boolean;
}) {
  const t = task.task;
  const done = task.status === 'TASK_STATUS_DONE';
  const isArchived = !!task.archivedAt;
  const due = dueMeta(t.dueDate, done || isArchived);
  const blockers = openBlockers(task.relations);
  const checkTotal = task.checklist.length;
  const checkDone = task.checklist.filter((c) => c.isDone).length;
  const label = t.labels[0];
  const hasMeta =
    t.priority !== 'TASK_PRIORITY_UNKNOWN' ||
    blockers.length > 0 ||
    due.state !== 'none' ||
    checkTotal > 0 ||
    !!label ||
    isArchived;

  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (fresh) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [fresh]);

  return (
    <Button
      ref={ref}
      type='button'
      variant='default'
      onClick={() => onOpen(task)}
      aria-label={`open task: ${t.title}`}
      className={cn(
        'flex min-h-16 w-full items-start gap-2.5 border-t border-hairline p-3 text-left transition-colors duration-1000 first:border-t-0',
        fresh ? 'bg-pageBg' : 'bg-bgColor',
        isArchived && 'opacity-60',
      )}
    >
      <span className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <Text
          component='span'
          className={cn('line-clamp-2 break-words leading-snug', done && 'text-labelColor')}
        >
          {t.title}
        </Text>
        {hasMeta && (
          <span className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
            <PriorityTag priority={t.priority} />
            {blockers.length > 0 && <Pill tone='warn'>blocked · {blockers.length}</Pill>}
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
            {checkTotal > 0 && (
              <Text size='micro' variant='label' component='span' className='tabular-nums'>
                ✓ {checkDone}/{checkTotal}
              </Text>
            )}
            {label && (
              <Text size='micro' variant='label' component='span' className='truncate'>
                #{label}
              </Text>
            )}
            {isArchived && <Pill tone='ink'>archived</Pill>}
          </span>
        )}
      </span>
      <AvatarStack names={t.assignees} size={26} />
    </Button>
  );
}

export function PhoneTaskList({
  tasks,
  status,
  onOpen,
  freshId,
}: {
  /** Already narrowed by every filter, status and search. */
  tasks: Task[];
  status: PhoneStatus;
  onOpen: (task: Task) => void;
  /** A just-added task: flashed and scrolled into view. */
  freshId?: number;
}) {
  const [folded, setFolded] = useState<Partial<Record<TaskStatus, boolean>>>({
    TASK_STATUS_DONE: true,
  });
  // Picking «done» or «all» means the done group is what you came for — open it.
  useEffect(() => {
    if (status === 'all' || status === 'TASK_STATUS_DONE')
      setFolded((f) => ({ ...f, TASK_STATUS_DONE: false }));
  }, [status]);

  if (tasks.length === 0) return <BoardEmpty className='py-8 text-center'>empty</BoardEmpty>;

  return (
    <div className='flex flex-col gap-2'>
      {GROUP_ORDER.map((s) => {
        const items = tasks.filter((t) => t.status === s).sort((a, b) => a.position - b.position);
        if (!items.length) return null;
        const isFolded = !!folded[s] && !items.some((t) => t.id === freshId);
        return (
          <section key={s} className='-mx-2.5 border-y border-borderColor bg-bgColor'>
            <Button
              type='button'
              variant='default'
              aria-expanded={!isFolded}
              onClick={() => setFolded((f) => ({ ...f, [s]: !isFolded }))}
              className='flex min-h-11 w-full items-center gap-2 bg-pageBg px-3 text-left'
            >
              <Text size='micro' tracking='label' component='span' className='uppercase'>
                {STATUS_LABEL[s]}
              </Text>
              <Text size='micro' variant='label' component='span' className='tabular-nums'>
                {items.length}
              </Text>
              <FoldCaret open={!isFolded} className='ml-auto text-labelColor' />
            </Button>
            {!isFolded &&
              items.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} fresh={t.id === freshId} />
              ))}
          </section>
        );
      })}
    </div>
  );
}

export function NothingFound({ onClear }: { onClear: () => void }) {
  return (
    <div className='-mx-2.5 flex flex-col items-center gap-3 border-y border-borderColor bg-bgColor px-4 py-8'>
      <Text size='micro' tracking='label' component='span' className='uppercase'>
        nothing found
      </Text>
      <Button
        type='button'
        variant='simpleReverseWithBorder'
        onClick={onClear}
        className='min-h-11 px-4 uppercase tracking-label'
      >
        clear filters
      </Button>
    </div>
  );
}

// ---- quick add ------------------------------------------------------------------------------

export function QuickAdd({
  saving,
  onAdd,
}: {
  saving: boolean;
  /** Resolves when the task is created; rejects to keep the text. */
  onAdd: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const ready = !!title.trim() && !saving;
  const submit = async () => {
    if (!ready) return;
    try {
      await onAdd(title.trim());
      setTitle('');
    } catch {
      /* snackbar shown by the mutation; keep the text */
    }
  };
  return (
    <div className='fixed inset-x-0 bottom-0 z-[var(--z-dock)] flex gap-2 border-t border-borderColor bg-bgColor px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]'>
      <Input
        name='task-quick-add'
        type='text'
        value={title}
        placeholder='new task'
        autoComplete='off'
        enterKeyHint='done'
        aria-label='new task title'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        className='min-h-11 min-w-0 flex-1'
      />
      <Button
        type='button'
        variant={ready ? 'main' : 'simpleReverseWithBorder'}
        disabled={!ready}
        onClick={() => void submit()}
        className='min-h-11 px-4 uppercase tracking-label'
      >
        add
      </Button>
    </div>
  );
}

/** Rows the phone list renders: the shared client filters, then status and search. */
export function phoneVisible(
  tasks: Task[],
  filters: TaskFilters,
  user: string | undefined,
  status: PhoneStatus,
  query: string,
): Task[] {
  return applyFilters(tasks, filters, user).filter(
    (t) => matchStatus(t, status) && matchQuery(t, query),
  );
}
