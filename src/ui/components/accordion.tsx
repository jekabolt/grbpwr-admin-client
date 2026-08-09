import { useState } from 'react';
import { cn } from 'lib/utility';

/**
 * The reference's `.acc`: a bordered block whose header is a zebra-tinted strip.
 * Controlled (`open` + `onOpenChange`) or uncontrolled (`defaultOpen`).
 *
 * Note for phase 19: a field that can hold a validation error must be reachable, so
 * an Accordion containing one has to open itself on error — pass `open` from the
 * screen rather than leaving it uncontrolled.
 */
export function Accordion({
  title,
  meta,
  open,
  defaultOpen = false,
  onOpenChange,
  tone,
  children,
  className,
}: {
  title: React.ReactNode;
  /** Right-hand side of the header — counts, pills, a SAM total. */
  meta?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  tone?: 'default' | 'error';
  children?: React.ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;
  const toggle = () => {
    if (open === undefined) setInternal(!isOpen);
    onOpenChange?.(!isOpen);
  };

  return (
    <div
      className={cn(
        'border bg-bgColor',
        tone === 'error' ? 'border-error' : 'border-borderColor',
        className,
      )}
    >
      {/*
        A span, not a button. Opening a disclosure is a READ action, but several screens wrap their
        whole form in `<fieldset disabled>` (a RELEASED tech card is the big one), and a disabled
        fieldset disables every descendant BUTTON — so this header used to go inert on exactly the
        documents people only ever read. Every Accordion on those screens defaults to closed, which
        meant the content behind it was unreachable, silently.

        A span is not a form control, so `fieldset[disabled]` cannot reach it. `role`/`tabIndex`/
        `aria-expanded` keep it a real control for assistive tech, and the keydown handler is the
        part the browser gives a <button> for free — without it this would be mouse-only.
      */}
      <span
        role='button'
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={isOpen}
        className='flex w-full cursor-pointer items-center gap-2 border-b border-hairline bg-bgZebra px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
      >
        <span className='min-w-0 truncate'>{title}</span>
        <span className='ml-auto flex shrink-0 items-center gap-2 text-labelColor'>
          {meta}
          <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
        </span>
      </span>
      {isOpen && <div className='p-2'>{children}</div>}
    </div>
  );
}
