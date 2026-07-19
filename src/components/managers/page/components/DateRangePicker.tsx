import * as Popover from '@radix-ui/react-popover';
import type { CompareMode } from 'api/proto-http/admin';
import { format } from 'date-fns';
import { FC, useState } from 'react';
import { DateRange, DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import Text from 'ui/components/text';
import type { MetricsPeriod } from '../useMetricsQuery';
import { PERIOD_OPTIONS } from '../useMetricsQuery';
import { compareModeHintLine } from '../utils';

interface MetricsPeriodPickerProps {
  period: MetricsPeriod;
  compareMode: CompareMode;
  customFrom?: Date;
  customTo?: Date;
  // Arbitrary compare baseline window ("this week vs launch week"). Set → overrides the preset.
  compareFrom?: Date;
  compareTo?: Date;
  onPeriodChange: (p: MetricsPeriod) => void;
  onCompareModeChange: (m: CompareMode) => void;
  onCustomRangeChange?: (from: Date, to: Date) => void;
  onCompareBaselineChange?: (from: Date, to: Date) => void;
}

type CompareChoice = 'none' | 'previous' | 'custom';

const COMPARE_CHOICES: Array<{ value: CompareChoice; label: string }> = [
  { value: 'none', label: 'No comparison' },
  { value: 'previous', label: 'Previous period' },
  { value: 'custom', label: 'Custom baseline' },
];

function formatDateRange(from?: Date, to?: Date): string {
  if (!from || !to) return 'Select range';
  return `${format(from, 'MMM d')} – ${format(to, 'MMM d')}`;
}

export const DateRangePicker: FC<MetricsPeriodPickerProps> = ({
  period,
  compareMode,
  customFrom,
  customTo,
  compareFrom,
  compareTo,
  onPeriodChange,
  onCompareModeChange,
  onCustomRangeChange,
  onCompareBaselineChange,
}) => {
  const [open, setOpen] = useState(false);
  const [selectingRange, setSelectingRange] = useState<DateRange | undefined>(undefined);
  const [compareOpen, setCompareOpen] = useState(false);
  const [selectingCompare, setSelectingCompare] = useState<DateRange | undefined>(undefined);

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

  const handleCompareSelect = (range: DateRange | undefined) => {
    if (!range) {
      setSelectingCompare(undefined);
      return;
    }
    setSelectingCompare(range);
    if (range.from && range.to && range.from.getTime() !== range.to.getTime()) {
      onCompareBaselineChange?.(range.from, range.to);
      setCompareOpen(false);
      setSelectingCompare(undefined);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectingRange(undefined);
    setOpen(nextOpen);
  };

  const handleCompareOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectingCompare(undefined);
    setCompareOpen(nextOpen);
  };

  const isCustom = period === 'custom';
  const hasBaseline = !!(compareFrom && compareTo);
  const [compareChoice, setCompareChoice] = useState<CompareChoice>(
    compareMode === 'COMPARE_MODE_NONE' ? 'none' : hasBaseline ? 'custom' : 'previous',
  );

  const handleCompareChoice = (value: CompareChoice) => {
    setCompareChoice(value);
    if (value === 'none') onCompareModeChange('COMPARE_MODE_NONE');
    else if (value === 'previous') onCompareModeChange('COMPARE_MODE_PREVIOUS_PERIOD');
    else setCompareOpen(true); // custom — open the baseline picker; commit on range select
  };

  const compareHint = hasBaseline
    ? `Deltas compare to ${formatDateRange(compareFrom, compareTo)} (custom baseline).`
    : compareModeHintLine(compareMode, period, customFrom, customTo);

  return (
    <div className='flex flex-wrap items-start gap-4 pb-6'>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-labelColor'>
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
                  className='h-9 px-3 flex items-center gap-2 border border-textInactiveColor bg-bgColor text-textBaseSize text-left min-w-[200px] hover:border-textInactiveColor transition-colors'
                >
                  {formatDateRange(customFrom, customTo)}
                </button>
              </Popover.Trigger>
              <Popover.Content
                className='z-50 bg-bgColor p-4 rounded-none border border-textInactiveColor shadow-lg'
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
                  selected={
                    selectingRange ??
                    (customFrom && customTo ? { from: customFrom, to: customTo } : undefined)
                  }
                  onSelect={handleCustomSelect}
                  numberOfMonths={2}
                  defaultMonth={customFrom ?? new Date()}
                />
              </Popover.Content>
            </Popover.Root>
          )}
        </div>
      </div>
      <div className='flex flex-col gap-1 max-w-md'>
        <Text variant='uppercase' className='text-labelColor'>
          compare
        </Text>
        <div className='flex gap-2'>
          <select
            value={compareChoice}
            onChange={(e) => handleCompareChoice(e.target.value as CompareChoice)}
            className='h-9 min-w-[180px] border border-textInactiveColor bg-bgColor px-2 text-textBaseSize uppercase'
          >
            {COMPARE_CHOICES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {compareChoice === 'custom' && (
            <Popover.Root open={compareOpen} onOpenChange={handleCompareOpenChange}>
              <Popover.Trigger asChild>
                <button
                  type='button'
                  className='h-9 flex items-center border border-textInactiveColor bg-bgColor px-3 text-textBaseSize text-left min-w-[200px] hover:border-textInactiveColor transition-colors'
                >
                  {hasBaseline ? formatDateRange(compareFrom, compareTo) : 'Select baseline'}
                </button>
              </Popover.Trigger>
              <Popover.Content
                className='z-50 bg-bgColor p-4 rounded-none border border-textInactiveColor shadow-lg'
                align='start'
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                  if (selectingCompare?.from && !selectingCompare?.to) {
                    e.preventDefault();
                  }
                }}
              >
                <DayPicker
                  mode='range'
                  selected={
                    selectingCompare ??
                    (compareFrom && compareTo ? { from: compareFrom, to: compareTo } : undefined)
                  }
                  onSelect={handleCompareSelect}
                  numberOfMonths={2}
                  defaultMonth={compareFrom ?? new Date()}
                />
              </Popover.Content>
            </Popover.Root>
          )}
        </div>
        {compareHint && (
          <Text className='text-[10px] text-labelColor leading-snug mt-0.5'>
            {compareHint}
          </Text>
        )}
      </div>
    </div>
  );
};
