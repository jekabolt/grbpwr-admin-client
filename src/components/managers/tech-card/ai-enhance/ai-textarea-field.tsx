import type { ComponentProps } from 'react';
import { TextareaField } from 'ui';

import { AiEnhance, type EnhanceField } from './ai-enhance';

type Props = ComponentProps<typeof TextareaField> & {
  /**
   * `ai ✦` в углу поля (item 41: «везде», каждое свободное текстовое поле техкарты). Ключ поля —
   * закрытый список `EnhanceField`. Без него поле прежнее. Кнопка видна, пока фокус в поле и в нём
   * есть текст (правило `AiEnhance`), ответ пишется `setValue` с `shouldDirty`.
   */
  enhance?: EnhanceField;
  /** Факты карточки для `ai ✦` (`cardFactsContext`); необязательны. */
  enhanceContext?: string;
};

/** `TextareaField` with the tech card's `ai ✦` in its corner. */
export function AiTextareaField({ enhance, enhanceContext, ...props }: Props) {
  return (
    <TextareaField
      {...props}
      corner={
        enhance
          ? ({ value, apply, disabled }) => (
              <AiEnhance
                field={enhance}
                value={value}
                onApply={apply}
                context={enhanceContext}
                maxRunes={props.maxLength}
                disabled={disabled}
              />
            )
          : undefined
      }
    />
  );
}
