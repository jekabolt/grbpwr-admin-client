import { ChangeEvent, FC } from 'react';

interface Input {
  value: string | number | undefined;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: 'text' | 'number';
  placeholder: string;
}

export const FilterInput: FC<Input> = ({ value, onChange, type = 'text', placeholder }) => {
  const displayValue =
    typeof value === 'object' && value !== null && value !== undefined
      ? (value as { value: string }).value?.toString() ?? ''
      : value;
  return <input type={type} value={displayValue} onChange={onChange} placeholder={placeholder} />;
};
