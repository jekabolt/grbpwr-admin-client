import type { ChangeEvent, JSX, Ref } from 'react';
import { AiEnhance } from 'ui/components/ai-enhance';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

/**
 * ═══ ОРГАН СЛОВ — ОДИН НА ДВА ЭКРАНА (27.09, O-61, D-60) ══════════════════════════════════════
 *
 * Владелец: «…и что бы сама форма поля выглядела также как во флетах для визуал консистенси».
 * Поле WORDS флэта (INPUT — REFERENCES, §1.2) и поле IN WORDS рендера (FABRIC RENDER) — это
 * ОДИН орган: textarea во всю ширину, в правом нижнем углу счётчик `N / 2000` и тихая `ai ✦`,
 * под полем строка «+N sections omitted», пока на экране засеянный текст. Он вынесен сюда из
 * `references-section.tsx` байт в байт: флэт рисует его теми же пропами, что и прежде, и его DOM
 * не поменялся ни узлом (фрагмент встаёт в ту же обёртку секции). Два написания одного поля
 * разошлись бы на первой же правке — в ширине, в кегле, в углу.
 *
 * ЧЕГО ЗДЕСЬ НЕТ, И ЭТО НАРОЧНО:
 *   · ПОДПИСИ. У каждого экрана своя грамматика заголовка: флэт подписывает поле строкой «words»,
 *     рендер — линейкой группы «in words» рядом с «cloth and colour» и «cloth is». Орган начинается
 *     под заголовком.
 *   · CLEAR. У флэта это дверь всего блока («clear the input ✕» — слова и роли), у рендера — дверь
 *     группы в слоте линейки. Кнопка в углу поля стала бы третьим органом в углу, где их уже два, и
 *     сделала бы два поля разными — ровно то, против чего эта волна.
 *   · ЗНАНИЯ О ФОРМЕ И ЗАСЕВЕ. Что показывать, куда писать правку и когда засев снимается, решает
 *     экран (`words-seed.ts`); орган рисует то, что ему дали, и отдаёт жесты.
 */

/**
 * ═══ ПОТОЛОК СЛОВ — ЕДИНСТВЕННОЕ НАПИСАНИЕ ЭТОГО ЧИСЛА ═══════════════════════════════════════
 *
 * Его читают `maxLength` самого поля, счётчик, `ai ✦` (`maxRunes`), строка «+N omitted» и засев
 * фактами флэта (`composeWords` — опускает секции ЦЕЛИКОМ, а не режет хвост). Два разных потолка на
 * одно поле — это способ потерять текст на том из них, который меньше (тот же довод, что у
 * `CONCEPT_MAX` в `./mood-board`).
 *
 * ⚠ ОН ЖЕ — ПОТОЛОК IN WORDS РЕНДЕРА, И ЭТО ПРОВЕРЕНО, А НЕ ПРИНЯТО. У `colour.words` на проводе
 * своего потолка нет (`common.DesignColourRecipe.words` — голая строка; сервер ограничивает лишь
 * весь `params` 8 КБ закодированных байт, `designMaxParamsBytes`). Значит число выбирает клиент, и
 * выбор один: по умолчанию рендер показывает слова флэта, засеянные в ЭТОТ потолок, — меньший
 * обрезал бы умолчание, а большему неоткуда взяться.
 */
export const WORDS_MAX = 2000;

export type WordsFieldProps = {
  /** id поля — адрес подписи для читалки экрана (`<label htmlFor>`). */
  id: string;
  /** Имя поля (у флэта — `garmentDescription` из `useController`). */
  name: string;
  /** Подпись для читалки экрана; она же `aria-label` поля. */
  label: string;
  /** Слова на экране: их показывает поле, считает счётчик и переписывает `ai ✦`. */
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  /** Сколько секций засева не влезло (`omittedOf`); 0 — строки под полем нет. */
  omitted: number;
  /** Контекст `ai ✦`: факты карточки у флэта, ткань и цвет прогона у рендера. */
  aiContext: string;
  aiDisabled?: boolean;
  /** Ответ `ai ✦` — заменяет текст поля. */
  onApply: (text: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  onBlur?: () => void;
  /** Реф формы (`field.ref`): им форма ставит фокус на поле при ошибке сохранения. */
  ref?: Ref<HTMLTextAreaElement>;
  /** Якорь двери «edit the description ▸» (`revealField` ищет по `[data-field]`) — только у флэта. */
  'data-field'?: string;
};

export function WordsField({
  id,
  label,
  value,
  onChange,
  placeholder,
  omitted,
  aiContext,
  aiDisabled,
  onApply,
  ...textarea
}: WordsFieldProps): JSX.Element {
  /* Счётчик внутри поля считает СЫРУЮ длину — ту же, по которой режет `maxLength`. */
  const length = value.length;
  return (
    <>
      <label htmlFor={id} className='sr-only'>
        {label}
      </label>
      {/* ═══ ПРАВЫЙ НИЖНИЙ УГОЛ ПОЛЯ — СЧЁТЧИК И `ai ✦`, ОДНОЙ СТРОКОЙ (r3 п.7 + D-20) ═════════
          Владелец: «счётчик characters у WORDS — внутри поля снизу справа» (r3) и «WORDS … с AI
          ENHANCE» (T24). Угол один, органов два — поэтому они стоят в нём ОДНОЙ СТРОКОЙ: число
          `N / 2000` и сразу за ним тихая кнопка `ai ✦` (контракт `AiEnhance`: правый нижний угол
          обёртки поля). Своё абсолютное место кнопки снято (`static`), чтобы она не легла на
          счётчик, — строку держит обёртка.

          ⚠ ЧИСЛО — СЫРАЯ ДЛИНА, А НЕ ОБРЕЗАННАЯ: режет `maxLength` по сырой длине.
          ⚠ `pointer-events: none` НЕСУЩИЙ, и кнопка его ОТМЕНЯЕТ для себя: угол лежит НАД полем, и
          клик в него мимо кнопки обязан ставить каретку. Полка под угол — нижний отступ поля
          (30px, инлайном: класса такого роста в собранном CSS может не быть). */}
      <div className='relative'>
        <Textarea
          {...textarea}
          id={id}
          value={value}
          onChange={onChange}
          rows={3}
          maxLength={WORDS_MAX}
          placeholder={placeholder}
          aria-label={label}
          style={{ paddingBottom: 30 }}
          className='resize-y'
        />
        <div
          data-words-corner=''
          /* `right: 16`, а не 6: в самом углу стоит ручка `resize-y` поля, и кнопка на ней
             закрывала бы её (замерено снимком стенда). */
          style={{
            position: 'absolute',
            bottom: 6,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          <Text
            size='nano'
            variant='label'
            component='span'
            data-words-count={length}
            className='tabular-nums'
          >
            {length} / {WORDS_MAX}
          </Text>
          <AiEnhance
            field='words'
            value={value}
            context={aiContext}
            maxRunes={WORDS_MAX}
            disabled={aiDisabled}
            className='static pointer-events-auto'
            onApply={onApply}
          />
        </div>
      </div>
      {/* ЗАСЕВ НЕ ВЛЕЗ ЦЕЛИКОМ — сказано числом секций, а не молчанием (D-20''): пока текст тот,
          что засеян (число живёт в сессионном замке и переживает смену шага); первая же правка
          делает строку неправдой, и она уходит. */}
      {omitted > 0 && (
        <Text size='micro' variant='label' component='p' data-words-omitted={omitted}>
          (+{omitted} section{omitted === 1 ? '' : 's'} omitted — the words hold {WORDS_MAX}{' '}
          characters)
        </Text>
      )}
    </>
  );
}
