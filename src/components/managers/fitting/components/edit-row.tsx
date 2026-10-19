import { cn } from 'lib/utility';
import { CheckboxCommon, EmptyCell, Pin, Select } from 'ui';
import { EditRow } from './edit-rows';

export const EDIT_CATEGORIES = ['', 'pattern', 'construction', 'material', 'grading', 'other'];

// The select shows one of the five categories; a legacy free-text target («sleeve») reads as
// «other» but is sent back untouched until someone picks a category.
export function categoryValue(target: string): string {
  const t = target.trim().toLowerCase();
  if (!t) return '';
  return EDIT_CATEGORIES.includes(t) ? t : 'other';
}

// The number cell: a pin when the edit has a mark, a dashed square when it is text only.
export function EditNumber({
  n,
  hasMark,
  hot,
  tone,
}: {
  n: React.ReactNode;
  hasMark: boolean;
  hot?: boolean;
  tone?: 'attention';
}) {
  if (hasMark)
    return (
      <span className='relative block size-4 flex-none'>
        <Pin x={50} y={50} label={n} highlighted={hot} />
      </span>
    );
  return (
    <span
      className={cn(
        'flex size-4 flex-none items-center justify-center border border-dashed text-nano tabular-nums leading-none',
        tone === 'attention' ? 'border-warning text-warning' : 'border-borderColor text-labelColor',
      )}
    >
      {n}
    </span>
  );
}

export function EditRowItem({
  row,
  hot,
  busy,
  readOnly,
  onOpen,
  onHover,
  onCategory,
  onResolved,
}: {
  row: EditRow;
  hot: boolean;
  busy: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onHover: (on: boolean) => void;
  onCategory: (target: string) => void;
  onResolved: (resolved: boolean) => void;
}) {
  const resolved = row.status === 'resolved';
  const cat = categoryValue(row.target);
  const hasMark = !!row.callout;
  return (
    <li
      data-edit-row={row.number}
      className={cn(
        'group flex items-start gap-2.5 border-b border-hairline py-2.5 last:border-b-0',
        hasMark && 'cursor-pointer',
        hot && 'bg-pageBg',
      )}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,[role=combobox]')) return;
        if (hasMark) onOpen();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <EditNumber n={row.number} hasMark={hasMark} hot={hot} />
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span
          className={cn('min-w-0 break-words pt-px', resolved && 'text-labelColor line-through')}
        >
          {row.note || <EmptyCell />}
        </span>
        <span onClick={(e) => e.stopPropagation()} className='w-fit'>
          <Select
            name={`edit-${row.number}-category`}
            placeholder='category'
            value={cat}
            items={EDIT_CATEGORIES.map((c) => ({ value: c, label: c || 'category' }))}
            readOnly={readOnly || busy}
            onValueChange={onCategory}
            className={cn(
              'min-h-0 w-fit justify-start gap-1 border-0 bg-transparent p-0 text-micro uppercase tracking-label focus:border-0',
              '[&>span:last-child]:hidden',
              cat ? 'text-labelColor' : 'text-borderColor group-hover:text-labelColor',
              'hover:text-textColor focus:text-labelColor',
            )}
          />
        </span>
      </div>
      <CheckboxCommon
        name={`edit-${row.number}-resolved`}
        aria-label='resolved'
        className='mt-0.5'
        checked={resolved}
        disabled={readOnly || busy}
        onChange={(v: boolean) => onResolved(v)}
      />
    </li>
  );
}
