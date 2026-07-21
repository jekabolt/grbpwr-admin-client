import { useFormContext } from 'react-hook-form';

import Select from 'ui/components/select';
import { FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = {
  name: string;
  label: string;
  placeholder?: string;
  loading?: boolean;
  className?: string;
  valueAsNumber?: boolean;
  items: {
    label: string;
    value: string | number;
  }[];
  [k: string]: any;
};

export default function SelectField({
  loading,
  items,
  name,
  label,
  className,
  valueAsNumber = false,
  ...props
}: Props) {
  const { control, trigger } = useFormContext();

  function onBlur() {
    trigger(name);
  }

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            onValueChange={(val: string | undefined) =>
              field.onChange(valueAsNumber && val != null ? Number(val) : val)
            }
            items={items}
            {...field}
            value={valueAsNumber && field.value != null ? String(field.value) : field.value}
            {...props}
            className={className}
            // This field is not wrapped in FormControl (a Radix Select has no single DOM control for
            // the Slot to clone onto), so the invalid flag is read straight off the field state.
            invalid={!!fieldState.error}
            onBlur={onBlur}
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
