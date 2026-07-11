import { Task, TaskStatus } from '../api/types';

// Pure re-sequencing used by the optimistic cache patch in useMoveTask, so the
// board reorders instantly and matches what the server re-sequences on MoveTask.
// Moves `id` into `targetStatus` at `targetPosition` and renumbers positions to
// 0..n-1 within each affected column of the moving card's board. Board is
// unchanged (the board DnD never crosses boards); other boards and untouched
// columns are returned as-is.
export function applyMove(
  tasks: Task[],
  id: number,
  targetStatus: TaskStatus,
  targetPosition: number,
): Task[] {
  const moving = tasks.find((t) => t.id === id);
  if (!moving) return tasks;

  const board = moving.board;
  const sourceStatus = moving.status;

  const otherBoards = tasks.filter((t) => t.board !== board);
  const boardTasks = tasks.filter((t) => t.board === board && t.id !== id);

  // Rebuild the target column with the moving card inserted at the clamped index.
  const targetCol = boardTasks
    .filter((t) => t.status === targetStatus)
    .sort((a, b) => a.position - b.position);
  const clamped = Math.max(0, Math.min(targetPosition, targetCol.length));
  targetCol.splice(clamped, 0, { ...moving, status: targetStatus });
  const reindexedTarget = targetCol.map((t, i) => ({ ...t, position: i }));

  // If the card changed columns, renumber the source column (it left a gap).
  const reindexedSource =
    sourceStatus === targetStatus
      ? []
      : boardTasks
          .filter((t) => t.status === sourceStatus)
          .sort((a, b) => a.position - b.position)
          .map((t, i) => ({ ...t, position: i }));

  const touched = new Set([...reindexedTarget, ...reindexedSource].map((t) => t.id));
  const untouchedBoard = boardTasks.filter((t) => !touched.has(t.id));

  return [...otherBoards, ...untouchedBoard, ...reindexedTarget, ...reindexedSource];
}
