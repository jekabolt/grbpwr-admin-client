import * as Popover from '@radix-ui/react-popover';
import { format, isValid, parseISO } from 'date-fns';
import { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
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
  /** Select-sized 26px field for dense filter rows. */
  boxed?: boolean;
}

const BOXED_TRIGGER =
  'h-[26px] border border-borderColor px-[7px] py-[3px] uppercase transition-colors focus:border-textColor focus:outline-none focus:ring-0';

const rangeDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const date = parseISO(value);
  return isValid(date) ? date : undefined;
};

const isoDate = (value?: Date): string => (value ? format(value, 'yyyy-MM-dd') : '');

const yearSuffix = (date: Date): string =>
  date.getFullYear() === new Date().getFullYear() ? '' : ` ${format(date, 'yyyy')}`;

function rangeLabel(from?: Date, to?: Date): string {
  if (from && to) {
    const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
    if (sameMonth) return `${format(from, 'dd')}–${format(to, 'dd MMM')}${yearSuffix(to)}`;

    const fromYear = from.getFullYear() === to.getFullYear() ? '' : yearSuffix(from);
    return `${format(from, 'dd MMM')}${fromYear}–${format(to, 'dd MMM')}${yearSuffix(to)}`;
  }
  if (from) return `from ${format(from, 'dd MMM')}${yearSuffix(from)}`;
  if (to) return `to ${format(to, 'dd MMM')}${yearSuffix(to)}`;
  return '';
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
  boxed,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type='button'
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between gap-2 bg-bgColor text-left text-textBaseSize disabled:opacity-50',
            boxed
              ? BOXED_TRIGGER
              : compact
                ? 'border-b-0 bg-transparent py-0 text-control uppercase leading-none tracking-label focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                : 'border-b border-borderColor py-1 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
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

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = 'dates',
  className,
}: {
  from?: string;
  to?: string;
  onChange: (from: string, to: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const fromDate = rangeDate(from);
  const toDate = rangeDate(to);
  const label = rangeLabel(fromDate, toDate);
  const hasValue = !!fromDate || !!toDate;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type='button'
          aria-label={placeholder}
          className={cn(
            'flex w-full items-center justify-between gap-2 bg-bgColor text-left text-textBaseSize',
            BOXED_TRIGGER,
            className,
          )}
        >
          <span className={cn('min-w-0 truncate whitespace-nowrap', !label && 'text-labelColor')}>
            {label || placeholder}
          </span>
          {hasValue ? (
            <Close
              asChild
              size='sm'
              tabIndex={-1}
              aria-label='clear dates'
              onClick={(event) => {
                event.stopPropagation();
                onChange('', '');
              }}
            />
          ) : (
            <span aria-hidden className='shrink-0 rotate-180 text-textColor'>
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
            mode='range'
            weekStartsOn={1}
            showOutsideDays
            selected={{ from: fromDate, to: toDate } as DateRange}
            defaultMonth={fromDate ?? toDate}
            onSelect={(range) => {
              onChange(isoDate(range?.from), isoDate(range?.to));
              if (range?.from && range.to && range.from.getTime() !== range.to.getTime()) {
                setOpen(false);
              }
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
