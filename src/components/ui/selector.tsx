import { ChevronDownIcon } from '@radix-ui/react-icons'; // Optional, for the trigger icon
import * as Select from '@radix-ui/react-select';

interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  [k: string]: any;
}

export default function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select an option...',
  ...props
}: SelectFieldProps) {
  return (
    <div className='relative'>
      <label className='block'>{label}</label>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger
          className='inline-flex items-center justify-between rounded-md px-4 py-2 text-sm border w-full'
          {...props}
        >
          <Select.Value placeholder={placeholder} />
          <Select.Icon>
            <ChevronDownIcon />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className='overflow-hidden border border-text bg-white rounded-md shadow-lg'>
            <Select.Viewport>
              {options
                .filter((option) => option.value !== '')
                .map((option) => (
                  <Select.Item
                    key={option.value}
                    value={option.value}
                    className='relative flex items-center pl-4 py-2 rounded-md cursor-default hover:bg-gray-100 focus:bg-gray-100 focus:outline-none'
                  >
                    <Select.ItemText>{option.label}</Select.ItemText>
                  </Select.Item>
                ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
