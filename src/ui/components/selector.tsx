import { ChevronDownIcon, ChevronUpIcon } from '@radix-ui/react-icons';
import * as Select from '@radix-ui/react-select';

interface Option {
  value: string | number;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string | number | (string | number)[];
  options: Option[];
  placeholder?: string;
  fullWidth?: boolean;
  showAll?: boolean;
  multiple?: boolean;
  disabled?: boolean;
  onChange: (value: any) => void;
  [k: string]: any;
}

export default function Selector({
  label,
  value,
  options,
  placeholder = 'Select an option...',
  fullWidth = false,
  showAll = false,
  multiple = false,
  disabled = false,
  onChange,
  ...props
}: SelectFieldProps) {
  const allOptions = showAll ? [{ value: 'all', label: 'All' }, ...options] : options;

  const handleValueChange = (newValue: string) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (newValue === 'all') {
        onChange([]);
      } else {
        const valueExists = currentValues.includes(newValue);
        if (valueExists) {
          onChange(currentValues.filter((v) => v !== newValue));
        } else {
          onChange([...currentValues, newValue]);
        }
      }
    } else {
      onChange(newValue === 'all' ? 'all' : newValue);
    }
  };

  const getDisplayValue = () => {
    if (multiple) {
      if (!value || (Array.isArray(value) && !value.length)) return placeholder;
      if (Array.isArray(value) && value.includes('all')) return 'All';
      if (Array.isArray(value)) {
        return value.map((val) => allOptions.find((opt) => opt.value === val)?.label).join(', ');
      }
      return placeholder;
    }
    return allOptions.find((opt) => opt.value === value)?.label || placeholder;
  };

  const currentValue = multiple
    ? Array.isArray(value) && value.length > 0
      ? value[0].toString()
      : ''
    : (value || (showAll ? 'all' : '')).toString();

  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      <Select.Root
        value={currentValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        {...props}
      >
        <Select.Trigger className='inline-flex items-center justify-between w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500'>
          <Select.Value placeholder={placeholder}>{getDisplayValue()}</Select.Value>
          <Select.Icon className='ml-2'>
            <ChevronDownIcon />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className='overflow-hidden bg-white border border-gray-200 z-50'>
            <Select.ScrollUpButton className='flex items-center justify-center h-6 bg-white cursor-default'>
              <ChevronUpIcon />
            </Select.ScrollUpButton>

            <Select.Viewport className='p-1'>
              <Select.Group>
                <Select.Label className='px-6 py-2 text-xs font-medium text-gray-500 uppercase'>
                  {label}
                </Select.Label>
                {allOptions.map((option) => {
                  return (
                    <Select.Item
                      key={option.value}
                      value={option.value.toString()}
                      className='relative flex items-center px-8 py-2 text-sm cursor-pointer select-none uppercase hover:bg-gray-500/50 focus:outline-none'
                    >
                      <Select.ItemText>{option.label}</Select.ItemText>
                      <Select.ItemIndicator className='absolute left-2 w-4 h-4 inline-flex items-center justify-center'>
                        ✓
                      </Select.ItemIndicator>
                    </Select.Item>
                  );
                })}
              </Select.Group>
            </Select.Viewport>

            <Select.ScrollDownButton className='flex items-center justify-center h-6 bg-white text-gray-700 cursor-default'>
              <ChevronDownIcon />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
