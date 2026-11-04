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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Board as BoardRow, Button, Text } from 'ui';
import { ListTasksFilter, Task, TaskStatus } from '../api/types';
import { useMoveTask } from '../hooks/useTasks';
import { STATUS_LABEL, STATUSES } from '../utils/meta';
import { BoardColumn, HeldCard } from './board-column';
import { cursorThenNearest, dropPosition, DropSlot, keyboardStep, slotBefore } from './board-drag';
import { TaskCardBody } from './task-card';

const PHONE_STATUS_KEY = 'grbpwr.kanban.phoneStatus';
const LAND_MS = 180;
const LAND_EASE = 'cubic-bezier(.2,.8,.2,1)';
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };
const PHONE_STATUS_LABEL: Record<TaskStatus, string> = {
  TASK_STATUS_UNKNOWN: 'unknown',
  TASK_STATUS_BACKLOG: 'backlog',
  TASK_STATUS_TODO: 'to do',
  TASK_STATUS_IN_PROGRESS: 'doing',
  TASK_STATUS_REVIEW: 'review',
  TASK_STATUS_DONE: 'done',
};

/**
 * ДРАГ — ТОЛЬКО МЫШЬЮ/ПЕРОМ. На телефоне палец, начавший жест на карточке, обязан листать
 * страницу, а не поднимать карточку: TouchSensor снят, а PointerSensor (он ловит и касания —
 * pointer events общие) отсекает `pointerType === 'touch'`. Переезд на телефоне — через pill
 * статуса или горизонтальный жест на самой карточке.
 */
class MousePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (event: React.PointerEvent, options: PointerSensorOptions) =>
        event.nativeEvent.pointerType !== 'touch' &&
        PointerSensor.activators[0].handler(event, options),
    },
  ];
}

function readPhoneStatus(): TaskStatus {
  try {
    const v = sessionStorage.getItem(PHONE_STATUS_KEY) as TaskStatus | null;
    if (v && STATUSES.includes(v)) return v;
  } catch {
    /* storage blocked — default tab */
  }
  return 'TASK_STATUS_TODO';
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

function PhoneStatusStrip({
  value,
  counts,
  onChange,
}: {
  value: TaskStatus;
  counts: Record<TaskStatus, Task[]>;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <div
      role='tablist'
      aria-label='status'
      className='sticky top-14 z-[var(--z-sticky)] -mx-2.5 grid grid-cols-5 overflow-hidden border-y border-hairline bg-bgColor sm:hidden'
    >
      {STATUSES.map((status) => {
        const selected = status === value;
        return (
          <Button
            key={status}
            role='tab'
            aria-selected={selected}
            onClick={() => onChange(status)}
            className={
              selected
                ? '!flex h-13 min-w-0 flex-col items-center justify-center gap-0.5 border-b-2 border-textColor px-0 text-textColor'
                : '!flex h-13 min-w-0 flex-col items-center justify-center gap-0.5 border-b-2 border-bgColor px-0 text-labelColor hover:text-textColor'
            }
          >
            <Text
              size='micro'
              variant='uppercase'
              tracking='pill'
              component='span'
              className='!text-inherit'
            >
              {PHONE_STATUS_LABEL[status]}
            </Text>
            <Text component='span' className='font-bold tabular-nums !text-inherit'>
              {counts[status].length}
            </Text>
          </Button>
        );
      })}
    </div>
  );
}

// Groups a board's tasks into ordered status columns and wires cross-column
// drag-and-drop to the optimistic MoveTask mutation.
export function Board({
  tasks,
  allTasks,
  filter,
  onOpen,
  onAdd,
  canWrite,
  filtered,
}: {
  /** The cards actually rendered (client-filtered by priority / "my tasks"). */
  tasks: Task[];
  /**
   * The unfiltered column contents. MoveTask's `position` — and applyMove's optimistic patch — are
   * applied to the FULL cached column, so a drop index derived from the visible subset lands the
   * card in the wrong slot whenever a filter hides cards above it. Defaults to `tasks` when no
   * filter is in play.
   */
  allTasks?: Task[];
  filter: ListTasksFilter;
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
  canWrite: boolean;
  filtered?: boolean;
}) {
  const move = useMoveTask(filter);
  const [activeId, setActiveId] = useState<number | null>(null);
  // Outlives the drag by the landing: the slot stays open until the card has settled into it.
  const [held, setHeld] = useState<(HeldCard & { landing: boolean; home: DropSlot }) | null>(null);
  const [slot, setSlot] = useState<DropSlot | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  // Телефон (< sm) показывает ОДНУ колонку; какая — помнит вкладка.
  const [phoneStatus, setPhoneStatus] = useState<TaskStatus>(readPhoneStatus);
  useEffect(() => {
    try {
      sessionStorage.setItem(PHONE_STATUS_KEY, phoneStatus);
    } catch {
      /* storage blocked */
    }
  }, [phoneStatus]);

  const sensors = useSensors(
    useSensor(MousePointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardStep }),
  );

  // What the operator sees…
  const byStatus = useMemo(() => groupByStatus(tasks), [tasks]);
  // …and what the server will re-sequence. Drop positions are computed against this.
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

  // The slot follows the cursor itself, so a tall card with its middle far away still lands where
  // it is pointed. The keyboard has no cursor: there the held card's own middle stands in.
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
    dragOverlay.node.firstElementChild?.animate([{ rotate: '0deg' }], options);
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

    // Taken from the FULL column, not the rendered one: the position we send is applied to the
    // full column server-side, so measuring it on a filtered subset would drop the card above
    // every hidden card that still occupies a slot.
    const position = dropPosition(fullByStatus[slot.status], activeIdNum, slot.before);

    // Skip a genuine no-op (same column, same slot).
    if (dragged.status === slot.status) {
      const currentIndex = fullByStatus[slot.status].findIndex((t) => t.id === activeIdNum);
      if (currentIndex === position) return;
    }

    move.mutate({
      id: activeIdNum,
      boardId: dragged.boardId,
      status: slot.status,
      position,
    });
  }

  function handleDragCancel() {
    setActiveId(null);
    if (held) setSlot(held.home);
    startLanding();
  }

  /**
   * ПЕРЕЕЗД С КАРТОЧКИ. Та же мутация, что у драга, и позиция — КОНЕЦ целевой
   * колонки, посчитанный по ПОЛНОЙ колонке (довод — в handleDragEnd). На телефоне карточка уходит
   * из видимой колонки, поэтому квитанция с undo: индекс снят с полной исходной колонки ДО
   * переезда — вставка по тому же индексу ставит её на место.
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
            text: `moved to ${STATUS_LABEL[status]}`,
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={cursorThenNearest}
      measuring={MEASURING}
      onDragStart={handleDragStart}
      onDragMove={followCursor}
      onDragOver={followCursor}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* On a phone one status names the visible list; the strip stays under the 48px nav. */}
      <PhoneStatusStrip value={phoneStatus} counts={byStatus} onChange={setPhoneStatus} />

      <BoardRow className='block gap-4 overflow-visible pb-4 sm:flex sm:overflow-x-auto'>
        {STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={byStatus[status]}
            onOpen={onOpen}
            onAdd={onAdd}
            onMove={moveTo}
            canWrite={canWrite}
            filtered={filtered}
            held={held}
            slot={held && slot?.status === status ? slot : null}
            className={status === phoneStatus ? undefined : 'max-sm:hidden'}
          />
        ))}
      </BoardRow>

      <DragOverlay dropAnimation={land}>
        {activeTask ? (
          <div className='rotate-1 cursor-grabbing'>
            <TaskCardBody task={activeTask} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
