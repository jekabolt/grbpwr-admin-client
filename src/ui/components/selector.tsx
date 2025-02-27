import { FormControl, InputLabel, MenuItem, Select as MuiSelect } from '@mui/material';

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

  const handleChange = (event: any) => {
    const newValue = event.target.value;

    if (multiple) {
      if (Array.isArray(newValue)) {
        if (newValue.includes('all')) {
          onChange([]);
        } else {
          onChange(newValue.filter((v) => v !== 'all'));
        }
      }
    } else {
      onChange(newValue === 'all' ? '' : newValue);
    }
  };

  const displayValue = multiple
    ? Array.isArray(value)
      ? value.includes('all')
        ? ['all']
        : value
      : []
    : value || (showAll ? 'all' : '');

  return (
    <FormControl size='small' disabled={disabled} className='w-full'>
      <InputLabel shrink id={`select-label-${label}`} className='uppercase'>
        {label}
      </InputLabel>
      <MuiSelect
        labelId={`select-label-${label}`}
        value={displayValue}
        label={label}
        onChange={handleChange}
        multiple={multiple}
        displayEmpty
        renderValue={(selected) => {
          if (multiple) {
            if (!selected || (Array.isArray(selected) && !selected.length)) return placeholder;
            if (Array.isArray(selected) && selected.includes('all')) return 'All';
            return (Array.isArray(selected) ? selected : [selected])
              .map((val) => allOptions.find((opt) => opt.value === val)?.label)
              .join(', ');
          }
          return allOptions.find((opt) => opt.value === selected)?.label || placeholder;
        }}
        {...props}
      >
        {allOptions.map((option) => (
          <MenuItem key={option.value} value={option.value} className='uppercase'>
            {option.label}
          </MenuItem>
        ))}
      </MuiSelect>
    </FormControl>
  );
}
