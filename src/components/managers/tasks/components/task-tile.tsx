import { useDraggable } from '@dnd-kit/core';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { format, startOfDay } from 'date-fns';
import { cn } from 'lib/utility';
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Button,
  CascadeList,
  Fold,
  LiquidTabs,
  Media,
  MetaWord,
  PeopleUnfold,
  QUIET_PRESS,
  TileShell,
  TileTitle,
  WheelDatePicker,
} from 'ui';
import type { Task, TaskBoardEntry, TaskPriority, TaskStatus } from '../api/types';
import { useTaskPins } from '../hooks/useTaskPins';
import { boardNameOf, useInlineTaskPatch, useTask, useTaskBoards } from '../hooks/useTasks';
import { COLUMN_LABEL, deadlineTone, PRIORITIES, PRIORITY_TITLE, STATUSES } from '../utils/meta';
import { openBlockers, RELATION_LABEL } from '../utils/relations';

const SOFT = 'duration-700 ease-soft motion-reduce:transition-none';
export type TileVariant = 'compact' | 'wide';
export type TileView =
  | 'task'
  | 'description'
  | 'checklist'
  | 'attachments'
  | 'dependencies'
  | 'history';
type Editor = 'department' | 'people' | 'person' | 'date' | 'priority' | 'status' | null;

/** What the tile's inner header can write, in place. Absent = the header only shows. */
export type TileEdit = {
  boards: TaskBoardEntry[];
  /** Everybody who can be assigned. */
  people: string[];
  onBoard: (boardId: number) => void;
  onAddBoard?: (name: string) => void;
  onPriority: (priority: TaskPriority) => void;
  onStatus: (status: TaskStatus) => void;
  onDueDate: (iso: string) => void;
  onAssignees: (names: string[]) => void;
  busy?: boolean;
};

/** The words over a selected tile. */
export type TileActions = {
  onEdit: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  archived?: boolean;
};

/** Markdown to a quiet line: marks, links and tokens out, the words kept. */
function plainExcerpt(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

/** A step's mark: an open ink circle (not done) or a filled grey dot (done). */
export function StepDot({ done, className }: { done: boolean; className?: string }) {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 8 8'
      className={cn('size-2 shrink-0', done ? 'text-placeholder' : 'text-ink', className)}
    >
      {done ? (
        <circle cx='4' cy='4' r='3.5' fill='currentColor' />
      ) : (
        <circle cx='4' cy='4' r='3' fill='none' stroke='currentColor' strokeWidth='1' />
      )}
    </svg>
  );
}

/** Status moves of the task, newest first (read with the task itself, only when asked for). */
function TileHistory({ id }: { id: number }) {
  const { data, isLoading } = useTask(id);
  const rows = data?.statusHistory ?? [];
  if (isLoading) return <p className='text-textBaseSize text-placeholder'>…</p>;
  if (rows.length === 0) return <p className='text-textBaseSize text-placeholder'>Empty</p>;
  return (
    <ul className='flex flex-col'>
      {rows.slice(0, 6).map((r, i) => (
        <li
          key={`${r.changedAt}-${i}`}
          className={cn(
            'flex h-7 items-center justify-between gap-3 border-b border-hairline text-textBaseSize',
            i === 0 ? 'text-ink' : 'text-placeholder',
          )}
        >
          <span className='truncate'>{COLUMN_LABEL[r.toStatus]}</span>
          <span className='shrink-0 tabular-nums'>
            {r.changedAt ? format(new Date(r.changedAt), 'MMM d, yyyy') : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

const VIEW_LABEL: Record<TileView, string> = {
  task: 'Task',
  description: 'Description',
  checklist: 'Checklist',
  attachments: 'Attachments',
  dependencies: 'Dependencies',
  history: 'History',
};

const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ value: p as string, label: PRIORITY_TITLE[p] }));
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s as string, label: COLUMN_LABEL[s] }));

