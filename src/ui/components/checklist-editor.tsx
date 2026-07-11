import { useState } from 'react';
import { cn } from 'lib/utility';
import { Button } from './button';
import Input from './input';
import Text from './text';

export interface ChecklistItemLike {
  id: number;
  content: string;
  isDone: boolean;
}

// Presentational checklist: a progress header, a list of toggleable rows with a
// hover delete, and an add row. Pure — the caller wires each callback to its own
// mutation (task checklist, fulfillment packing checklist, …). Monochrome, keyed
// to the design tokens.
export function ChecklistEditor({
  label,
  items,
  canWrite,
  onToggle,
  onDelete,
  onAdd,
  adding,
  addPlaceholder = 'Add an item…',
  emptyLabel = 'No items.',
}: {
  label: string;
  items: ChecklistItemLike[];
  canWrite: boolean;
  onToggle: (id: number, isDone: boolean) => void;
  onDelete: (id: number) => void;
  onAdd: (content: string) => void | Promise<void>;
  adding?: boolean;
  addPlaceholder?: string;
  emptyLabel?: string;
}) {
  const [draft, setDraft] = useState('');

  const done = items.filter((i) => i.isDone).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  async function submit() {
    const content = draft.trim();
    if (!content || adding) return; // guard against a double-submit (two fast Enters)
    await onAdd(content);
    setDraft('');
  }

  return (
    <section className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <Text variant='uppercase' size='small' className='text-labelColor'>
          {label}
          {total ? ` · ${done}/${total}` : ''}
        </Text>
        {total > 0 && (
          <div
            className='h-1 w-24 shrink-0 bg-textInactiveColor'
            role='progressbar'
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} progress`}
          >
            <div
              className='h-full bg-textColor transition-[width] duration-200'
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      {total > 0 && (
        <ul className='flex flex-col'>
          {items.map((item) => (
            <li
              key={item.id}
              className='group flex items-center gap-2 border-b border-textInactiveColor py-1.5 last:border-b-0'
            >
              <button
                type='button'
                role='checkbox'
                aria-checked={item.isDone}
                aria-label={
                  item.isDone ? `mark "${item.content}" not done` : `mark "${item.content}" done`
                }
                disabled={!canWrite}
                onClick={() => onToggle(item.id, !item.isDone)}
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center border border-textInactiveColor text-[10px] leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                  item.isDone ? 'bg-textColor text-bgColor' : 'bg-bgColor text-transparent',
                  !canWrite && 'cursor-default opacity-70',
                )}
              >
                ✓
              </button>
              <Text
                size='small'
                className={cn(
                  'min-w-0 flex-1 break-words',
                  item.isDone && 'text-labelColor line-through',
                )}
              >
                {item.content}
              </Text>
              {canWrite && (
                <button
                  type='button'
                  aria-label={`remove "${item.content}"`}
                  onClick={() => onDelete(item.id)}
                  className='shrink-0 px-1 text-labelColor opacity-0 transition-opacity hover:text-textColor focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor group-hover:opacity-100'
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <div className='flex items-center gap-2'>
          <Input
            name='new-checklist-item'
            aria-label={addPlaceholder}
            placeholder={addPlaceholder}
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='shrink-0'
            loading={adding}
            disabled={!draft.trim() || adding}
            onClick={submit}
          >
            add
          </Button>
        </div>
      ) : (
        total === 0 && (
          <Text variant='label' size='small'>
            {emptyLabel}
          </Text>
        )
      )}
    </section>
  );
}
