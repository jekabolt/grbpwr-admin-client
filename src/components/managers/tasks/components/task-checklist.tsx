import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';
import { AddDoor, Button, Close, Input, Progress, Section, Text } from 'ui';
import { TaskChecklistItem } from '../api/types';
import {
  useAddChecklistItem,
  useDeleteChecklistItem,
  useSetChecklistItemDone,
} from '../hooks/useTasks';

// Subtask checklist for the task detail. Items are managed by dedicated RPCs
// (add / toggle / delete), so editing them never touches the task's content —
// per-item done state survives a content edit.
//
// detail v2: «N of M» in the header over a 4px rail; the WHOLE row is the tick target (one tap,
// 44px on a phone), and the add field exists only after «+ item» is pressed — an always-open
// empty input read as a form to fill, not as a list.
export function TaskChecklist({
  taskId,
  items,
  canWrite,
  className,
}: {
  taskId: number;
  items: TaskChecklistItem[];
  canWrite: boolean;
  className?: string;
}) {
  const add = useAddChecklistItem(taskId);
  const toggle = useSetChecklistItemDone(taskId);
  const remove = useDeleteChecklistItem(taskId);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) requestAnimationFrame(() => inputRef.current?.focus());
  }, [adding]);

  const total = items.length;
  const done = items.filter((i) => i.isDone).length;

  // Nothing to read and nothing to do: a reader sees no empty block.
  if (!canWrite && total === 0) return null;

  async function submit() {
    const content = draft.trim();
    // Guard against a double-submit (two fast Enters).
    if (!content || add.isPending) return;
    try {
      await add.mutateAsync(content);
      // The field stays open for the next item; Esc or «cancel» closes it.
      setDraft('');
    } catch {
      /* snackbar shown by the mutation */
    }
  }

  function close() {
    setAdding(false);
    setDraft('');
  }

  return (
    <Section
      title='checklist'
      className={className}
      action={
        total > 0 ? (
          <Text size='micro' variant='label' component='span' className='tabular-nums'>
            {done} of {total}
          </Text>
        ) : undefined
      }
    >
      {total > 0 && <Progress value={(done / total) * 100} />}

      {total > 0 && (
        <ul className='flex flex-col'>
          {items.map((item) => (
            <li
              key={item.id}
              className='flex items-center gap-2 border-b border-hairline last:border-b-0'
            >
              <Button
                type='button'
                variant='default'
                role='checkbox'
                aria-checked={item.isDone}
                aria-label={
                  item.isDone ? `mark "${item.content}" not done` : `mark "${item.content}" done`
                }
                disabled={!canWrite}
                onClick={() => toggle.mutate({ id: item.id, isDone: !item.isDone })}
                className='flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-1 text-left disabled:cursor-default disabled:opacity-100 sm:min-h-8'
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center border border-textColor text-micro leading-none',
                    item.isDone ? 'bg-textColor text-bgColor' : 'bg-bgColor text-transparent',
                  )}
                >
                  ✓
                </span>
                <Text
                  component='span'
                  className={cn(
                    'min-w-0 flex-1 break-words',
                    item.isDone && 'text-labelColor line-through',
                  )}
                >
                  {item.content}
                </Text>
              </Button>
              {canWrite && (
                <Close
                  size='sm'
                  aria-label={`remove "${item.content}"`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                  className='min-h-11 min-w-11 sm:min-h-0 sm:min-w-0'
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite &&
        (adding ? (
          <div className='flex items-center gap-2'>
            <Input
              ref={inputRef}
              name='new-checklist-item'
              aria-label='new checklist item'
              placeholder='new item'
              value={draft}
              className='min-h-11 min-w-0 flex-1 sm:min-h-0'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  close();
                }
              }}
            />
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='min-h-11 shrink-0 sm:min-h-0'
              loading={add.isPending}
              disabled={!draft.trim() || add.isPending}
              onClick={submit}
            >
              add
            </Button>
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='min-h-11 shrink-0 sm:min-h-0'
              onClick={close}
            >
              cancel
            </Button>
          </div>
        ) : (
          <AddDoor className='min-h-11 sm:min-h-0' onClick={() => setAdding(true)}>
            item
          </AddDoor>
        ))}
    </Section>
  );
}
