import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import Input from 'ui/components/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = {
  name: string;
  label?: string;
  placeholder?: string;
  options: string[];
  className?: string;
};

// A dropdown that also accepts free text: a styled text input backed by a native
// <datalist> of suggestions. Looks like a dropdown (suggestions on focus/typing) but never
// boxes the user in — needed for fields whose vocabulary is common-but-not-closed (node,
// machine, seam type, needle, thread, attachment…).
export default function ComboField({ name, label, placeholder, options, className }: Props) {
  const { control, trigger } = useFormContext();
  const listId = `list-${useId().replace(/:/g, '')}`;

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel>{label}</FormLabel>}
          <FormControl>
            <Input
              {...field}
              value={field.value ?? ''}
              list={listId}
              placeholder={placeholder}
              className={className}
              autoComplete='off'
              onChange={field.onChange}
              onBlur={() => {
                field.onBlur();
                trigger(name);
              }}
            />
          </FormControl>
          <datalist id={listId}>
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
