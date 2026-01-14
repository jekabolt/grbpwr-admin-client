import { useFormContext } from 'react-hook-form';
import Input, { InputProps } from 'ui/components/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = Omit<InputProps, 'name'> & {
  name: string;
  description?: string;
  loading?: boolean;
  keyboardRestriction?: RegExp;
  validateOnBlur?: boolean;
};

export default function InputField({
  loading,
  name,
  label,
  type = 'text',
  srLabel,
  keyboardRestriction,
  validateOnBlur = true,
  ...props
}: Props) {
  const { control, trigger, setValue } = useFormContext();

  function onBlur() {
    if (validateOnBlur) trigger(name);
  }

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
    setValue(name, value);
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
              value={field.value || ''}
              {...props}
              onBlur={onBlur}
              onKeyDown={handleKeyDown}
              onChange={keyboardRestriction ? handleChange : field.onChange}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
