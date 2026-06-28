import { useFormContext } from 'react-hook-form';
import Input, { InputProps } from 'ui/components/input';
import { sanitizeDecimal } from 'utils/decimal';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = Omit<InputProps, 'name' | 'onChange' | 'type'> & {
  name: string;
  label?: string;
  srLabel?: boolean;
  // max fractional digits kept (default 3); price/consumption rarely need more
  maxDecimals?: number;
};

// A text input that only ever holds a decimal string: digits + one dot + ≤maxDecimals
// fractional digits. Backs every decimal form field (width / weight / price / consumption /
// wastage / SAM …) so the user cannot type letters into a numeric field. The value is a
// plain string — convert at the schema boundary with inputToDecimal.
export default function DecimalField({ name, label, srLabel, maxDecimals = 3, ...props }: Props) {
  const { control, trigger } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          {label && <FormLabel className={srLabel ? 'sr-only' : ''}>{label}</FormLabel>}
          <FormControl>
            <Input
              inputMode='decimal'
              {...field}
              value={field.value ?? ''}
              {...props}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                field.onChange(sanitizeDecimal(e.target.value, maxDecimals))
              }
              onBlur={() => {
                field.onBlur();
                trigger(name);
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
