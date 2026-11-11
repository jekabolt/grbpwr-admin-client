import { useFormContext } from 'react-hook-form';
import { LineField, type LineFieldProps } from '../../components/line-field';
import { FormField } from '..';

type Props = Omit<LineFieldProps, 'name' | 'value' | 'defaultValue' | 'error'> & {
  name: string;
};

/**
 * `LineField` bound to react-hook-form, the `InputField` pattern without a message: a failed
 * rule turns the line red and the placeholder stays.
 */
export default function LineInputField({ name, onBlur, onChange, ...props }: Props) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <LineField
          {...props}
          ref={field.ref}
          name={field.name}
          value={field.value ?? ''}
          error={!!fieldState.error}
          onChange={(e) => {
            field.onChange(e);
            onChange?.(e);
          }}
          onBlur={(e) => {
            field.onBlur();
            onBlur?.(e);
          }}
        />
      )}
    />
  );
}
