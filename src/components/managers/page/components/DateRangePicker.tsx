import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { FC, useState } from 'react';
import { DateRange, DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import Text from 'ui/components/text';

interface DateRangePickerProps {
  periodFrom: Date;
  periodTo: Date;
  comparePeriodFrom: Date;
  comparePeriodTo: Date;
  onPeriodFromChange: (d: Date) => void;
  onPeriodToChange: (d: Date) => void;
  granularity: string;
  onGranularityChange: (v: string) => void;
}

function formatDateRange(from: Date, to: Date): string {
  return `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`;
}

export const DateRangePicker: FC<DateRangePickerProps> = ({
  periodFrom,
  periodTo,
  comparePeriodFrom,
  comparePeriodTo,
  onPeriodFromChange,
  onPeriodToChange,
  granularity,
  onGranularityChange,
}) => {
  const [open, setOpen] = useState(false);
  const [selectingRange, setSelectingRange] = useState<DateRange | undefined>(undefined);

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) {
      setSelectingRange(undefined);
      return;
    }
    setSelectingRange(range);
    if (range.from && range.to && range.from.getTime() !== range.to.getTime()) {
      onPeriodFromChange(range.from);
      onPeriodToChange(range.to);
      setOpen(false);
      setSelectingRange(undefined);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectingRange(undefined);
    setOpen(nextOpen);
  };

  return (
    <div className='flex flex-wrap items-end gap-4 pb-6'>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-textInactiveColor'>
          current period
        </Text>
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger asChild>
            <button
              type='button'
              className='h-9 px-3 flex items-center gap-2 border border-textInactiveColor bg-bgColor text-textBaseSize text-left min-w-[200px] hover:border-textColor transition-colors'
            >
              {formatDateRange(periodFrom, periodTo)}
            </button>
          </Popover.Trigger>
          <Popover.Content
            className='z-50 bg-bgColor p-4 rounded border border-textInactiveColor shadow-lg'
            align='start'
            onOpenAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => {
              if (selectingRange?.from && !selectingRange?.to) {
                e.preventDefault();
              }
            }}
          >
            <DayPicker
              mode='range'
              selected={selectingRange}
              onSelect={handleSelect}
              numberOfMonths={2}
              defaultMonth={periodFrom}
            />
          </Popover.Content>
        </Popover.Root>
      </div>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-textInactiveColor'>
          compare period
        </Text>
        <div className='h-9 px-3 flex items-center border border-textInactiveColor bg-bgColor text-textBaseSize min-w-[200px]'>
          {formatDateRange(comparePeriodFrom, comparePeriodTo)}
        </div>
      </div>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-textInactiveColor'>
          granularity
        </Text>
        <select
          value={granularity}
          onChange={(e) => onGranularityChange(e.target.value)}
          className='h-9 w-32 border border-textInactiveColor bg-bgColor px-2 text-textBaseSize uppercase'
        >
          <option value='METRICS_GRANULARITY_DAY'>day</option>
          <option value='METRICS_GRANULARITY_WEEK'>week</option>
          <option value='METRICS_GRANULARITY_MONTH'>month</option>
        </select>
      </div>
    </div>
  );
};
