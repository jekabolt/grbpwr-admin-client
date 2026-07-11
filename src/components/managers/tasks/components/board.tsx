import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useMemo, useState } from 'react';
import { ListTasksFilter, Task, TaskStatus } from '../api/types';
import { useMoveTask } from '../hooks/useTasks';
import { STATUSES } from '../utils/meta';
import { BoardColumn } from './board-column';
import { TaskCardBody } from './task-card';

// Groups a board's tasks into ordered status columns and wires cross-column
// drag-and-drop to the optimistic MoveTask mutation.
export function Board({
  tasks,
  filter,
  onOpen,
  onAdd,
  canWrite,
  filtered,
}: {
  tasks: Task[];
  filter: ListTasksFilter;
  onOpen: (task: Task) => void;
  onAdd: (status: TaskStatus) => void;
  canWrite: boolean;
  filtered?: boolean;
}) {
  const move = useMoveTask(filter);
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byStatus = useMemo(() => {
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
  }, [tasks]);

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

    if (typeof over.id === 'string') {
      // Dropped onto a column (including empty ones): append to the end.
      targetStatus = over.id as TaskStatus;
      targetIndex = byStatus[targetStatus].filter((t) => t.id !== activeIdNum).length;
    } else {
      const overTask = tasks.find((t) => t.id === Number(over.id));
      if (!overTask) return;
      targetStatus = overTask.status;
      targetIndex = byStatus[targetStatus]
        .filter((t) => t.id !== activeIdNum)
        .findIndex((t) => t.id === overTask.id);
      if (targetIndex < 0) targetIndex = 0;
    }

    // Skip a genuine no-op (same column, same slot).
    if (dragged.status === targetStatus) {
      const currentIndex = byStatus[targetStatus].findIndex((t) => t.id === activeIdNum);
      if (currentIndex === targetIndex) return;
    }

    move.mutate({
      id: activeIdNum,
      board: dragged.board,
      status: targetStatus,
      position: targetIndex,
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        aria-label='task board columns'
        className='flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:snap-none'
      >
        {STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={byStatus[status]}
            onOpen={onOpen}
            onAdd={onAdd}
            canWrite={canWrite}
            filtered={filtered}
          />
        ))}
      </div>

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
