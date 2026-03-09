import { useFormContext } from 'react-hook-form';
import Input, { InputProps } from 'ui/components/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = Omit<InputProps, 'name'> & {
  name: string;
  description?: string;
  loading?: boolean;
  keyboardRestriction?: RegExp;
  validateOnBlur?: boolean;
  valueAsNumber?: boolean;
};

export default function InputField({
  loading,
  name,
  label,
  type = 'text',
  srLabel,
  keyboardRestriction,
  validateOnBlur = true,
  valueAsNumber = false,
  ...props
}: Props) {
  const { control, trigger, setValue } = useFormContext();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!keyboardRestriction || e.ctrlKey || e.metaKey) return;

    const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter'];
    if (allowedKeys.includes(e.key) || e.key.startsWith('Arrow')) return;

    if (!keyboardRestriction.test(e.key)) e.preventDefault();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (keyboardRestriction) {
      value = value.replace(new RegExp(`[^${keyboardRestriction.source}]`, 'g'), '');
      value = value.replace(/[ .'-]{2,}/g, (match) => match[0]);
    }
    const finalValue = valueAsNumber
      ? (value === '' ? 0 : parseInt(value, 10))
      : value;
    setValue(name, finalValue);
  };

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel className={srLabel ? 'sr-only' : ''}>{label}</FormLabel>}
          <FormControl>
            <Input
              type={type}
              disabled={loading}
              {...field}
              value={field.value ?? ''}
              {...props}
              onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                field.onBlur();
                if (validateOnBlur) trigger(name);
              }}
              onKeyDown={handleKeyDown}
              onChange={
                props.onChange
                  ? (e: React.ChangeEvent<HTMLInputElement>) => props.onChange!(e)
                  : keyboardRestriction
                    ? handleChange
                    : valueAsNumber
                      ? (e: React.ChangeEvent<HTMLInputElement>) =>
                          field.onChange(
                            e.target.value === '' ? undefined : e.target.valueAsNumber
                          )
                      : field.onChange
              }
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
