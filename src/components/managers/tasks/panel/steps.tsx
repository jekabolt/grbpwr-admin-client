import { cn } from 'lib/utility';
import { useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Button, Close, Iconoir, LineField } from 'ui';
import type { TaskChecklistItem } from '../api/types';
import { StepDot } from '../components/task-tile';
import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useSetChecklistItemDone,
} from '../hooks/useTasks';
import type { TaskPanelValues } from './task-session';

/** Every row that comes in slides open (owner: «плавная съезжающая анимация»). */
const ROW =
  'flex min-h-9 items-center gap-3 border-b border-hairline px-2 text-textBaseSize motion-safe:animate-[tasks-slide-in_700ms_var(--ease-soft)_both]';

type Row = {
  key: string;
  content: string;
  done: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
};

function StepRows({
  rows,
  writer,
  busy,
  onAdd,
}: {
  rows: Row[];
  writer: boolean;
  busy?: boolean;
  onAdd: (content: string) => Promise<boolean> | boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const submit = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    if (await onAdd(content)) setDraft('');
  };
  return (
    <div className='flex flex-col'>
      {rows.map((r) => (
        <div key={r.key} className={ROW}>
          <Button
            type='button'
            variant='default'
            role='checkbox'
            aria-checked={r.done}
            aria-label={r.done ? `mark "${r.content}" not done` : `mark "${r.content}" done`}
            disabled={!r.onToggle}
            onClick={r.onToggle}
            className='grid size-5 shrink-0 cursor-pointer place-items-center disabled:cursor-default'
          >
            <StepDot done={r.done} />
          </Button>
          <span
            className={cn(
              'min-w-0 flex-1 break-words py-2',
              r.done ? 'text-placeholder line-through' : 'text-labelDark',
            )}
          >
            {r.content}
          </span>
          {r.onRemove && (
            <Close size='sm' aria-label={`remove "${r.content}"`} onClick={r.onRemove} />
          )}
        </div>
      ))}
      {writer &&
        (adding ? (
          <div className='motion-safe:animate-[tasks-slide-in_700ms_var(--ease-soft)_both]'>
            <LineField
              name='new-step'
              label='New Step'
              autoFocus
              autoComplete='off'
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => !draft.trim() && setAdding(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  setDraft('');
                  setAdding(false);
                }
              }}
            />
          </div>
        ) : (
          <Button
            type='button'
            variant='default'
            onClick={() => setAdding(true)}
            className='flex min-h-9 w-full cursor-pointer items-center gap-3 border-b border-hairline px-2 text-left text-textBaseSize text-placeholder transition-colors duration-500 ease-soft hover:text-ink'
          >
            <Iconoir name='plus' strokeWidth={1.6} className='size-3' />
            Add a Checklist
          </Button>
        ))}
    </div>
  );
}

/** Steps of a stored task: the checklist RPCs, at once (a row's done state is its own). */
function StoredSteps({
  taskId,
  items,
  writer,
}: {
  taskId: number;
  items: TaskChecklistItem[];
  writer: boolean;
}) {
  const add = useAddChecklistItem(taskId);
  const toggle = useSetChecklistItemDone(taskId);
  const remove = useDeleteChecklistItem(taskId);
  const rows: Row[] = [...items]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      key: String(i.id),
      content: i.content,
      done: i.isDone,
      onToggle: writer ? () => toggle.mutate({ id: i.id, isDone: !i.isDone }) : undefined,
      onRemove: writer && !remove.isPending ? () => remove.mutate(i.id) : undefined,
    }));
  return (
    <StepRows
      rows={rows}
      writer={writer}
      busy={add.isPending}
      onAdd={async (content) => {
        try {
          await add.mutateAsync(content);
          return true;
        } catch {
          return false;
        }
      }}
    />
  );
}

/** Steps of a new task: kept in the form, added right after the create. */
function DraftSteps() {
  const { control } = useFormContext<TaskPanelValues>();
  const { field } = useController({ control, name: 'draftSteps' });
  const steps = (field.value ?? []) as string[];
  return (
    <StepRows
      writer
      rows={steps.map((content, i) => ({
        key: `${i}-${content}`,
        content,
        done: false,
        onRemove: () => field.onChange(steps.filter((_, j) => j !== i)),
      }))}
      onAdd={(content) => {
        field.onChange([...steps, content]);
        return true;
      }}
    />
  );
}

export function StepsFields({
  taskId,
  items,
  writer,
}: {
  taskId?: number;
  items?: TaskChecklistItem[];
  writer: boolean;
}) {
  return taskId ? (
    <StoredSteps taskId={taskId} items={items ?? []} writer={writer} />
  ) : (
    <DraftSteps />
  );
}
