import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import { ListTasksFilter, Task, TaskBoard, TaskInsert, TaskStatus } from '../api/types';
import { tasksService } from '../api/tasksService';
import { applyMove } from '../utils/order';

type MaybeTask = Task | undefined;

export const tasksKeys = {
  all: ['tasks'] as const,
  list: (filter: ListTasksFilter) => [...tasksKeys.all, 'list', filter] as const,
  detail: (id: number) => [...tasksKeys.all, 'detail', id] as const,
  comments: (taskId: number) => [...tasksKeys.all, 'comments', taskId] as const,
};

type ListResult = { tasks: Task[]; total: number };

// ---- Reads ----

export function useTasks(filter: ListTasksFilter) {
  return useQuery({
    queryKey: tasksKeys.list(filter),
    queryFn: () => tasksService.listTasks(filter),
    staleTime: 30_000,
  });
}

export function useTask(id: number | null) {
  return useQuery({
    queryKey: tasksKeys.detail(id ?? -1),
    queryFn: () => tasksService.getTask(id as number),
    enabled: id != null && id > 0,
    staleTime: 30_000,
  });
}

export function useTaskComments(taskId: number | null) {
  return useQuery({
    queryKey: tasksKeys.comments(taskId ?? -1),
    queryFn: () => tasksService.listComments(taskId as number),
    enabled: taskId != null,
    staleTime: 15_000,
  });
}

// ---- Mutations ----

export function useCreateTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { content: TaskInsert; board: TaskBoard; status: TaskStatus }) =>
      tasksService.addTask(vars.content, vars.board, vars.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task created', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to create task', 'error'),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (vars: { id: number; content: TaskInsert }) =>
      tasksService.updateTask(vars.id, vars.content),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task saved', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save task', 'error'),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => tasksService.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task deleted', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to delete task', 'error'),
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => tasksService.archiveTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task archived', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to archive task', 'error'),
  });
}

export function useUnarchiveTask() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (id: number) => tasksService.unarchiveTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tasksKeys.all });
      showMessage('Task restored', 'success');
    },
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to restore task', 'error'),
  });
}

// ---- Checklist ----
// Items live on the task detail (Task.checklist). Mutations invalidate the whole
// `tasks` tree so the detail refetches and card progress badges refresh. The
// toggle is optimistic on the detail query for a snappy checkbox.

export function useAddChecklistItem(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (content: string) => tasksService.addChecklistItem(taskId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
    onError: (e) =>
      showMessage(e instanceof Error ? e.message : 'Failed to add checklist item', 'error'),
  });
}

export function useSetChecklistItemDone(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = tasksKeys.detail(taskId);
  return useMutation({
    mutationFn: (vars: { id: number; isDone: boolean }) =>
      tasksService.setChecklistItemDone(vars.id, vars.isDone),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MaybeTask>(key);
      if (previous) {
        qc.setQueryData<Task>(key, {
          ...previous,
          checklist: previous.checklist.map((c) =>
            c.id === vars.id ? { ...c, isDone: vars.isDone } : c,
          ),
        });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showMessage(e instanceof Error ? e.message : 'Failed to update checklist', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

export function useDeleteChecklistItem(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = tasksKeys.detail(taskId);
  return useMutation({
    mutationFn: (id: number) => tasksService.deleteChecklistItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MaybeTask>(key);
      if (previous) {
        qc.setQueryData<Task>(key, {
          ...previous,
          checklist: previous.checklist.filter((c) => c.id !== id),
        });
      }
      return { previous };
    },
    onError: (e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showMessage(e instanceof Error ? e.message : 'Failed to remove checklist item', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

// Optimistic drag-and-drop move. The board query for `filter` is patched
// immediately via the same applyMove the adapter uses, so the card lands in its
// new column with no flicker; a failure rolls back and re-syncs.
export function useMoveTask(filter: ListTasksFilter) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = tasksKeys.list(filter);
  return useMutation({
    mutationFn: (vars: { id: number; board: TaskBoard; status: TaskStatus; position: number }) =>
      tasksService.moveTask(vars.id, vars.board, vars.status, vars.position),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ListResult>(key);
      if (previous) {
        const tasks = applyMove(previous.tasks, vars.id, vars.status, vars.position);
        qc.setQueryData<ListResult>(key, { ...previous, tasks });
      }
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      showMessage(e instanceof Error ? e.message : 'Failed to move task', 'error');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

export function useAddComment(taskId: number) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  return useMutation({
    mutationFn: (body: string) => tasksService.addComment(taskId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.comments(taskId) }),
    onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to add comment', 'error'),
  });
}
