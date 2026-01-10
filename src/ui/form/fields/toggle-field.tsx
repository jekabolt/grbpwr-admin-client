import { useFormContext } from 'react-hook-form';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { FormControl, FormField, FormItem } from '..';

type Props = {
  name: string;
  label?: string;
  disabled?: boolean;
};

export default function ToggleField({ name, label, disabled }: Props) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <ToggleSwitch
              checked={field.value}
              onCheckedChange={field.onChange}
              label={label}
              disabled={disabled}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
