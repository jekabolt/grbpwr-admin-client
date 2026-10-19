import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from 'lib/utility';
import { Arrow } from '../icons/arrow';
import { Close } from './close';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * Chip row look: one 11px uppercase line, short date (`31 JUL 2026`), no underline, the clear ×
   * and the arrow in the text colour — so a red (overdue) chip stays red end to end.
   */
  compact?: boolean;
}

// Monochrome, portalled date field. The calendar internals are themed globally
// via `.rdp-*` overrides in global.css; here we theme the trigger + popover
// surface. Rendered through a Portal at z-[var(--z-popover)] so it clears the create/edit
// modal (z-50) and escapes its overflow/stacking context.
export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = 'pick a date',
  compact,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type='button'
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-2 border-b border-borderColor bg-bgColor py-1 text-left text-textBaseSize focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:opacity-50',
            compact &&
              'border-b-0 bg-transparent py-0 text-control uppercase leading-none tracking-label',
          )}
        >
          <span className={cn(!value && 'text-labelColor')}>
            {value ? format(value, compact ? 'd MMM yyyy' : 'PPP') : placeholder}
          </span>
          {value ? (
            <Close
              asChild
              size='sm'
              tabIndex={-1}
              aria-label='clear date'
              className={cn(compact && 'text-current')}
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
            />
          ) : (
            // Та же стрелка, что у Select: один глиф раскрытия на весь экран.
            <span
              aria-hidden
              className={cn('shrink-0 rotate-180', compact ? 'text-current' : 'text-textColor')}
            >
              <Arrow />
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align='start'
          sideOffset={4}
          className='z-[var(--z-popover)] border border-borderColor bg-bgColor p-2 text-textColor shadow-[var(--shadow-popover)]'
        >
          <DayPicker
            mode='single'
            weekStartsOn={1}
            showOutsideDays
            selected={value}
            defaultMonth={value}
            onSelect={(d) => {
              onChange(d);
              if (d) setOpen(false);
            }}
            disabled={disabled}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
