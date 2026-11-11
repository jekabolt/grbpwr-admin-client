import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  DropAnimationFunction,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  PointerSensorOptions,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { notify } from 'lib/stores/store';
import { cn } from 'lib/utility';
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, ConfirmationModal, Iconoir, Text, usePressHold, useStepWheel } from 'ui';
import { ListTasksFilter, Task, TaskStatus } from '../api/types';
import {
  useAddTaskBoard,
  useArchiveTask,
  useDeleteTask,
  useMoveTask,
  useUnarchiveTask,
} from '../hooks/useTasks';
import { COLUMN_LABEL, STATUSES } from '../utils/meta';
import { BoardColumn, FOLD_TURN_MS, FOLD_TURNS, HeldCard } from './board-column';
import { cursorThenNearest, dropPosition, DropSlot, keyboardStep, slotBefore } from './board-drag';
import { EditableTile, TaskTile } from './task-tile';

const LAND_MS = 420;
const LAND_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };
/** Px between columns (`gap-1`). */
const GAP = 4;
/** The swipe travel that steps one column. */
const SWIPE = 40;
/** A press this long without a release is a hold: the drag state begins. */
const HOLD_MS = 180;
/** Enter opens a tile; only Space lifts it for a keyboard drag. */
const KEY_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] };

/**
 * ДРАГ — ТОЛЬКО МЫШЬЮ/ПЕРОМ. На телефоне палец, начавший жест на карточке, обязан листать
 * колонку, а не поднимать карточку: PointerSensor отсекает `pointerType === 'touch'`. Переезд на
 * телефоне — через статус в шапке выделенной плитки.
 */
class MousePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (event: ReactPointerEvent, options: PointerSensorOptions) =>
        event.nativeEvent.pointerType !== 'touch' &&
        PointerSensor.activators[0].handler(event, options),
    },
  ];
}

export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const map: Record<TaskStatus, Task[]> = {
    TASK_STATUS_UNKNOWN: [],
    TASK_STATUS_BACKLOG: [],
    TASK_STATUS_TODO: [],
    TASK_STATUS_IN_PROGRESS: [],
    TASK_STATUS_REVIEW: [],
    TASK_STATUS_DONE: [],
  };
  for (const t of tasks) (map[t.status] ??= []).push(t);
  for (const s of STATUSES) map[s].sort((a, b) => a.position - b.position);
  return map;
}

/** How many whole columns the board's window shows at rest, by its width. */
function restCount(width: number): number {
  if (width >= 840) return 3;
  if (width >= 520) return 2;
  return 1;
}

const STEP =
  'grid h-11 shrink-0 cursor-pointer place-items-center overflow-hidden bg-fieldFill text-placeholder transition-[width,opacity,color] duration-700 ease-soft hover:text-ink disabled:cursor-default disabled:text-titleOff disabled:hover:text-titleOff motion-reduce:transition-none';

/**
 * THE TASKBOARD (frame `frame2-taskboard.svg`). Five status columns in one window: Backlog, To Do,
 * Current, In Review, Completed. At rest the window shows THREE; the `<` tile steps one column back
 * to Backlog, `>` one forward to Completed. The board takes the height it is given and never grows:
 * every column scrolls by itself (`BoardColumn`).
 *
 * A TILE PRESSED AND HELD is the drag state: from that moment the window compresses from three
 * columns to all five over one second (easeInOutCubic), so Backlog and Completed are drop targets
 * wherever the window stood; the release expands it back. The drag itself is unchanged: the slot
 * follows the cursor (`board-drag.ts`), the position is counted on the FULL column, MoveTask is
 * optimistic.
 *
 * A STATUS HEADER PRESSED opens that status: its column takes the whole window and its tiles turn
 * wide; `×` (or the header again) brings the board back.
 *
 * SELECTION lives here: one click selects a tile, a click anywhere outside it lets it go.
 */
