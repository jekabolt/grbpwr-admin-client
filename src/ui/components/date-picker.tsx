import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from 'lib/utility';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Monochrome, portalled date field. The calendar internals are themed globally
// via `.rdp-*` overrides in global.css; here we theme the trigger + popover
// surface. Rendered through a Portal at z-50 so it escapes the create/edit
// modal's stacking/overflow context.
export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = 'pick a date',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type='button'
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-2 border-b border-textColor bg-bgColor py-1 text-left text-textBaseSize focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:opacity-50',
          )}
        >
          <span className={cn(!value && 'text-labelColor')}>
            {value ? format(value, 'PPP') : placeholder}
          </span>
          {value ? (
            <span
              role='button'
              tabIndex={-1}
              aria-label='clear date'
              onClick={(e) => {
                e.stopPropagation();
                onChange(undefined);
              }}
              className='shrink-0 px-1 text-labelColor hover:text-textColor'
            >
              ×
            </span>
          ) : (
            <span aria-hidden className='shrink-0 text-labelColor'>
              ▾
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align='start'
          sideOffset={4}
          className='z-[60] border border-textColor bg-bgColor p-2 text-textColor shadow-[4px_4px_0_0_var(--color-textColor)]'
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