/**
 * ONE TASK TILE. A `tileFill` tile with an ink rule under it.
 *
 * - `compact` (a board column): people at the left, `Deadline:` + date at the right («Set a Date»
 *   when there is none), the title in 24px, what is pinned (description lines, steps), the first
 *   picture.
 * - `wide` (an opened status, the «Opened Card» of the panel): the picture at the left, the header
 *   in one row, the title, the chosen view.
 * - `minimal` (scrolled to the top of its column): the same header (people, deadline) and the
 *   title in 16px. A picture never folds away.
 *
 * TITLE BY DEADLINE: far or none → grey; near → ink; within two days or past → ink, and the DATE
 * (only the date) in the new red. A hover, a selection or the column header's hover turn a grey
 * title ink.
 *
 * THE HEADER WORDS ARE EDITORS in every state and on every screen (`edit`): Department, Priority
 * and Status open a cascade list at their own side, the people unfold downward and shift the
 * content right, the date opens the wheels — in the size of the tile (`compact` / `wide`). A click
 * on the tile, anywhere outside, or another word closes the open one (it folds back the way it
 * opened); the date and the people are written once, on closing.
 *
 * SELECTED (one click; a second click lets it go): the words Edit / Archive / Delete at the right
 * above the tile, the second header row (Priority, Department), and the view tabs at the tile's
 * very bottom edge.
 */
