import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';

import Textarea, { TextareaProps } from '../../components/text-area';

import { Button } from '../../components/button';
import { cn } from 'lib/utility';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '..';

type Props = TextareaProps & {
  description?: string;
  loading?: boolean;
  label?: string;
  srLabel?: boolean;
  maxLength?: number;
  showCharCount?: boolean;
  upsertButton?: boolean;
  /**
   * Слот в нижнем углу поля (техкарта кладёт сюда `ai ✦` — `AiTextareaField`). Получает текущее
   * значение и `apply`, который пишет `setValue` с `shouldDirty`. Без него поле прежнее.
   */
  corner?: (api: TextareaCornerApi) => ReactNode;
};

export type TextareaCornerApi = {
  value: string;
  apply: (text: string) => void;
  disabled: boolean;
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
  corner,
  ...props
}: Props) {
  const { control, trigger, watch, setValue } = useFormContext();
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
            <div className='relative border border-borderColor aria-[invalid=true]:border-error'>
              <Textarea
                disabled={loading}
                aria-invalid={!!fieldState.error || undefined}
                {...field}
                value={field.value || ''}
                maxLength={maxLength}
                {...props}
                className={cn(props.className, corner && 'pb-7')}
                onBlur={onBlur}
                onChange={field.onChange}
              />
              {corner?.({
                value: field.value || '',
                apply: (text) => setValue(name, text, { shouldDirty: true, shouldValidate: true }),
                disabled: !!loading || !!props.disabled || !!props.readOnly,
              })}
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
                <div className='absolute bottom-2 right-2 text-textBaseSize text-borderColor'>
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
