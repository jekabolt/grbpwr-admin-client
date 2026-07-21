import { useFormContext } from 'react-hook-form';

import Textarea, { TextareaProps } from 'ui/components/text-area';

import { Button } from 'ui/components/button';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = TextareaProps & {
  description?: string;
  loading?: boolean;
  label?: string;
  srLabel?: boolean;
  maxLength?: number;
  showCharCount?: boolean;
  upsertButton?: boolean;
};

export default function TextareaField({
  loading,
  name,
  label,
  description,
  srLabel,
  maxLength,
  showCharCount = false,
  upsertButton = false,
  onUpsert,
  ...props
}: Props) {
  const { control, trigger, watch } = useFormContext();
  const value = watch(name) || '';

  function onBlur() {
    trigger(name);
  }

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          {label && <FormLabel className={srLabel ? 'sr-only' : ''}>{label}</FormLabel>}
          <FormControl>
            {/* FormControl's aria-invalid lands on this wrapper (it owns the visible border, so the
                red outline belongs here); the textarea gets its own so screen readers hear it on
                the control the user is actually in, not just on a decorative div. */}
            <div className='relative border border-textInactiveColor aria-[invalid=true]:border-error'>
              <Textarea
                disabled={loading}
                aria-invalid={!!fieldState.error || undefined}
                {...field}
                value={field.value || ''}
                maxLength={maxLength}
                {...props}
                onBlur={onBlur}
                onChange={field.onChange}
              />
              {upsertButton && (
                <Button
                  variant='main'
                  size='lg'
                  className='absolute bottom-2 left-2'
                  onClick={() => onUpsert?.(value)}
                >
                  leave comment
                </Button>
              )}
              {showCharCount && (
                <div className='absolute bottom-2 right-2 text-textBaseSize text-textInactiveColor'>
                  {value.length}
                  {maxLength && `/${maxLength}`}
                </div>
              )}
            </div>
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
