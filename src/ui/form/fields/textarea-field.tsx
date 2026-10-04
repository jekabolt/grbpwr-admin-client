import { useFormContext } from 'react-hook-form';

import Textarea, { TextareaProps } from 'ui/components/text-area';

import { AiEnhance, type EnhanceField } from 'ui/components/ai-enhance';
import { Button } from 'ui/components/button';
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
   * `ai ✦` в углу поля (item 41: «везде», каждое свободное текстовое поле техкарты). Ключ поля —
   * закрытый список `EnhanceField`. Без него поле прежнее. Кнопка видна, пока фокус в поле и в нём
   * есть текст (правило `AiEnhance`), ответ пишется `setValue` с `shouldDirty`.
   */
  enhance?: EnhanceField;
  /** Факты карточки для `ai ✦` (`cardFactsContext`); необязательны. */
  enhanceContext?: string;
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
  enhance,
  enhanceContext,
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
            <div className='relative border border-textInactiveColor aria-[invalid=true]:border-error'>
              <Textarea
                disabled={loading}
                aria-invalid={!!fieldState.error || undefined}
                {...field}
                value={field.value || ''}
                maxLength={maxLength}
                {...props}
                className={cn(props.className, enhance && 'pb-7')}
                onBlur={onBlur}
                onChange={field.onChange}
              />
              {enhance && (
                <AiEnhance
                  field={enhance}
                  value={field.value || ''}
                  onApply={(text) =>
                    setValue(name, text, { shouldDirty: true, shouldValidate: true })
                  }
                  context={enhanceContext}
                  maxRunes={maxLength}
                  disabled={loading || !!props.disabled || !!props.readOnly}
                />
              )}
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
