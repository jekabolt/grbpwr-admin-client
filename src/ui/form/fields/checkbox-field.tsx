import { useFormContext } from 'react-hook-form';

import { cn } from 'lib/utility';
import Checkbox from 'ui/components/checkbox';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = {
  name: string;
  label: string | React.ReactNode;
  description?: string;
  loading?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  [k: string]: any;
};

export default function CheckboxField({ label, name, description, readOnly, ...props }: Props) {
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
          <div className='flex items-center gap-x-4'>
            <FormControl>
              <Checkbox
                {...field}
                checked={field.value}
                onCheckedChange={field.onChange}
                onBlur={onBlur}
                disabled={readOnly}
                {...props}
              />
            </FormControl>
            <div
              className={cn('leading-none', {
                'space-y-1': description,
              })}
            >
              <FormLabel>{label}</FormLabel>
            </div>
          </div>
          <FormMessage fieldName={name} />
        </FormItem>
      )}
    />
  );
}
