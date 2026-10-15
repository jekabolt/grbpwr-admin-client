import { HEADER_TEXT } from 'ui/components/section-header';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';

/**
 * One place for a block's warnings: a quiet `! N warnings` door in the block HEADER, the list
 * behind it. Warnings never sit in the middle of a block's body any more (owner, patterns-lite
 * item 11) — the body is for the work, the header says what is wrong with it.
 *
 * `error` items are red and counted first; plain warnings are grey-ink. Empty → renders nothing.
 */
export type HeaderWarning = string | { text: string; error?: boolean };

export function HeaderWarnings({
  items,
  className,
}: {
  items: ReadonlyArray<HeaderWarning | null | undefined | false>;
  className?: string;
}) {
  const list = items
    .filter((w): w is HeaderWarning => !!w)
    .map((w) => (typeof w === 'string' ? { text: w, error: false } : { ...w, error: !!w.error }));
  const unique = list.filter((w, i) => list.findIndex((o) => o.text === w.text) === i);
  if (unique.length === 0) return null;
  const errors = unique.filter((w) => w.error).length;
  const label =
    errors > 0
      ? `! ${errors} ${errors === 1 ? 'error' : 'errors'}${
          unique.length > errors ? ` · ${unique.length - errors} more` : ''
        }`
      : `! ${unique.length} ${unique.length === 1 ? 'warning' : 'warnings'}`;
  return (
    <GenericPopover
      title='warnings'
      triggerProps={{ 'aria-label': label }}
      openElement={
        <span
          className={cn(
            HEADER_TEXT,
            'underline underline-offset-2',
            errors > 0 ? 'text-error' : 'text-warning',
            className,
          )}
        >
          {label}
        </span>
      }
    >
      <ul className='flex max-w-[320px] flex-col gap-1.5'>
        {[...unique.filter((w) => w.error), ...unique.filter((w) => !w.error)].map((w) => (
          <li key={w.text}>
            <Text size='small' className={w.error ? 'text-error' : undefined}>
              {w.text}
            </Text>
          </li>
        ))}
      </ul>
    </GenericPopover>
  );
}
