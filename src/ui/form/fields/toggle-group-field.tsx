import { useFormContext } from 'react-hook-form';

import { ToggleSwitch } from 'ui/components/toggle-switch';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = {
  name: string;
  label: string;
  items: { value: string | number; label: string }[];
  disabled?: boolean;
};

export default function ToggleGroupField({ name, label, items, disabled }: Props) {
  const { control, trigger } = useFormContext();

  function onBlur() {
    trigger(name);
  }

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className='grid grid-cols-2 gap-2 pt-2'>
            {items.map((item) => {
              const value = item.value;
              const selected = Array.isArray(field.value) ? field.value.includes(value) : false;

              return (
                <FormControl key={value}>
                  <ToggleSwitch
                    label={item.label}
                    checked={selected}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      const current = Array.isArray(field.value) ? field.value : [];
                      if (checked) {
                        if (!current.includes(value)) field.onChange([...current, value]);
                      } else {
                        field.onChange(current.filter((v: string | number) => v !== value));
                      }
                      onBlur();
                    }}
                  />
                </FormControl>
              );
            })}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