export function TaskTile({
  task,
  variant = 'compact',
  minimal,
  selected,
  holding,
  dragging,
  pinKey,
  writable,
  edit,
  actions,
  onRemove,
  boardName,
}: {
  task: Task;
  variant?: TileVariant;
  minimal?: boolean;
  selected?: boolean;
  /** Pressed and held: the drag state. */
  holding?: boolean;
  dragging?: boolean;
  /** The pins to read: the task's own id by default, `new` for a task being created. */
  pinKey?: string;
  /** The task can be written: the people show their `+`. */
  writable?: boolean;
  edit?: TileEdit;
  actions?: TileActions;
  /** «Remove Task» at the end of the view tabs. */
  onRemove?: () => void;
  boardName?: string;
}) {
  const t = task.task;
  const wide = variant === 'wide';
  const size = wide ? 'wide' : 'compact';
  const pins = useTaskPins()[pinKey ?? String(task.id)] ?? [];
  const settled = task.status === 'TASK_STATUS_DONE' || !!task.archivedAt;
  const tone = deadlineTone(t.dueDate, settled);
  const dueDate = t.dueDate ? new Date(t.dueDate) : null;
  const due = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null;
  const pictures = task.media.map((m) => m.fullSize || m.thumbnail).filter((u): u is string => !!u);
  const cover = pictures[0];
  const blockers = openBlockers(task.relations);
  const description = t.description ? plainExcerpt(t.description) : '';
  const open = !minimal && (!!selected || wide);

  const [view, setView] = useState<TileView>('task');
  const views = useMemo<TileView[]>(() => {
    const list: TileView[] = ['task'];
    if (description) list.push('description');
    if (task.checklist.length) list.push('checklist');
    if (pictures.length) list.push('attachments');
    if (task.relations.length) list.push('dependencies');
    if (task.id > 0) list.push('history');
    return list;
  }, [description, task.checklist.length, pictures.length, task.relations.length, task.id]);
  const shownView = open && views.includes(view) ? view : 'task';

  // ── in-place editors ──
  // The lists and the wheels are heavy and most tiles never open them: they are mounted on the
  // first opening (closed), and opened a frame later so the opening still eases.
  const [mounted, setMounted] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [dateDraft, setDateDraft] = useState<Date | null>(null);
  const [peopleDraft, setPeopleDraft] = useState<string[] | null>(null);
  const live = useRef({ editor, dateDraft, peopleDraft, edit, due, assignees: t.assignees });
  live.current = { editor, dateDraft, peopleDraft, edit, due, assignees: t.assignees };
  /** Leaving an editor writes what it held (the date, the people): one write per gesture. */
  const close = (next: Editor = null) => {
    const now = live.current;
    if (now.dateDraft && now.editor === 'date' && next !== 'date') {
      const iso = startOfDay(now.dateDraft).toISOString();
      if (!now.due || startOfDay(now.due).toISOString() !== iso) now.edit?.onDueDate(iso);
      setDateDraft(null);
    }
    const peopleOpen = now.editor === 'people' || now.editor === 'person';
    if (now.peopleDraft && peopleOpen && next !== 'people' && next !== 'person') {
      const same =
        now.peopleDraft.length === now.assignees.length &&
        now.peopleDraft.every((n, i) => n === now.assignees[i]);
      if (!same) now.edit?.onAssignees(now.peopleDraft);
      setPeopleDraft(null);
    }
    if (next && !mounted) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setEditor(next)));
      return;
    }
    setEditor(next);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const canEdit = !!edit && !edit.busy;
  const hasEdit = !!edit;
  useEffect(() => {
    if (!hasEdit) closeRef.current(null);
  }, [hasEdit]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editor) return undefined;
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) closeRef.current(null);
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      closeRef.current(null);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [editor]);
  const toggle = (which: Exclude<Editor, null>) => close(editor === which ? null : which);

  const people = peopleDraft ?? t.assignees;
  const peopleOpen = editor === 'people' || editor === 'person';
  const listOpen = editor != null && editor !== 'people';
  const circle = minimal ? 16 : wide ? 30 : 20;
  const hot = tone === 'hot';
  const grey = tone === 'far' || tone === 'none';
  const department = boardName ?? boardNameOf(edit?.boards, task.boardId);
  const dim = (which: Editor) => listOpen && editor !== which;

  const peopleNode = (
    <span data-flip='people' className='flex shrink-0 items-center'>
      <PeopleUnfold
        names={people}
        size={circle}
        open={peopleOpen}
        disabled={!canEdit}
        plus={writable || hasEdit}
        onOpenChange={(o) => close(o ? 'people' : null)}
        onAdd={() => setEditor(editor === 'person' ? 'people' : 'person')}
        onPerson={canEdit ? (name) => setPeopleDraft(people.filter((n) => n !== name)) : undefined}
      />
    </span>
  );
  const shownDate = dateDraft ?? due;
  const deadlineNode = (
    <span data-flip='deadline' className='flex min-w-0'>
      <MetaWord
        label='Deadline'
        value={shownDate ? format(shownDate, 'MMM d, yyyy') : 'Set a Date'}
        bracket={false}
        tone={!shownDate ? 'quiet' : hot && !dateDraft ? 'alert' : undefined}
        dim={dim('date')}
        active={editor === 'date'}
        onClick={canEdit ? () => toggle('date') : undefined}
      />
    </span>
  );
  const departmentNode = department && (
    <MetaWord
      label='Department'
      value={department}
      dim={dim('department')}
      active={editor === 'department'}
      onClick={canEdit ? () => toggle('department') : undefined}
    />
  );
  const priorityNode = (t.priority !== 'TASK_PRIORITY_UNKNOWN' || hasEdit) && (
    <MetaWord
      label='Priority'
      value={PRIORITY_TITLE[t.priority]}
      dim={dim('priority')}
      active={editor === 'priority'}
      onClick={canEdit ? () => toggle('priority') : undefined}
    />
  );
  const statusNode = (
    <MetaWord
      label='Status'
      value={COLUMN_LABEL[task.status]}
      dim={dim('status')}
      active={editor === 'status'}
      onClick={canEdit ? () => toggle('status') : undefined}
    />
  );
  const quiet = (
    <>
      {blockers.length > 0 && (
        <span
          title={blockers.map((b) => b.title || `#${b.taskId}`).join(', ')}
          className='truncate text-micro text-alert'
        >
          Blocked
        </span>
      )}
      {!!task.archivedAt && <span className='truncate text-micro text-labelDark'>Archived</span>}
    </>
  );

  const header = wide ? (
    <div className='flex min-h-7.5 flex-wrap items-center justify-between gap-x-6 gap-y-1'>
      <span className='flex min-w-0 items-center gap-4'>
        {peopleNode}
        {departmentNode}
        {quiet}
      </span>
      <span className='flex min-w-0 flex-wrap items-center justify-end gap-x-4'>
        {deadlineNode}
        {priorityNode}
        {hasEdit && statusNode}
      </span>
    </div>
  ) : (
    <>
      <div className='flex min-h-5 items-center justify-between gap-2'>
        <span className='flex min-w-0 items-center gap-2'>
          {peopleNode}
          {!minimal && quiet}
        </span>
        {deadlineNode}
      </div>
      <Fold open={open}>
        <div className='flex min-h-6 items-end justify-between gap-2 pt-1'>
          <span className='flex min-w-0'>{priorityNode}</span>
          <span className='flex min-w-0'>{departmentNode}</span>
        </div>
      </Fold>
    </>
  );

  const pick = (fn: () => void) => {
    fn();
    setEditor(null);
  };
  const editors = edit && mounted && (
    <div
      className={cn(
        'transition-[padding] duration-700 ease-soft',
        listOpen ? (wide ? 'py-3' : 'py-2') : 'py-0',
      )}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
    >
      <CascadeList
        label='department'
        size={size}
        align={wide ? 'left' : 'right'}
        open={editor === 'department'}
        options={edit.boards.map((b) => ({ value: String(b.id), label: b.name }))}
        value={String(task.boardId)}
        onChange={(v) => pick(() => Number(v) !== task.boardId && edit.onBoard(Number(v)))}
        addLabel={edit.onAddBoard ? 'Add' : undefined}
        onAdd={edit.onAddBoard}
      />
      <CascadeList
        label='assignee'
        size={size}
        multiple
        open={editor === 'person'}
        options={[...new Set([...edit.people, ...people])].map((n) => ({ value: n, label: n }))}
        values={people}
        onChange={(n) =>
          setPeopleDraft(people.includes(n) ? people.filter((p) => p !== n) : [...people, n])
        }
        className={wide ? 'pl-11' : 'pl-8'}
      />
      <WheelDatePicker
        size={size}
        open={editor === 'date'}
        value={dateDraft ?? due}
        onChange={setDateDraft}
      />
      <CascadeList
        label='priority'
        size={size}
        align={wide ? 'right' : 'left'}
        open={editor === 'priority'}
        options={PRIORITY_OPTIONS}
        value={t.priority}
        onChange={(v) => pick(() => v !== t.priority && edit.onPriority(v as TaskPriority))}
      />
      <CascadeList
        label='status'
        size={size}
        align='right'
        open={editor === 'status'}
        options={STATUS_OPTIONS}
        value={task.status}
        onChange={(v) => pick(() => v !== task.status && edit.onStatus(v as TaskStatus))}
      />
    </div>
  );

  const tabs = (
    <LiquidTabs
      label='tile view'
      items={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))}
      value={shownView}
      onChange={setView}
      end={
        onRemove && wide ? (
          <Button
            type='button'
            variant='default'
            onPointerDown={stop}
            onClick={(e: SyntheticEvent) => {
              e.stopPropagation();
              onRemove();
            }}
            className={cn(
              'cursor-pointer text-textBaseSize whitespace-nowrap text-placeholder transition-colors duration-500 ease-soft hover:text-ink press:text-ink',
              QUIET_PRESS,
            )}
          >
            Remove Task
          </Button>
        ) : undefined
      }
    />
  );
  const tabsShown = open && views.length > 1 && !listOpen;

  const steps = (
    <ul className='flex flex-col gap-1.5 pt-3'>
      {task.checklist.map((s) => (
        <li key={s.id} className='flex items-start gap-2.5 text-textBaseSize'>
          <StepDot done={s.isDone} className='mt-1' />
          <span
            className={cn(
              'min-w-0 break-words',
              s.isDone ? 'text-placeholder line-through' : 'text-labelDark',
            )}
          >
            {s.content}
          </span>
        </li>
      ))}
    </ul>
  );
  const showSteps = shownView === 'checklist' || (shownView === 'task' && pins.includes('steps'));
  const showText = shownView === 'description' || (shownView === 'task' && pins.includes('info'));
  const body = (
    <div
      className='transition-[padding,min-height] duration-700 ease-soft motion-reduce:transition-none'
      style={
        peopleOpen
          ? {
              paddingLeft: PeopleUnfold.shift(circle),
              minHeight: PeopleUnfold.height(people.length, circle),
            }
          : undefined
      }
    >
      <TileTitle
        minimal={minimal}
        quiet={grey && !selected && !dragging}
        className={wide ? 'max-w-[34rem]' : undefined}
      >
        {t.title || (task.id > 0 ? `#${task.id}` : 'New Task')}
      </TileTitle>
      <Fold open={!minimal && showText && !!description}>
        <p
          className={cn(
            'pt-2 text-textBaseSize text-labelDark',
            shownView === 'description' ? 'line-clamp-6 max-w-[40rem]' : 'line-clamp-3',
          )}
        >
          {description}
        </p>
      </Fold>
      <Fold open={!minimal && showSteps && task.checklist.length > 0}>{steps}</Fold>
      <Fold open={!minimal && shownView === 'dependencies'}>
        <ul className='flex flex-col pt-3'>
          {task.relations.map((r) => (
            <li
              key={`${r.kind}-${r.taskId}`}
              className='flex h-7 items-center justify-between gap-3 border-b border-hairline text-textBaseSize text-labelDark'
            >
              <span className='truncate'>{r.title || `#${r.taskId}`}</span>
              <span className='shrink-0 text-placeholder'>{RELATION_LABEL[r.kind]}</span>
            </li>
          ))}
        </ul>
      </Fold>
      <Fold open={!minimal && shownView === 'history'}>
        <div className='pt-3'>{shownView === 'history' && <TileHistory id={task.id} />}</div>
      </Fold>
      <Fold open={!minimal && shownView === 'attachments'}>
        <div className={cn('grid gap-0.5 pt-3', wide ? 'grid-cols-3' : 'grid-cols-2')}>
          {pictures.slice(0, wide ? 3 : 4).map((src) => (
            <Media key={src} src={src} alt='' aspectRatio='1/1' fit='cover' />
          ))}
        </div>
      </Fold>
    </div>
  );

  // A picture never folds to text: it stays through every scroll state.
  const coverShown = !!cover && shownView !== 'attachments';
  const picture = cover && (
    <div data-flip='cover'>
      <Media src={cover} alt='' aspectRatio='5/4' fit='cover' />
    </div>
  );

  const words = actions
    ? [
        { key: 'edit', label: 'Edit', onClick: actions.onEdit },
        ...(actions.onArchive
          ? [
              {
                key: 'archive',
                label: actions.archived ? 'Restore' : 'Archive',
                onClick: actions.onArchive,
              },
            ]
          : []),
        ...(actions.onDelete
          ? [{ key: 'delete', label: 'Delete', onClick: actions.onDelete }]
          : []),
      ]
    : undefined;

  return (
    <TileShell
      rootRef={root}
      selected={selected}
      lifted={dragging || holding}
      minimal={minimal}
      faded={!!task.archivedAt}
      words={words}
      onClick={
        editor
          ? (e) => {
              e.stopPropagation();
              close(null);
            }
          : undefined
      }
    >
      {wide ? (
        <div className='flex items-stretch'>
          <Fold
            open={coverShown}
            className={cn(
              'shrink-0 transition-[width,margin,grid-template-rows,opacity] max-md:hidden',
              coverShown ? 'mr-4 w-[34%]' : 'mr-0 w-0',
              minimal && coverShown && 'w-[18%]',
            )}
          >
            <div className='pb-2'>{picture}</div>
          </Fold>
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col px-1 transition-[min-height]',
              SOFT,
              minimal ? 'min-h-0' : 'min-h-40',
            )}
          >
            {header}
            {editors}
            <Fold open={!listOpen} className={minimal ? 'mt-1 flex-1' : 'mt-4 flex-1'}>
              {body}
            </Fold>
            <Fold open={tabsShown} className='mt-auto'>
              <div className='pt-3'>{tabs}</div>
            </Fold>
            <Fold open={!tabsShown}>
              <div className='h-2' />
            </Fold>
          </div>
        </div>
      ) : (
        <div className='px-1'>
          {header}
          {editors}
          <Fold open={!listOpen} className={minimal ? 'mt-1' : 'mt-3'}>
            {body}
          </Fold>
          <Fold open={coverShown && !listOpen}>
            <div className={minimal ? 'pt-2' : 'pt-3'}>{picture}</div>
          </Fold>
          <Fold open={tabsShown}>
            <div className='pt-2'>{tabs}</div>
          </Fold>
          <Fold open={!tabsShown}>
            <div className={minimal ? 'h-1.5' : 'h-4'} />
          </Fold>
        </div>
      )}
    </TileShell>
  );
}

