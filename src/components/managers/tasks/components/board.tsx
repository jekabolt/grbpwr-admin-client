import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  PointerSensorOptions,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Board as BoardRow, ViewSwitch } from 'ui';
import { ListTasksFilter, Task, TaskStatus } from '../api/types';
import { useMoveTask } from '../hooks/useTasks';
import { STATUS_LABEL, STATUSES } from '../utils/meta';
import { BoardColumn } from './board-column';
import { TaskCardBody } from './task-card';

const PHONE_STATUS_KEY = 'grbpwr.kanban.phoneStatus';

/**
 * ДРАГ — ТОЛЬКО МЫШЬЮ/ПЕРОМ. На телефоне палец, начавший жест на карточке, обязан листать
 * страницу, а не поднимать карточку: TouchSensor снят, а PointerSensor (он ловит и касания —
 * pointer events общие) отсекает `pointerType === 'touch'`. Переезд на телефоне — через select
 * статуса на самой карточке.
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

function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
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
  const { showMessage } = useSnackBarStore();
  const [activeId, setActiveId] = useState<number | null>(null);
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // What the operator sees…
  const byStatus = useMemo(() => groupByStatus(tasks), [tasks]);
  // …and what the server will re-sequence. Drop positions are computed against this.
  const fullByStatus = useMemo(() => groupByStatus(allTasks ?? tasks), [allTasks, tasks]);

  const activeTask = activeId != null ? tasks.find((t) => t.id === activeId) : undefined;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const activeIdNum = Number(active.id);
    const dragged = tasks.find((t) => t.id === activeIdNum);
    if (!dragged) return;

    let targetStatus: TaskStatus;
    let targetIndex: number;

    // Every index below is taken from the FULL column, not the rendered one: the position we send
    // is applied to the full column server-side, so measuring it on a filtered subset would drop
    // the card above every hidden card that still occupies a slot.
    if (typeof over.id === 'string') {
      // Dropped onto a column (including empty ones): append to the end.
      targetStatus = over.id as TaskStatus;
      targetIndex = fullByStatus[targetStatus].filter((t) => t.id !== activeIdNum).length;
    } else {
      const overTask = tasks.find((t) => t.id === Number(over.id));
      if (!overTask) return;
      targetStatus = overTask.status;
      targetIndex = fullByStatus[targetStatus]
        .filter((t) => t.id !== activeIdNum)
        .findIndex((t) => t.id === overTask.id);
      if (targetIndex < 0) targetIndex = 0;
    }

    // Skip a genuine no-op (same column, same slot).
    if (dragged.status === targetStatus) {
      const currentIndex = fullByStatus[targetStatus].findIndex((t) => t.id === activeIdNum);
      if (currentIndex === targetIndex) return;
    }

    move.mutate({
      id: activeIdNum,
      board: dragged.board,
      status: targetStatus,
      position: targetIndex,
    });
  }

  /**
   * ПЕРЕЕЗД ИЗ SELECT'А НА КАРТОЧКЕ. Та же мутация, что у драга, и позиция — КОНЕЦ целевой
   * колонки, посчитанный по ПОЛНОЙ колонке (довод — в handleDragEnd). Undo возвращает карточку
   * в её прежний слот: индекс снят с полной исходной колонки ДО переезда, а после переезда в
   * ней ровно на одну карточку меньше — вставка по тому же индексу ставит её на место.
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
      { id: task.id, board: task.board, status, position },
      {
        onSuccess: () =>
          showMessage(`moved to ${STATUS_LABEL[status]}`, 'success', {
            label: 'undo',
            onClick: () =>
              move.mutate({
                id: task.id,
                board: task.board,
                status: prevStatus,
                position: prevIndex,
              }),
          }),
      },
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {/* Телефон: полоса статусов липнет под шапкой (h-12 + top-2 = top-14), колонка под ней
          одна и во всю ширину. С sm — пять колонок, как были. */}
      <div className='sticky top-14 z-[var(--z-sticky)] -mx-2.5 overflow-x-auto bg-pageBg px-2.5 pb-2 sm:hidden'>
        <ViewSwitch
          label='status'
          value={phoneStatus}
          onChange={setPhoneStatus}
          options={STATUSES.map((s) => ({
            value: s,
            label: `${STATUS_LABEL[s]} ${byStatus[s].length}`,
          }))}
          className='h-11 whitespace-nowrap'
        />
      </div>

      <BoardRow className='block gap-4 pb-4 sm:flex'>
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
            className={status === phoneStatus ? undefined : 'max-sm:hidden'}
          />
        ))}
      </BoardRow>

      <DragOverlay>
        {activeTask ? (
          <div className='w-72 rotate-1'>
            <TaskCardBody task={activeTask} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
