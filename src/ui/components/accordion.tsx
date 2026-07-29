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
      <button
        type='button'
        onClick={toggle}
        aria-expanded={isOpen}
        className='flex w-full items-center gap-2 border-b border-hairline bg-bgZebra px-2 py-1.5 text-left'
      >
        <span className='min-w-0 truncate'>{title}</span>
        <span className='ml-auto flex shrink-0 items-center gap-2 text-labelColor'>
          {meta}
          <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
        </span>
      </button>
      {isOpen && <div className='p-2'>{children}</div>}
    </div>
  );
}
