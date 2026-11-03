import { useFormContext } from 'react-hook-form';
import { Button, FormControl, FormField, FormItem, FormLabel, FormMessage, Input } from 'ui';
import { parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';

const STEP = 0.1;
const SHIFT_STEP = 1;
const STEPPER = 'absolute inset-y-px z-10 w-6 text-labelColor hover:text-textColor';

/**
 * One step of the field, in the form's own string. An empty field going down stays empty: nothing
 * was stated, and minus cannot state zero. Thousandths are rounded so 0.1 + 0.2 reads 0.3.
 */
export function steppedTime(raw: string | undefined, delta: number): string {
  const value = parseDecimalNumber(raw);
  const known = Number.isFinite(value);
  if (!known && delta < 0) return raw ?? '';
  const next = Math.round(((known ? value : 0) + delta) * 1000) / 1000;
  return String(Math.max(0, next));
}

/** The step's time, minutes: − and + at the box's edges, 0.1 a press, 1 with Shift; same for arrows. */
export function StepTimeField({ name, label }: { name: string; label: string }) {
  const { control, trigger } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const step = (direction: 1 | -1, shift: boolean) =>
          field.onChange(steppedTime(field.value, direction * (shift ? SHIFT_STEP : STEP)));
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className='relative'>
              <Button
                tabIndex={-1}
                aria-label='less time'
                className={`${STEPPER} left-px`}
                onClick={(e: React.MouseEvent) => step(-1, e.shiftKey)}
              >
                −
              </Button>
              <FormControl>
                <Input
                  inputMode='decimal'
                  {...field}
                  value={field.value ?? ''}
                  className='px-6 text-center tabular-nums'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    field.onChange(sanitizeDecimal(e.target.value))
                  }
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    step(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
                  }}
                  onBlur={() => {
                    field.onBlur();
                    trigger(name);
                  }}
                />
              </FormControl>
              <Button
                tabIndex={-1}
                aria-label='more time'
                className={`${STEPPER} right-px`}
                onClick={(e: React.MouseEvent) => step(1, e.shiftKey)}
              >
                +
              </Button>
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
