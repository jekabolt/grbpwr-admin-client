import { ChevronDownIcon } from '@radix-ui/react-icons'; // Optional, for the trigger icon
import * as Select from '@radix-ui/react-select';

interface Option {
  value: string | number;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string | number | (string | number)[];
  options: Option[];
  onChange: (value: any) => void;
  placeholder?: string;
  multiple?: boolean;
  fullWidth?: boolean;
  [k: string]: any;
}

export default function Selector({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select an option...',
  multiple = false,
  fullWidth = false,
  ...props
}: SelectFieldProps) {
  const selectedLabels =
    multiple && Array.isArray(value)
      ? value
          .map((v) => options.find((opt) => opt.value === v)?.label)
          .filter(Boolean)
          .join(', ')
      : options.find((opt) => opt.value === value)?.label;

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''}`}>
      <label className='block text-sm font-medium text-gray-700'>{label}</label>
      <Select.Root
        value={Array.isArray(value) ? value[0]?.toString() : value?.toString()}
        onValueChange={onChange}
        {...(multiple ? { multiple: true } : {})}
      >
        <Select.Trigger
          className='inline-flex items-center justify-between rounded-md px-4 py-2 text-sm border w-full bg-white'
          {...props}
        >
          <Select.Value>{selectedLabels || placeholder}</Select.Value>
          <Select.Icon>
            <ChevronDownIcon />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className='overflow-hidden border bg-white rounded-md shadow-lg z-50'>
            <Select.Viewport>
              {multiple && (
                <Select.Item
                  value='any'
                  className='relative flex items-center pl-4 py-2 cursor-default hover:bg-gray-100'
                >
                  <Select.ItemText>ANY</Select.ItemText>
                </Select.Item>
              )}
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value.toString()}
                  className='relative flex items-center pl-4 py-2 cursor-default hover:bg-gray-100'
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