/**
 * A tile that can write: the in-place header editors go through the one safe door
 * (`useInlineTaskPatch` — fresh read, conflict check, merged write); the board and the status move
 * the task (`onBoard` / `onStatus`, the drag's own mutation, with its undo receipt).
 */
export function EditableTile({
  task,
  canWrite,
  onStatus,
  onBoard,
  onAddBoard,
  ...rest
}: Omit<ComponentProps<typeof TaskTile>, 'edit'> & {
  canWrite: boolean;
  onStatus: (task: Task, status: TaskStatus) => void;
  onBoard: (task: Task, boardId: number) => void;
  onAddBoard?: (task: Task, name: string) => void;
}) {
  const inline = useInlineTaskPatch(task.id);
  const { data: boards } = useTaskBoards();
  const { data: admins } = useAdmins(canWrite);
  const people = useMemo(
    () => (admins?.admins ?? []).map((a) => a.username).filter((n): n is string => !!n),
    [admins],
  );
  const base = task.task;
  const patch = (p: Partial<typeof base>) => {
    void inline.mutateAsync({ patch: p, base }).catch(() => undefined);
  };
  const edit: TileEdit | undefined = canWrite
    ? {
        boards: boards ?? [],
        people,
        busy: inline.isPending,
        onBoard: (boardId) => onBoard(task, boardId),
        onAddBoard: onAddBoard ? (name) => onAddBoard(task, name) : undefined,
        onStatus: (status) => onStatus(task, status),
        onPriority: (priority) => patch({ priority }),
        onDueDate: (dueDate) => patch({ dueDate }),
        onAssignees: (assignees) => patch({ assignees }),
      }
    : undefined;
  return (
    <TaskTile
      task={task}
      edit={edit}
      writable={canWrite}
      boardName={boardNameOf(boards, task.boardId)}
      {...rest}
    />
  );
}

