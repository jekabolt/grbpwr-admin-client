import { kindDef } from 'components/managers/tech-card/annotation/kinds';
import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Chip, ChipRow, Textarea } from 'ui';
import { useAddEdit } from './use-add-edit';
import { useFittingWorkspace } from './workspace';

// One line that grows with the text, capped; the field scrolls past the cap.
const MAX_HEIGHT = 120;

export function EditComposer({ nextNumber }: { nextNumber: number }) {
  const { pendingMark, setPendingMark } = useFittingWorkspace();
  const addEdit = useAddEdit();
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + borders, MAX_HEIGHT)}px`;
  }, [text]);

  const submit = () => {
    const note = text.trim();
    if (!note) return;
    const mark = pendingMark;
    setText('');
    setPendingMark(null);
    addEdit({ note, mark }).then(
      (n) =>
        requestAnimationFrame(() =>
          document.querySelector(`[data-edit-row="${n}"]`)?.scrollIntoView({ block: 'nearest' }),
        ),
      // A text-only edit lives only in this field until it is stored: give it back. A marked one
      // already sits on the photo with its note.
      () => {
        if (!mark) setText((cur) => cur || note);
      },
    );
  };

  return (
    <div className='mt-2.5 grid gap-1.5 border-t border-textColor pt-2.5'>
      {pendingMark && (
        <ChipRow>
          <Chip tone='attention' onRemove={() => setPendingMark(null)}>
            {nextNumber} · {kindDef(pendingMark.kind).label}
          </Chip>
        </ChipRow>
      )}
      <div className='flex items-end gap-1.5'>
        <Textarea
          ref={ref}
          name='fitting-composer'
          data-fitting-composer=''
          aria-label='what to fix'
          placeholder='what to fix'
          rows={1}
          autoGrow={false}
          value={text}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape' && pendingMark) {
              e.preventDefault();
              setPendingMark(null);
            }
          }}
          className='min-h-6 min-w-0 flex-1 resize-none overflow-y-auto leading-4'
        />
        <Button
          type='button'
          variant='main'
          size='sm'
          className='h-6 flex-none py-0'
          disabled={!text.trim()}
          onClick={submit}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
