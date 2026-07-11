import { cn } from 'lib/utility';
import Input from 'ui/components/input';
import SelectComponent from 'ui/components/select';
import { Task, TaskPriority, TaskStatus } from '../api/types';
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, STATUSES, toOptions } from '../utils/meta';

export interface TaskFilters {
  search: string;
  status: TaskStatus | '';
  priority: TaskPriority | '';
  mine: boolean;
}

export const emptyFilters: TaskFilters = { search: '', status: '', priority: '', mine: false };

export function filtersActive(f: TaskFilters): boolean {
  return f.search.trim() !== '' || f.status !== '' || f.priority !== '' || f.mine;
}

export function applyFilters(tasks: Task[], f: TaskFilters, currentUser?: string): Task[] {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.status && t.task.status !== f.status) return false;
    if (f.priority && t.task.priority !== f.priority) return false;
    if (f.mine && t.task.assignee !== currentUser) return false;
    if (q) {
      const hay = `${t.task.title} ${t.task.description} ${t.task.labels.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const ALL = '__all__';
const statusItems = [{ value: ALL, label: 'all columns' }, ...toOptions(STATUSES, STATUS_LABEL)];
const priorityItems = [{ value: ALL, label: 'all priorities' }, ...toOptions(PRIORITIES, PRIORITY_LABEL)];

export function FiltersBar({
  filters,
  onChange,
  showMine,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  showMine: boolean;
}) {
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Input
        name='task-search'
        placeholder='search…'
        className='w-40'
        value={filters.search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ search: e.target.value })}
      />

      <div className='w-36'>
        <SelectComponent
          name='status-filter'
          items={statusItems}
          value={filters.status === '' ? ALL : filters.status}
          onValueChange={(v: string) => set({ status: v === ALL ? '' : (v as TaskStatus) })}
          placeholder='all columns'
          fullWidth
        />
      </div>

      <div className='w-36'>
        <SelectComponent
          name='priority-filter'
          items={priorityItems}
          value={filters.priority === '' ? ALL : filters.priority}
          onValueChange={(v: string) => set({ priority: v === ALL ? '' : (v as TaskPriority) })}
          placeholder='all priorities'
          fullWidth
        />
      </div>

      {showMine && (
        <button
          type='button'
          onClick={() => set({ mine: !filters.mine })}
          className={cn(
            'border px-3 py-1 text-textBaseSize uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            filters.mine
              ? 'border-textColor bg-textColor text-bgColor'
              : 'border-textInactiveColor text-labelColor hover:border-textColor hover:text-textColor',
          )}
        >
          my tasks
        </button>
      )}

      {filtersActive(filters) && (
        <button
          type='button'
          onClick={() => onChange(emptyFilters)}
          className='px-2 text-textBaseSize uppercase text-labelColor underline hover:text-textColor'
        >
          clear
        </button>
      )}
    </div>
  );
}
