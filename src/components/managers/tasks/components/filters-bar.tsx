import { Chip, ChipRow } from 'ui/components/chip';
import { Task, TaskPriority } from '../api/types';
import { PRIORITIES, PRIORITY_LABEL } from '../utils/meta';

/**
 * tskFilters v2 — the filter row is CHIPS, not selects. Priority is a single-select
 * chip group (click the lit one to clear it), "my tasks" scopes to the signed-in
 * assignee, and — tskArchive v3 — archived is just another chip here rather than a
 * whole-board mode flip. The old search box + column/priority selects are gone: a
 * board already IS its columns, so a status filter only emptied them, and free-text
 * search over six cards a column earned less than the chrome it cost.
 */

export interface TaskFilters {
  priority: TaskPriority | '';
  mine: boolean;
}

export const emptyFilters: TaskFilters = { priority: '', mine: false };

export function filtersActive(f: TaskFilters): boolean {
  return f.priority !== '' || f.mine;
}

export function applyFilters(tasks: Task[], f: TaskFilters, currentUser?: string): Task[] {
  return tasks.filter((t) => {
    if (f.priority && t.task.priority !== f.priority) return false;
    if (f.mine && t.task.assignee !== currentUser) return false;
    return true;
  });
}

export function FiltersBar({
  filters,
  onChange,
  showMine,
  showArchived,
  onToggleArchived,
  onClear,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  showMine: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  onClear: () => void;
}) {
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  const dirty = filtersActive(filters) || showArchived;

  return (
    <ChipRow className='gap-1.5'>
      {PRIORITIES.map((p) => {
        const on = filters.priority === p;
        return (
          <Chip
            key={p}
            selected={on}
            pressed={on}
            onClick={() => set({ priority: on ? '' : p })}
          >
            {PRIORITY_LABEL[p]}
          </Chip>
        );
      })}

      {showMine && (
        <Chip selected={filters.mine} pressed={filters.mine} onClick={() => set({ mine: !filters.mine })}>
          my tasks
        </Chip>
      )}

      <Chip selected={showArchived} pressed={showArchived} onClick={onToggleArchived}>
        archived
      </Chip>

      {dirty && (
        <button
          type='button'
          onClick={onClear}
          className='ml-1 text-micro uppercase tracking-label text-labelColor underline hover:text-textColor'
        >
          clear
        </button>
      )}
    </ChipRow>
  );
}
