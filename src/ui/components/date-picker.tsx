import * as Popover from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, disabled }: DatePickerProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className='p-2 border rounded w-full text-left' disabled={disabled}>
          {value ? format(value, 'PPP') : 'Select date'}
        </button>
      </Popover.Trigger>
      <Popover.Content className='z-50 bg-white p-3 rounded shadow-lg'>
        <DayPicker mode='single' selected={value} onSelect={onChange} disabled={disabled} />
      </Popover.Content>
    </Popover.Root>
  );
}