/**
 * A tile on the board: drag (mouse / pen / keyboard; a finger scrolls the column). One click
 * selects it (the words above it, the second header row, the tabs), a click on the selected tile
 * lets it go, a double click or Enter opens it in the panel at once, a press that is held is the
 * drag state. `folded` folds it away entirely (the status-open animation), `order` staggers that.
 */
export function DraggableTile({
  task,
  selected,
  disabled,
  noDrag,
  held,
  minimal,
  folded,
  order = 0,
  onSelect,
  onOpen,
  onHold,
  tile,
}: {
  task: Task;
  selected: boolean;
  /** Read only: no drag, no editors. */
  disabled?: boolean;
  /** An opened status: the tile stays where it is. */
  noDrag?: boolean;
  /** Lifted off the board: `hold` keeps its room for the first measure, `gone` gives it up. */
  held?: 'hold' | 'gone';
  /** The column's scroll has brought it to its smallest state. */
  minimal: boolean;
  folded?: boolean;
  /** Its turn in the fold cascade, ms. */
  order?: number;
  onSelect: (id: number | null) => void;
  onOpen: (task: Task) => void;
  /** Pressed: the board starts compressing while a tile is held. */
  onHold?: (id: number | null) => void;
  tile: (minimal: boolean) => ReactNode;
}) {
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: task.id,
    disabled: disabled || noDrag,
  });
  const gone = !!folded && !held;
  return (
    <div
      ref={setNodeRef}
      data-task-card={held || gone ? undefined : task.id}
      data-task-selected={selected || undefined}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        listeners?.onPointerDown?.(e);
        if (e.button === 0 && e.pointerType !== 'touch' && !disabled && !noDrag) onHold?.(task.id);
      }}
      onClick={() => onSelect(selected ? null : task.id)}
      onDoubleClick={() => onOpen(task)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        listeners?.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen(task);
        }
      }}
      aria-label={`task: ${task.task.title}`}
      aria-pressed={selected}
      aria-hidden={gone || undefined}
      inert={gone}
      style={{ transitionDelay: `${order}ms` }}
      className={cn(
        'grid shrink-0 select-none outline-none transition-[grid-template-rows,opacity] duration-300 ease-soft focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ink motion-reduce:transition-none',
        gone ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
        disabled || noDrag ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        held && 'invisible',
        held === 'gone' && 'h-0 overflow-hidden',
      )}
    >
      <div className={cn('min-h-0 min-w-0', gone && 'overflow-hidden')}>
        {tile(minimal && !selected)}
      </div>
    </div>
  );
}
