import type { Task } from '../api/types';
import type { TaskPickMode } from '../components/task-board-picker';

export type PickState = 'ok' | 'self' | 'linked' | 'cycle' | 'done';

function related(task: Task, candidate: Task, mode: TaskPickMode): boolean {
  if (mode === 'subtask') return candidate.parentTaskId === task.id;

  if (mode === 'link') {
    return (
      task.relations.some((relation) => relation.taskId === candidate.id) ||
      candidate.relations.some((relation) => relation.taskId === task.id)
    );
  }

  return (
    task.relations.some(
      (relation) =>
        relation.taskId === candidate.id && relation.kind === 'TASK_LINK_KIND_BLOCKED_BY',
    ) ||
    candidate.relations.some(
      (relation) => relation.taskId === task.id && relation.kind === 'TASK_LINK_KIND_BLOCKS',
    )
  );
}

/** Directed edges point from a blocked task to each task that blocks it. */
function blockerGraph(task: Task, candidate: Task, all: Task[]): Map<number, Set<number>> {
  const tasks = new Map(all.map((item) => [item.id, item]));
  tasks.set(task.id, task);
  tasks.set(candidate.id, candidate);

  const graph = new Map<number, Set<number>>();
  const add = (blockedId: number, blockerId: number) => {
    if (blockedId <= 0 || blockerId <= 0) return;
    const blockers = graph.get(blockedId) ?? new Set<number>();
    blockers.add(blockerId);
    graph.set(blockedId, blockers);
  };

  for (const item of tasks.values()) {
    for (const relation of item.relations) {
      if (relation.kind === 'TASK_LINK_KIND_BLOCKED_BY') add(item.id, relation.taskId);
      if (relation.kind === 'TASK_LINK_KIND_BLOCKS') add(relation.taskId, item.id);
    }
  }
  return graph;
}

function reaches(graph: Map<number, Set<number>>, from: number, target: number): boolean {
  const pending = [...(graph.get(from) ?? [])];
  const seen = new Set<number>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(graph.get(id) ?? []));
  }
  return false;
}

function isAncestor(candidate: Task, task: Task, all: Task[]): boolean {
  const byId = new Map(all.map((item) => [item.id, item]));
  byId.set(task.id, task);
  byId.set(candidate.id, candidate);

  const seen = new Set<number>();
  let parentId = task.parentTaskId;
  while (parentId > 0 && !seen.has(parentId)) {
    if (parentId === candidate.id) return true;
    seen.add(parentId);
    parentId = byId.get(parentId)?.parentTaskId ?? 0;
  }
  return false;
}

export function pickStateOf(
  candidate: Task,
  task: Task,
  mode: TaskPickMode,
  all: Task[],
): PickState {
  if (candidate.id === task.id) return 'self';
  if (related(task, candidate, mode)) return 'linked';

  if (
    (mode === 'blocker' && reaches(blockerGraph(task, candidate, all), candidate.id, task.id)) ||
    (mode === 'subtask' && isAncestor(candidate, task, all))
  ) {
    return 'cycle';
  }

  if (mode === 'blocker' && candidate.status === 'TASK_STATUS_DONE') return 'done';
  return 'ok';
}
