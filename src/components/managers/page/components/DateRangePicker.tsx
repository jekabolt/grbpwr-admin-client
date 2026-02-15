import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { FC } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { PRESETS } from '../useMetricsQuery';
import { cn } from 'lib/utility';

interface DateRangePickerProps {
  periodFrom: Date;
  periodTo: Date;
  comparePeriodFrom?: Date;
  comparePeriodTo?: Date;
  onPeriodFromChange: (d: Date) => void;
  onPeriodToChange: (d: Date) => void;
  onComparePeriodFromChange?: (d: Date) => void;
  onComparePeriodToChange?: (d: Date) => void;
  compareEnabled: boolean;
  onCompareEnabledChange: (v: boolean) => void;
  granularity: string;
  onGranularityChange: (v: string) => void;
  onPresetSelect: (days: number) => void;
  activePresetDays: number | null;
}

export const DateRangePicker: FC<DateRangePickerProps> = ({
  periodFrom,
  periodTo,
  comparePeriodFrom,
  comparePeriodTo,
  onPeriodFromChange,
  onPeriodToChange,
  onComparePeriodFromChange,
  onComparePeriodToChange,
  compareEnabled,
  onCompareEnabledChange,
  granularity,
  onGranularityChange,
  onPresetSelect,
  activePresetDays,
}) => (
  <LocalizationProvider dateAdapter={AdapterDateFns}>
    <div className='flex flex-col gap-4 pb-6'>
      <div className='flex flex-wrap items-center gap-2'>
        {PRESETS.map(({ label, days }) => (
          <Button
            key={days}
            variant={activePresetDays === days ? 'main' : 'simpleReverseWithBorder'}
            size='sm'
            onClick={() => onPresetSelect(days)}
            className={cn('uppercase text-textBaseSize', activePresetDays === days && 'ring-2 ring-textColor')}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className='space-y-2'>
        <Text variant='uppercase' className='text-textInactiveColor text-[10px]'>
          custom range
        </Text>
        <div className='flex flex-wrap items-end gap-4'>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-textInactiveColor'>
          from
        </Text>
        <DatePicker
          value={periodFrom}
          onChange={(d) => d && onPeriodFromChange(d)}
          slotProps={{ textField: { size: 'small', className: 'w-40' } }}
        />
      </div>
      <div className='flex flex-col gap-1'>
        <Text variant='uppercase' className='text-textInactiveColor'>
          to
        </Text>
        <DatePicker
          value={periodTo}
          onChange={(d) => d && onPeriodToChange(d)}
          slotProps={{ textField: { size: 'small', className: 'w-40' } }}
        />
      </div>
      <div className='flex items-center gap-2'>
        <input
          type='checkbox'
          id='compare'
          checked={compareEnabled}
          onChange={(e) => onCompareEnabledChange(e.target.checked)}
          className='h-4 w-4'
        />
        <label htmlFor='compare' className='text-textBaseSize uppercase cursor-pointer'>
          compare period
        </label>
      </div>
      {compareEnabled && onComparePeriodFromChange && onComparePeriodToChange && (
        <>
          <div className='flex flex-col gap-1'>
            <Text variant='uppercase' className='text-textInactiveColor'>
              compare from
            </Text>
            <DatePicker
              value={comparePeriodFrom}
              onChange={(d) => d && onComparePeriodFromChange(d)}
              slotProps={{ textField: { size: 'small', className: 'w-40' } }}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text variant='uppercase' className='text-textInactiveColor'>
              compare to
            </Text>
            <DatePicker
              value={comparePeriodTo}
              onChange={(d) => d && onComparePeriodToChange(d)}
              slotProps={{ textField: { size: 'small', className: 'w-40' } }}
            />
          </div>
        </>
      )}
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
      </div>
    </div>
  </LocalizationProvider>
);
