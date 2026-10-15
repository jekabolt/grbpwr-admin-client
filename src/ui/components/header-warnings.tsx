import { useState } from 'react';

import { HEADER_TEXT } from 'ui/components/section-header';
import { Button } from 'ui/components/button';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';

/**
 * One place for a block's warnings: a quiet `! N warnings` door in the block HEADER, the list
 * behind it. Warnings never sit in the middle of a block's body any more (owner, patterns-lite
 * item 11) — the body is for the work, the header says what is wrong with it.
 *
 * A warning that can be fixed carries its fix (owner, patterns-lite round 2: «give us a
 * possibility to resolve these warnings»): `action` renders a door under the text; pressing it
 * closes the list and runs the fix. A warning without an action is a fact that cannot be changed
 * here — keep those rare.
 *
 * `error` items are red and counted first; plain warnings are grey-ink. Empty → renders nothing.
 */
export type HeaderWarningAction = { label: string; onClick: () => void; disabled?: boolean };
export type HeaderWarning =
  | string
  | { text: string; error?: boolean; action?: HeaderWarningAction };

export function HeaderWarnings({
  items,
  className,
}: {
  items: ReadonlyArray<HeaderWarning | null | undefined | false>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const list = items
    .filter((w): w is HeaderWarning => !!w)
    .map((w) =>
      typeof w === 'string'
        ? { text: w, error: false, action: undefined as HeaderWarningAction | undefined }
        : { text: w.text, error: !!w.error, action: w.action },
    );
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
      open={open}
      onOpenChange={setOpen}
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
      <ul className='flex max-w-[320px] flex-col gap-2'>
        {[...unique.filter((w) => w.error), ...unique.filter((w) => !w.error)].map((w) => (
          <li key={w.text} className='flex flex-col items-start gap-1'>
            <Text className={w.error ? 'text-error' : undefined}>{w.text}</Text>
            {w.action && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                disabled={w.action.disabled}
                onClick={() => {
                  const run = w.action!.onClick;
                  setOpen(false);
                  run();
                }}
              >
                {w.action.label}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </GenericPopover>
  );
}
