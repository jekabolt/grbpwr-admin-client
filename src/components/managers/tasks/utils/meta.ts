import { differenceInCalendarDays, format, isToday } from 'date-fns';
import { TaskBoard, TaskPriority, TaskStatus } from '../api/types';

// Display order + labels for the board taxonomy. Kept out of the components so
// there is one source of truth for tabs, columns, selects and filters.

export const BOARDS: TaskBoard[] = [
  'TASK_BOARD_DEVELOPMENT',
  'TASK_BOARD_DESIGN',
  'TASK_BOARD_MARKETING',
  'TASK_BOARD_PRODUCTION',
  'TASK_BOARD_SOURCING',
  'TASK_BOARD_CONTENT',
];

export const BOARD_LABEL: Record<TaskBoard, string> = {
  TASK_BOARD_UNKNOWN: 'unknown',
  TASK_BOARD_DEVELOPMENT: 'development',
  TASK_BOARD_DESIGN: 'design',
  TASK_BOARD_MARKETING: 'marketing',
  TASK_BOARD_PRODUCTION: 'production',
  TASK_BOARD_SOURCING: 'sourcing',
  TASK_BOARD_CONTENT: 'content',
};

export const STATUSES: TaskStatus[] = [
  'TASK_STATUS_BACKLOG',
  'TASK_STATUS_TODO',
  'TASK_STATUS_IN_PROGRESS',
  'TASK_STATUS_REVIEW',
  'TASK_STATUS_DONE',
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TASK_STATUS_UNKNOWN: 'unknown',
  TASK_STATUS_BACKLOG: 'backlog',
  TASK_STATUS_TODO: 'to do',
  TASK_STATUS_IN_PROGRESS: 'in progress',
  TASK_STATUS_REVIEW: 'review',
  TASK_STATUS_DONE: 'done',
};

export const PRIORITIES: TaskPriority[] = [
  'TASK_PRIORITY_LOW',
  'TASK_PRIORITY_MEDIUM',
  'TASK_PRIORITY_HIGH',
  'TASK_PRIORITY_URGENT',
];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  TASK_PRIORITY_UNKNOWN: 'none',
  TASK_PRIORITY_LOW: 'low',
  TASK_PRIORITY_MEDIUM: 'medium',
  TASK_PRIORITY_HIGH: 'high',
  TASK_PRIORITY_URGENT: 'urgent',
};

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  TASK_PRIORITY_UNKNOWN: 0,
  TASK_PRIORITY_LOW: 1,
  TASK_PRIORITY_MEDIUM: 2,
  TASK_PRIORITY_HIGH: 3,
  TASK_PRIORITY_URGENT: 4,
};

export function toOptions<T extends string>(values: T[], labels: Record<T, string>) {
  return values.map((v) => ({ value: v as string, label: labels[v] }));
}

export type DueState = 'none' | 'today' | 'overdue' | 'soon' | 'later';

// Human due-date summary + a semantic state for colour. "soon" = within 2 days.
export function dueMeta(dueDate?: string): { label: string; state: DueState } {
  if (!dueDate) return { label: '', state: 'none' };
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return { label: '', state: 'none' };
  const days = differenceInCalendarDays(date, new Date());
  if (isToday(date)) return { label: 'today', state: 'today' };
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, state: 'overdue' };
  if (days <= 2) return { label: format(date, 'MMM d'), state: 'soon' };
  return { label: format(date, 'MMM d'), state: 'later' };
}
