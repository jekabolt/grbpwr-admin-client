import { useRef, useState, type KeyboardEvent } from 'react';

import { HEADER_TEXT } from './section-header';
import GenericPopover from './popover';
import Text from './text';
import { cn } from 'lib/utility';

/**
 * One place for a block's warnings: a quiet `! N warnings` door in the block HEADER, the list
 * behind it. Warnings never sit in the middle of a block's body any more (owner, patterns-lite
 * item 11) — the body is for the work, the header says what is wrong with it.
 *
 * A warning that can be fixed carries its fix (owner, patterns-lite round 2: «give us a
 * possibility to resolve these warnings»). The warning TEXT is the door (owner, round 5: «btn set
 * not needed, underline the warning on hover»): clicking it closes the list and runs the fix, or
 * opens `href` in a new tab. A warning without an action is plain text — keep those rare.
 *
 * `error` items are red and counted first; plain warnings are grey-ink. Empty → renders nothing.
 */
export type HeaderWarningAction = {
  /** Kept for screen readers; the warning TEXT itself is the clickable thing. */
  label: string;
  onClick?: () => void;
  /** A link out (e.g. the article card) — rendered as a real <a target=_blank>, not window.open. */
  href?: string;
  disabled?: boolean;
};
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
  // THE DOOR IS A SPAN, NOT A BUTTON. Radix's trigger is a native <button>, and every native button
  // under a released card's `<fieldset disabled>` is dead — the list could not be opened at all
  // there (backlog 18). The list itself is portaled OUT of that fieldset, so the fieldset no longer
  // guards its fixes: on open we look up whether the door sits in a disabled fieldset and, if so,
  // show the list read-only (links out stay — they write nothing).
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [readOnly, setReadOnly] = useState(false);
  const onOpenChange = (next: boolean) => {
    if (next) setReadOnly(!!triggerRef.current?.closest('fieldset:disabled'));
    setOpen(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.currentTarget.click();
  };
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
      onOpenChange={onOpenChange}
      triggerProps={{ asChild: true, 'aria-label': label }}
      openElement={
        // Чернилами, без подчёркивания в покое (владелец 17.10: «warnings look so ugly»): цвет несёт
        // только знак `!` — красный у ошибок, жёлто-синий у предупреждений; слово — обычный текст.
        <span
          ref={triggerRef}
          role='button'
          tabIndex={0}
          onKeyDown={onKeyDown}
          className={cn(
            HEADER_TEXT,
            'cursor-pointer text-textColor underline-offset-2 hover:underline focus-visible:underline',
            className,
          )}
        >
          <span className={errors > 0 ? 'text-error' : 'text-warning'}>!</span>
          {label.replace(/^!/, '')}
        </span>
      }
    >
      <ul className='flex max-w-[320px] flex-col gap-2'>
        {[...unique.filter((w) => w.error), ...unique.filter((w) => !w.error)].map((w) => (
          <li key={w.text}>
            {w.action && !w.action.disabled && (w.action.href || !readOnly) ? (
              w.action.href ? (
                <a
                  href={w.action.href}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label={`${w.text}: ${w.action.label}`}
                  className={cn(
                    'text-left underline-offset-2 hover:underline focus-visible:underline',
                    w.error && 'text-error',
                  )}
                  onClick={() => {
                    w.action!.onClick?.();
                    setOpen(false);
                  }}
                >
                  {w.text} ↗
                </a>
              ) : (
                <button
                  type='button'
                  aria-label={`${w.text}: ${w.action.label}`}
                  className={cn(
                    'text-left underline-offset-2 hover:underline focus-visible:underline',
                    w.error && 'text-error',
                  )}
                  onClick={() => {
                    const run = w.action!.onClick;
                    setOpen(false);
                    run?.();
                  }}
                >
                  {w.text}
                </button>
              )
            ) : (
              <>
                <Text className={w.error ? 'text-error' : undefined}>{w.text}</Text>
                {/* A fix that is blocked says why (e.g. «remove one-size PDFs first»). */}
                {w.action?.disabled && (
                  <Text size='micro' variant='label' component='span' className='block'>
                    {w.action.label}
                  </Text>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </GenericPopover>
  );
}
