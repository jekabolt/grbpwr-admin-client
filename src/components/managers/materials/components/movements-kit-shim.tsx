// TEMPORARY — stands in for the kit APIs landing on feat/movements-kit (DateRangePicker, GroupLabel
// swatch/rule/plain, DataTable stickyHeader/hoverRows). Imported only by movements-tab.tsx; delete
// at integration and import these names from 'ui'.
import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import {
  Arrow,
  Button,
  Close,
  DataTable as KitDataTable,
  GroupLabel as KitGroupLabel,
  PopoverContent,
} from 'ui';
import { cn } from 'lib/utility';

const toDate = (s?: string) => (s ? new Date(`${s}T00:00:00`) : undefined);
const toIso = (d?: Date) => (d ? format(d, 'yyyy-MM-dd') : '');
const yearOf = (d: Date) =>
  d.getFullYear() === new Date().getFullYear() ? '' : ` ${d.getFullYear()}`;

function rangeText(from?: Date, to?: Date) {
  if (from && to) {
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
    if (sameMonth) return `${format(from, 'd')}–${format(to, 'd MMM')}${yearOf(to)}`;
    const fromYear = from.getFullYear() !== to.getFullYear() ? yearOf(from) : '';
    return `${format(from, 'dd MMM')}${fromYear}–${format(to, 'dd MMM')}${yearOf(to)}`;
  }
  if (from) return `from ${format(from, 'd MMM')}${yearOf(from)}`;
  if (to) return `to ${format(to, 'd MMM')}${yearOf(to)}`;
  return '';
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
  const f = toDate(from);
  const t = toDate(to);
  const text = rangeText(f, t);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          type='button'
          aria-label={placeholder}
          className={cn(
            'flex h-6.5 w-full items-center justify-between gap-2 border border-borderColor bg-bgColor px-1.75 text-textBaseSize uppercase',
            className,
          )}
        >
          <span className={cn('truncate', !text && 'text-labelColor')}>{text || placeholder}</span>
          {text ? (
            <Close
              asChild
              size='sm'
              tabIndex={-1}
              aria-label='clear dates'
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onChange('', '');
              }}
            />
          ) : (
            <span aria-hidden className='flex shrink-0 rotate-180 text-textColor'>
              <Arrow />
            </span>
          )}
        </Button>
      </Popover.Trigger>
      <PopoverContent noTail className='w-auto p-2'>
        <DayPicker
          mode='range'
          weekStartsOn={1}
          showOutsideDays
          selected={{ from: f, to: t } as DateRange}
          defaultMonth={f ?? t}
          onSelect={(r) => {
            onChange(toIso(r?.from), toIso(r?.to));
            if (r?.from && r?.to && r.from.getTime() !== r.to.getTime()) setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover.Root>
  );
}

export function GroupLabel({
  swatch,
  rule = 'below',
  plain,
  className,
  children,
  ...rest
}: React.ComponentProps<typeof KitGroupLabel> & {
  swatch?: React.ReactNode;
  rule?: 'below' | 'above';
  plain?: boolean;
}) {
  if (!swatch && rule === 'below' && !plain)
    return (
      <KitGroupLabel className={className} {...rest}>
        {children}
      </KitGroupLabel>
    );
  return (
    <div
      data-group-label=''
      className={cn(
        'flex items-center gap-2',
        rule === 'above'
          ? 'border-t border-textColor pt-2'
          : 'mb-1 border-b border-borderColor pb-0.5',
        rest.flush ? 'mt-0' : 'mt-3',
        className,
      )}
    >
      {swatch ? <span className='flex shrink-0'>{swatch}</span> : null}
      <span
        className={cn(
          'min-w-0 truncate',
          plain
            ? 'text-textBaseSize leading-none text-textColor'
            : 'text-micro font-bold uppercase tracking-group text-labelColor',
        )}
      >
        {children}
      </span>
      {rest.action ? <div className='ml-auto'>{rest.action}</div> : null}
    </div>
  );
}

export function DataTable({
  stickyHeader,
  hoverRows,
  className,
  ...rest
}: React.ComponentProps<typeof KitDataTable> & { stickyHeader?: boolean; hoverRows?: boolean }) {
  const table = (
    <KitDataTable
      {...rest}
      className={cn(
        stickyHeader &&
          '[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:!border-b-0 [&_th]:bg-bgColor [&_th]:after:absolute [&_th]:after:inset-x-0 [&_th]:after:bottom-0 [&_th]:after:h-px [&_th]:after:bg-borderColor',
        hoverRows &&
          '[&>tbody>tr:not([data-group])]:transition-[background-color] [&>tbody>tr:not([data-group])]:duration-150 [&>tbody>tr:not([data-group])]:ease-out [&>tbody>tr:not([data-group]):hover]:bg-borderColor/40',
        className,
      )}
    />
  );
  return stickyHeader ? <div className='[&>div]:!overflow-visible'>{table}</div> : table;
}
