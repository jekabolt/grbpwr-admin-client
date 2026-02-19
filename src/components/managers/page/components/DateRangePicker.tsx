import * as Popover from '@radix-ui/react-popover';
import type { CompareMode } from 'api/proto-http/admin';
import { format } from 'date-fns';
import { FC, useState } from 'react';
import { DateRange, DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import Text from 'ui/components/text';
import type { MetricsPeriod } from '../useMetricsQuery';
import { COMPARE_MODE_OPTIONS, PERIOD_OPTIONS } from '../useMetricsQuery';

interface MetricsPeriodPickerProps {
  period: MetricsPeriod;
  compareMode: CompareMode;
  customFrom?: Date;
  customTo?: Date;
  onPeriodChange: (p: MetricsPeriod) => void;
  onCompareModeChange: (m: CompareMode) => void;
  onCustomRangeChange?: (from: Date, to: Date) => void;
}

function formatDateRange(from?: Date, to?: Date): string {
  if (!from || !to) return 'Select range';
  return `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`;
}

export const DateRangePicker: FC<MetricsPeriodPickerProps> = ({
  period,
  compareMode,
  customFrom,
  customTo,
  onPeriodChange,
  onCompareModeChange,
  onCustomRangeChange,
}) => {
  const [open, setOpen] = useState(false);
  const [selectingRange, setSelectingRange] = useState<DateRange | undefined>(undefined);

  const handleCustomSelect = (range: DateRange | undefined) => {
    if (!range) {
      setSelectingRange(undefined);
      return;
    }
    setSelectingRange(range);
    if (range.from && range.to && range.from.getTime() !== range.to.getTime()) {
      onCustomRangeChange?.(range.from, range.to);
      setOpen(false);
      setSelectingRange(undefined);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectingRange(undefined);
    setOpen(nextOpen);
  };

  const isCustom = period === 'custom';

  return (
    <div className='flex flex-wrap items-end gap-4 pb-6'>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-textInactiveColor'>
          period
        </Text>
        <div className='flex gap-2'>
          <select
            value={period}
            onChange={(e) => onPeriodChange(e.target.value as MetricsPeriod)}
            className='h-9 w-32 border border-textInactiveColor bg-bgColor px-2 text-textBaseSize uppercase'
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {isCustom && (
            <Popover.Root open={open} onOpenChange={handleOpenChange}>
              <Popover.Trigger asChild>
                <button
                  type='button'
                  className='h-9 px-3 flex items-center gap-2 border border-textInactiveColor bg-bgColor text-textBaseSize text-left min-w-[200px] hover:border-textColor transition-colors'
                >
                  {formatDateRange(customFrom, customTo)}
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
                  selected={selectingRange ?? (customFrom && customTo ? { from: customFrom, to: customTo } : undefined)}
                  onSelect={handleCustomSelect}
                  numberOfMonths={2}
                  defaultMonth={customFrom ?? new Date()}
                />
              </Popover.Content>
            </Popover.Root>
          )}
        </div>
      </div>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-textInactiveColor'>
          compare
        </Text>
        <select
          value={compareMode}
          onChange={(e) => onCompareModeChange(e.target.value as CompareMode)}
          className='h-9 min-w-[180px] border border-textInactiveColor bg-bgColor px-2 text-textBaseSize uppercase'
        >
          {COMPARE_MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