export function Board({
  tasks,
  allTasks,
  filter,
  selected,
  onSelect,
  onOpen,
  onAdd,
  canWrite,
  filtered,
}: {
  /** The tiles actually rendered (client-filtered). */
  tasks: Task[];
  /**
   * The unfiltered column contents. MoveTask's `position` is applied to the FULL column, so a drop
   * index derived from the visible subset would land the card in the wrong slot.
   */
  allTasks?: Task[];
  filter: ListTasksFilter;
  selected: number | null;
  onSelect: (id: number | null) => void;
  onOpen: (task: Task, mode?: 'tile' | 'card') => void;
  onAdd: (status: TaskStatus) => void;
  canWrite: boolean;
  filtered?: boolean;
}) {
  const move = useMoveTask(filter);
  const archive = useArchiveTask();
  const unarchive = useUnarchiveTask();
  const del = useDeleteTask();
  const addBoard = useAddTaskBoard();
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  // Outlives the drag by the landing: the slot stays open until the card has settled into it.
  const [held, setHeld] = useState<(HeldCard & { landing: boolean; home: DropSlot }) | null>(null);
  const [slot, setSlot] = useState<DropSlot | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [opened, setOpened] = useState<TaskStatus | null>(null);
  /**
   * A STATUS OPENS IN TWO PHASES (and closes the same way): first every tile of every column folds
   * under its header, quickly, cascading bottom → top; only then the chosen header stretches to the
   * whole window (or the board comes back), and the tiles unfold in their new shape.
   */
  const [folded, setFolded] = useState(false);
  const phases = useRef<number[]>([]);
  useEffect(() => () => phases.current.forEach((t) => window.clearTimeout(t)), []);
  const openStatus = (next: TaskStatus | null) => {
    phases.current.forEach((t) => window.clearTimeout(t));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFolded(false);
      return setOpened(next);
    }
    const fold = 300 + FOLD_TURNS * FOLD_TURN_MS;
    setFolded(true);
    phases.current = [
      window.setTimeout(() => setOpened(next), fold),
      window.setTimeout(() => setFolded(false), fold + 560),
    ];
  };

  // A press that is held: the drag state starts before the tile has moved.
  const { held: holding, press: pressTile } = usePressHold<number>(HOLD_MS);

  // A click outside the selected tile lets the selection go.
  useEffect(() => {
    if (selected == null) return undefined;
    const outside = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('[data-task-selected], [role="dialog"], [data-radix-popper-content-wrapper]')
      )
        return;
      onSelect(null);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [selected, onSelect]);

  // The window: its width decides how many columns stand in it.
  const win = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = win.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const rest = restCount(width);
  const dragging = held != null && !held.landing;
  const compress = !opened && (dragging || holding != null) && width >= 700;
  const shown = opened ? 1 : compress ? STATUSES.length : rest;
  const maxIndex = STATUSES.length - shown;
  // Backlog is one step to the left: the board opens on To Do.
  const [index, setIndex] = useState(1);
  const at = opened
    ? STATUSES.indexOf(opened)
    : Math.min(Math.max(0, compress ? 0 : index), maxIndex);
  const colWidth = width > 0 ? (width - GAP * (shown - 1)) / shown : 0;
  const stepBy = (dir: 1 | -1) => setIndex(Math.min(Math.max(0, at + dir), STATUSES.length - rest));
  const touch = useRef<{ x: number; y: number } | null>(null);
  // A horizontal wheel / trackpad swipe over the board steps one column, like the arrows.
  useStepWheel(win, (dir) => {
    if (!opened && !compress) stepBy(dir);
  });
  // The compression is the owner's one-second easeInOutCubic; everything else is the soft ease.
  // Nothing eases before the window has been measured: the board must not slide in on load.
  const [ready, setReady] = useState(false);
  const measured = width > 0;
  useEffect(() => {
    if (!measured) return undefined;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [measured]);
  const pace = !ready
    ? 'duration-0'
    : compress
      ? 'duration-1000 ease-cubic'
      : 'duration-700 ease-soft';

  const sensors = useSensors(
    useSensor(MousePointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardStep, keyboardCodes: KEY_CODES }),
  );

  const byStatus = useMemo(() => groupByStatus(tasks), [tasks]);
  const fullByStatus = useMemo(() => groupByStatus(allTasks ?? tasks), [allTasks, tasks]);
  const activeTask = activeId != null ? tasks.find((t) => t.id === activeId) : undefined;

  useEffect(() => {
    if (activeId == null) return undefined;
    const track = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', track, { capture: true, passive: true });
    return () => window.removeEventListener('pointermove', track, { capture: true });
  }, [activeId]);

  // The slot follows the cursor itself; the keyboard has none, so the held card's middle stands in.
  function followCursor(e: DragMoveEvent | DragOverEvent) {
    const status = e.over?.id as TaskStatus | undefined;
    if (!status) return;
    const box = e.active.rect.current.translated;
    const y = pointer.current?.y ?? (box ? box.top + box.height / 2 : null);
    if (y == null) return;
    const cards = document.querySelectorAll<HTMLElement>(
      `[data-drop-column="${status}"] [data-task-card]`,
    );
    const before = slotBefore(
      Array.from(cards).map((card) => {
        const { top, height } = card.getBoundingClientRect();
        return { id: Number(card.dataset.taskCard), top, height };
      }),
      y,
    );
    setSlot((now) => (now?.status === status && now.before === before ? now : { status, before }));
  }

  function handleDragStart(e: DragStartEvent) {
    const id = Number(e.active.id);
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const start = e.activatorEvent as PointerEvent;
    pointer.current = 'clientY' in start ? { x: start.clientX, y: start.clientY } : null;
    const column = byStatus[task.status];
    const home: DropSlot = {
      status: task.status,
      before: column[column.findIndex((t) => t.id === id) + 1]?.id ?? null,
    };
    const height =
      document.querySelector(`[data-task-card="${id}"]`)?.getBoundingClientRect().height ?? 0;
    onSelect(null);
    setActiveId(id);
    setHeld({ id, height, gone: false, landing: false, home });
    setSlot(home);
    // dnd-kit sizes the overlay from the card's first measure, so the card gives up its room after.
    requestAnimationFrame(() =>
      setHeld((now) => (now?.id === id && !now.landing ? { ...now, gone: true } : now)),
    );
  }

  function settle(id: number) {
    setHeld((now) => (now?.id === id && now.landing ? null : now));
  }

  function startLanding() {
    if (!held) return;
    setHeld({ ...held, landing: true });
    window.setTimeout(() => settle(held.id), LAND_MS * 3);
  }

  const land: DropAnimationFunction = ({ active, dragOverlay, transform }) => {
    const id = Number(active.id);
    const room = document.querySelector('[data-drop-slot]')?.getBoundingClientRect();
    if (!room) return settle(id);
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : LAND_MS;
    const options = { duration, easing: LAND_EASE, fill: 'forwards' as const };
    const x = transform.x + room.left - dragOverlay.rect.left;
    const y = transform.y + room.top - dragOverlay.rect.top;
    return dragOverlay.node
      .animate([{ transform: `translate3d(${x}px, ${y}px, 0)` }], options)
      .finished.then(() => settle(id));
  };

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    startLanding();
    const activeIdNum = Number(e.active.id);
    const dragged = tasks.find((t) => t.id === activeIdNum);
    if (!dragged || !slot) return;
    const position = dropPosition(fullByStatus[slot.status], activeIdNum, slot.before);
    // A genuine no-op (same column, same slot) sends nothing.
    if (dragged.status === slot.status) {
      const currentIndex = fullByStatus[slot.status].findIndex((t) => t.id === activeIdNum);
      if (currentIndex === position) return;
    }
    move.mutate({ id: activeIdNum, boardId: dragged.boardId, status: slot.status, position });
  }

  function handleDragCancel() {
    setActiveId(null);
    if (held) setSlot(held.home);
    startLanding();
  }

  /**
   * ПЕРЕЕЗД С ПЛИТКИ (статус в шапке). Та же мутация, что у драга; позиция — конец целевой
   * колонки по ПОЛНОЙ колонке. Квитанция с undo: индекс снят с полной исходной колонки ДО переезда.
   */
  function moveTo(task: Task, status: TaskStatus) {
    if (task.status === status) return;
    const prevStatus = task.status;
    const prevIndex = Math.max(
      0,
      fullByStatus[prevStatus].findIndex((t) => t.id === task.id),
    );
    const position = fullByStatus[status].filter((t) => t.id !== task.id).length;
    move.mutate(
      { id: task.id, boardId: task.boardId, status, position },
      {
        onSuccess: () =>
          notify({
            sev: 'ok',
            subject: `TASK ${task.id}`,
            text: `moved to ${COLUMN_LABEL[status]}`,
            action: {
              label: 'undo',
              onClick: () =>
                move.mutate({
                  id: task.id,
                  boardId: task.boardId,
                  status: prevStatus,
                  position: prevIndex,
                }),
            },
          }),
      },
    );
  }

  /** The tile's Department: the task goes to another board, its column and place kept. */
  function moveBoard(task: Task, boardId: number) {
    if (!boardId || task.boardId === boardId) return;
    const prev = task.boardId;
    const go = (to: number) =>
      move.mutate({ id: task.id, boardId: to, status: task.status, position: task.position });
    move.mutate(
      { id: task.id, boardId, status: task.status, position: task.position },
      {
        onSuccess: () =>
          notify({
            sev: 'ok',
            subject: `TASK ${task.id}`,
            text: 'department changed',
            action: { label: 'undo', onClick: () => go(prev) },
          }),
      },
    );
  }

  const renderTile = (task: Task, minimal: boolean) => {
    const isSelected = selected === task.id;
    return (
      <EditableTile
        task={task}
        variant={opened ? 'wide' : 'compact'}
        minimal={minimal}
        selected={isSelected}
        holding={holding === task.id}
        canWrite={canWrite}
        onStatus={moveTo}
        onBoard={moveBoard}
        onAddBoard={(t, name) =>
          void addBoard.mutateAsync(name).then(
            (created) => created.id && moveBoard(t, created.id),
            () => undefined,
          )
        }
        onRemove={canWrite ? () => setDeleting(task) : undefined}
        actions={{
          onEdit: () => onOpen(task, 'tile'),
          archived: !!task.archivedAt,
          onArchive: canWrite
            ? () => (task.archivedAt ? unarchive.mutate(task.id) : archive.mutate(task.id))
            : undefined,
          onDelete: canWrite ? () => setDeleting(task) : undefined,
        }}
      />
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cursorThenNearest}
      measuring={MEASURING}
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragMove={followCursor}
      onDragOver={followCursor}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className='flex h-full min-h-0 min-w-0 items-stretch gap-1'>
        <Button
          type='button'
          variant='default'
          aria-label={
            opened
              ? 'back to the board'
              : `previous column${at > 0 ? `: ${COLUMN_LABEL[STATUSES[at - 1]]}` : ''}`
          }
          title={opened ? 'close' : at > 0 ? COLUMN_LABEL[STATUSES[at - 1]] : undefined}
          disabled={!opened && (at <= 0 || compress)}
          onClick={() => (opened ? openStatus(null) : stepBy(-1))}
          className={cn(STEP, 'w-11')}
        >
          <Iconoir
            name={opened ? 'xmark' : 'nav-arrow-left'}
            strokeWidth={1.4}
            className='size-5'
          />
        </Button>
        <div
          ref={win}
          role='region'
          aria-label='taskboard'
          onTouchStart={(e) => {
            const t = e.touches[0];
            touch.current = t ? { x: t.clientX, y: t.clientY } : null;
          }}
          onTouchEnd={(e) => {
            const start = touch.current;
            const t = e.changedTouches[0];
            touch.current = null;
            if (!start || !t || opened) return;
            const dx = t.clientX - start.x;
            if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(t.clientY - start.y) * 2)
              stepBy(dx < 0 ? 1 : -1);
          }}
          className='min-h-0 min-w-0 flex-1 touch-none overflow-x-clip'
        >
          <div
            className={cn(
              'flex h-full items-stretch gap-1 will-change-transform',
              'transition-transform motion-reduce:transition-none',
              pace,
            )}
            style={{ transform: `translateX(${-at * (colWidth + GAP)}px)` }}
          >
            {STATUSES.map((status, i) => (
              <BoardColumn
                key={status}
                status={status}
                tasks={byStatus[status]}
                selected={selected}
                holding={holding}
                onSelect={onSelect}
                onOpen={onOpen}
                onHold={pressTile}
                onAdd={onAdd}
                onToggle={(s) => openStatus(opened === s ? null : s)}
                opened={opened === status}
                folded={folded}
                canWrite={canWrite}
                filtered={filtered}
                held={held}
                slot={held && slot?.status === status ? slot : null}
                renderTile={renderTile}
                style={{ width: colWidth || undefined }}
                className={cn(
                  'transition-[width,opacity] motion-reduce:transition-none',
                  pace,
                  (i < at || i >= at + shown) && 'pointer-events-none opacity-0',
                )}
              />
            ))}
          </div>
        </div>
        <Button
          type='button'
          variant='default'
          aria-label={`next column${at < maxIndex ? `: ${COLUMN_LABEL[STATUSES[at + shown]]}` : ''}`}
          title={at < maxIndex ? COLUMN_LABEL[STATUSES[at + shown]] : undefined}
          disabled={!!opened || at >= maxIndex || compress}
          onClick={() => stepBy(1)}
          className={cn(STEP, opened ? '-ml-1 w-0 opacity-0' : 'w-11')}
        >
          <Iconoir name='nav-arrow-right' strokeWidth={1.4} className='size-5' />
        </Button>
      </div>

      <DragOverlay dropAnimation={land}>
        {activeTask ? (
          <div className='cursor-grabbing'>
            <TaskTile task={activeTask} dragging />
          </div>
        ) : null}
      </DragOverlay>

      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={() => {
          const task = deleting;
          setDeleting(null);
          if (!task) return;
          del.mutate(task.id, { onSuccess: () => selected === task.id && onSelect(null) });
        }}
        title='delete task'
        confirmLabel='delete'
        width='sm'
      >
        <Text size='micro' component='span'>
          Delete “{deleting?.task.title}”? This can’t be undone.
        </Text>
      </ConfirmationModal>
    </DndContext>
  );
}
