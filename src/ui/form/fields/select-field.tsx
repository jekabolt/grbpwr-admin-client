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
  // Побочный эффект выбора, вызываемый ПОСЛЕ записи в форму. Нужен там, где поле — лишь половина
  // связи, и вторую половину обязана дописать та же правка (выноска НАЗЫВАЕТ деталь, а деталь
  // ССЫЛАЕТСЯ на выноску номером — одно без другого связью не является).
  //
  // Отдельным параметром, а не через `...props`: они расстилаются ПОСЛЕ `{...field}`, и переданный
  // снаружи onValueChange просто затёр бы внутренний — поле перестало бы писать значение в форму.
  onAfterChange?: (value: string | number | undefined) => void;
  items: {
    label: string;
    value: string | number;
    // Listed but not choosable yet (the label says why) — see ui/components/select.
    disabled?: boolean;
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
  onAfterChange,
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
            onValueChange={(val: string | undefined) => {
              const next = valueAsNumber && val != null ? Number(val) : val;
              field.onChange(next);
              onAfterChange?.(next);
            }}
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
