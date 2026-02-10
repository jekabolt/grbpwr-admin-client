import { ChevronDownIcon, ChevronUpIcon } from '@radix-ui/react-icons';
import * as Select from '@radix-ui/react-select';
import Text from './text';

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
  compact?: boolean;
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
  compact = false,
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
      onChange(newValue);
    }
  };

  const currentValue = multiple
    ? Array.isArray(value) && value.length > 0
      ? value[0].toString()
      : ''
    : (value || (showAll ? 'all' : '')).toString();

  const getDisplayValue = () => {
    if (multiple) {
      if (!value || (Array.isArray(value) && !value.length)) return placeholder;
      if (Array.isArray(value) && value.includes('all')) return 'All';
      if (Array.isArray(value)) {
        return value
          .map((val) => allOptions.find((opt) => String(opt.value) === String(val))?.label)
          .join(', ');
      }
      return placeholder;
    }
    return (
      allOptions.find((opt) => String(opt.value) === String(currentValue))?.label || placeholder
    );
  };

  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      <Select.Root
        value={currentValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        {...props}
      >
        <Select.Trigger
          className={`inline-flex items-center justify-between w-full px-2 ${
            compact ? 'py-0.5 text-xs' : 'py-2'
          } bg-white border border-gray-300 shadow-sm focus:outline-none disabled:bg-gray-50 disabled:text-gray-500`}
        >
          <Select.Value placeholder={placeholder}>{getDisplayValue()}</Select.Value>
          <Select.Icon className='ml-1'>
            <ChevronDownIcon className={compact ? 'w-3 h-3' : ''} />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content className='overflow-hidden bg-white border border-gray-200 z-50'>
            <Select.ScrollUpButton className='flex items-center justify-center h-6 bg-white cursor-default'>
              <ChevronUpIcon />
            </Select.ScrollUpButton>

            <Select.Viewport className='p-1'>
              <Select.Group>
                <Select.Label className='px-6 py-2 font-medium text-gray-500 uppercase'>
                  <Text>{label}</Text>
                </Select.Label>
                {allOptions.map((option) => {
                  return (
                    <Select.Item
                      key={option.value}
                      value={option.value.toString()}
                      className='relative flex items-center px-8 py-2 cursor-pointer select-none hover:bg-gray-500/50 focus:outline-none'
                    >
                      <Select.ItemText>
                        <Text>{option.label}</Text>
                      </Select.ItemText>
                      <Select.ItemIndicator className='absolute left-2 w-4 h-4 inline-flex items-center justify-center'>
                        ✓
                      </Select.ItemIndicator>
                    </Select.Item>
                  );
                })}
              </Select.Group>
            </Select.Viewport>

            <Select.ScrollDownButton className='flex items-center justify-center h-6 bg-white cursor-default'>
              <Text>↓</Text>
              <ChevronDownIcon />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
