import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useId, type JSX } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import type { TechCardFormData } from '../schema';
import { useTechCardAutosave } from './autosave-contract';
import { FLAT_WORDS_MAX, flatHumanWords, flatWordsSent, followCategory } from './flat-route';
import { useGarmentClass } from './head/card-facts-form';
import { useShownWords } from './words-seed';

/**
 * ═══ FLAT › WORDS = ТО, ЧТО УХОДИТ (M14, владелец 07.10) ═════════════════════════════════════════
 *
 * «показывай в WORDS только то, что уходит». Поле показывало длинное описание карточки
 * (`garmentDescription`: засев брифом модели + правки людей, одна строка без автора), а флэт из него
 * шлёт только строку класса (designgen.FlatWordsCarryDescription). Теперь в поле ровно то, что уйдёт:
 *   · первая строка — «garment: <класс>», та же, что шлёт сервер (`flatWordsSent` над описанием, с
 *     догоном категории M10, как у GENERATE); здесь не правится — она идёт за категорией;
 *   · под ней — строки ЧЕЛОВЕКА (`flatWords`): их пишет только этот textarea, без `ai ✦` и без засева,
 *     поэтому автор известен по построению, и сервер шлёт их как напечатаны (designgen.FlatGarmentNote).
 * Описание карточки не тронуто: оно живёт, где жило, для рендера и 3D, и во флэт не уходит.
 *
 * Один хук на поле и на «what the model gets» (`useFlatWords`) — два экрана одних слов не расходятся.
 */
export function useFlatWords(techCardId: number, readOnly: boolean) {
  const { control } = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const live = !readOnly && autosave.status !== 'off';
  const description = useShownWords(techCardId, control, live);
  const garmentClass = useGarmentClass();
  const human = ((useWatch({ control, name: 'flatWords' }) ?? '') as string) || '';
  // M10: GENERATE moves a seeded class line to the card's category before it saves (flat-run-row), so
  // the line shown is the one that will travel — only where GENERATE can write.
  const followed = live
    ? followCategory(description, garmentClass.current, garmentClass.seeded)
    : description;
  const classLine = flatWordsSent(followed);
  return {
    /** «garment: <class>» as it will travel, or ''. */
    classLine,
    /** The person's lines as they will travel. */
    human: flatHumanWords(human),
    /** Everything the flat sends in words, as the server assembles it. */
    sent: flatWordsSent(followed, human),
  };
}

export function FlatWordsField({
  techCardId,
  disabled,
  readOnly,
}: {
  techCardId: number;
  /** The card cannot be written. */
  disabled?: boolean;
  /** A run is being started: the words do not move under it. */
  readOnly?: boolean;
}): JSX.Element {
  const { control } = useFormContext<TechCardFormData>();
  const field = useController({ control, name: 'flatWords' });
  const id = useId();
  const { classLine } = useFlatWords(techCardId, !!disabled);
  // A server that does not keep the field never sends it back (`undefined`): typing would put a key
  // on the card's save that it refuses whole (DiscardUnknown = false) — the box stays shut.
  const { data: saved } = useTechCard(techCardId > 0 ? techCardId : undefined);
  const speaks = typeof saved?.techCard?.flatWords === 'string';
  const value = ((field.field.value ?? '') as string) || '';
  const off = !!disabled || !speaks;

  return (
    <>
      <label htmlFor={id} className='sr-only'>
        the flat&apos;s words: {classLine || 'no garment class'}, then your own lines
      </label>
      <div className='relative' data-flat-words=''>
        {/* THE CLASS LINE — inside the box, because it is sent with the lines under it; not text of
            the field, because it follows the category and is not typed here. */}
        <span
          aria-hidden='true'
          data-flat-words-class={classLine}
          title='follows the card’s category'
          className={cn(
            'pointer-events-none absolute left-px right-px top-px truncate px-[7px] pt-[3px] text-textBaseSize leading-[18px]',
            classLine ? 'text-textColor' : 'text-labelColor',
          )}
        >
          {classLine || 'garment: —'}
        </span>
        <Textarea
          name={field.field.name}
          ref={field.field.ref}
          id={id}
          value={value}
          onChange={field.field.onChange}
          onBlur={field.field.onBlur}
          disabled={off}
          readOnly={readOnly}
          data-field='flatWords'
          rows={2}
          maxLength={FLAT_WORDS_MAX}
          placeholder={speaks ? 'your own lines, sent as typed' : ''}
          style={{ paddingTop: 21, paddingBottom: 22 }}
        />
        <Text
          size='nano'
          variant='label'
          component='span'
          data-flat-words-count={value.length}
          className='pointer-events-none absolute bottom-[6px] right-[10px] tabular-nums'
        >
          {value.length} / {FLAT_WORDS_MAX}
        </Text>
      </div>
    </>
  );
}
