import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

import { AnnotationCanvas } from './annotation-canvas';
import { TechCardFormData, wireInt, type AnnotationForm, type OperationMediaForm } from './schema';

// ФОТОГРАФИИ ШАГА — ФИЛМСТРИП, а не одна картинка и не галерея.
//
// Шагов на карточке до тринадцати, и у сложного узла законно три-четыре снимка: общий вид, узел
// вблизи, изнанка. Показывать их сеткой значило бы отдать снимкам весь экран редактора шага;
// показывать по одному — прятать существование остальных. Полоса миниатюр решает оба: видно,
// сколько их и какой открыт.
//
// URL ЖИВЁТ НЕ В ФОРМЕ. Форма возит только `media_id` — это то, что уходит на сервер. Адрес
// картинки приходит с чтения карточки (`resolved_operation_media`), а для только что выбранных
// файлов держится в сессионном словаре ниже: между выбором и первым сохранением сервер о них ещё
// не знает, и без словаря свежий снимок показывался бы пустым прямоугольником.

/**
 * Адреса только что выбранных медиа, id → url. Модульный, потому что переживает перемонтирование
 * редактора шага (переключение между шагами) — иначе выбранная и ещё не сохранённая картинка
 * исчезала бы при первом же клике на соседний шаг. Медиа-id и адрес неизменны, поэтому словарь
 * не устаревает; растёт он на число картинок, выбранных за сессию.
 */
const sessionUrls = new Map<number, string>();

export function OperationMediaStrip({
  name,
  urlById,
  frozen = false,
}: {
  /** Путь поля-массива: `operations.${index}.media`. */
  name: `operations.${number}.media`;
  /** Адреса сохранённых картинок с чтения карточки. */
  urlById: Map<number, string>;
  frozen?: boolean;
}) {
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  // ПОДПИСКА, А НЕ `getValues`. Холст пишет выноски в `…media.k.annotations` — это не имя
  // fieldArray и не наблюдаемый лист, поэтому массив-событие RHF не стреляет, и снимок,
  // прочитанный один раз, протухает мгновенно. С `getValues` первая поставленная выноска не
  // появлялась на экране, а вторая ЗАТИРАЛА её: обе писались поверх одного и того же старого
  // списка.
  const watched = useWatch({ control, name }) as OperationMediaForm[] | undefined;
  const [openIndex, setOpenIndex] = useState(0);

  const urlOf = (mediaId: number) => urlById.get(mediaId) ?? sessionUrls.get(mediaId) ?? '';

  const add = (picked: common_MediaFull[]) => {
    const existing = new Set(
      ((getValues(name) ?? []) as OperationMediaForm[]).map((m) => wireInt(m.mediaId)),
    );
    const rows: OperationMediaForm[] = [];
    for (const m of picked) {
      const id = wireInt(m.id);
      const url = m.media?.fullSize?.mediaUrl ?? m.media?.thumbnail?.mediaUrl ?? '';
      if (!id || existing.has(id)) continue;
      if (url) sessionUrls.set(id, url);
      existing.add(id);
      rows.push({ mediaId: id, caption: '', annotations: [] });
    }
    if (rows.length === 0) return;
    append(rows, { shouldFocus: false });
    setOpenIndex(fields.length);
  };

  const list = (watched ?? []) as OperationMediaForm[];
  const open = Math.min(openIndex, Math.max(0, list.length - 1));
  const current = list[open];
  const currentUrl = current ? urlOf(wireInt(current.mediaId)) : '';

  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          фото узла{fields.length > 0 ? ` · ${fields.length}` : ''}
        </Text>
        {!frozen && (
          <MediaSelector
            label='добавить фото'
            aspectRatio={['Custom']}
            allowMultiple
            showVideos={false}
            saveSelectedMedia={add}
            triggerClassName='uppercase px-2 py-0.5 text-micro'
          />
        )}
      </div>

      {fields.length === 0 ? (
        <Text size='micro' variant='label'>
          {frozen
            ? 'фотографий у этого шага нет'
            : 'добавьте снимок узла — на нём можно расставить указания: мерки, подписи, участки'}
        </Text>
      ) : (
        <>
          {/* Полоса миниатюр: видно, сколько снимков и какой открыт. Порядок — порядок печати. */}
          <ChipRow>
            {fields.map((f, i) => (
              <Chip
                key={f.id}
                nonForm
                dashed={i !== open}
                onClick={() => setOpenIndex(i)}
                title={(list[i]?.caption ?? '').trim() || `снимок ${i + 1}`}
              >
                {i + 1}
                {(list[i]?.annotations?.length ?? 0) > 0 ? ` · ${list[i].annotations.length}` : ''}
              </Chip>
            ))}
            {!frozen && fields.length > 1 && (
              <>
                <Chip
                  dashed
                  onClick={() => open > 0 && (move(open, open - 1), setOpenIndex(open - 1))}
                  title='раньше в порядке показа и печати'
                >
                  ←
                </Chip>
                <Chip
                  dashed
                  onClick={() => open < fields.length - 1 && (move(open, open + 1), setOpenIndex(open + 1))}
                  title='позже в порядке показа и печати'
                >
                  →
                </Chip>
              </>
            )}
            {!frozen && fields.length > 0 && (
              <Chip
                dashed
                onClick={() => {
                  remove(open);
                  setOpenIndex(Math.max(0, open - 1));
                }}
                title='снять снимок с шага; сам файл в библиотеке остаётся'
              >
                убрать
              </Chip>
            )}
          </ChipRow>

          {current && (
            <div className='flex flex-col gap-1'>
              {currentUrl ? (
                <AnnotationCanvas
                  src={currentUrl}
                  alt={(current.caption ?? '').trim() || 'фото узла'}
                  annotations={(current.annotations ?? []) as AnnotationForm[]}
                  frozen={frozen}
                  onChange={
                    frozen
                      ? undefined
                      : (next) =>
                          setValue(`${name}.${open}.annotations`, next, {
                            shouldDirty: true,
                          })
                  }
                />
              ) : (
                // ЧЕСТНОЕ СОСТОЯНИЕ, А НЕ ПУСТОЙ ПРЯМОУГОЛЬНИК: адрес не пришёл ни с чтения, ни
                // из сессии — значит картинку показать нечем, и сказать это надо словом.
                <div className='border border-dashed border-borderColor px-2 py-6 text-center'>
                  <Text size='micro' variant='label'>
                    адрес снимка не разрешён — сохраните карточку, чтобы он приехал с сервера
                  </Text>
                </div>
              )}
              {!frozen && (
                <input
                  value={current.caption ?? ''}
                  onChange={(e) =>
                    setValue(`${name}.${open}.caption`, e.target.value, { shouldDirty: true })
                  }
                  placeholder='подпись к снимку — что на нём (печатается рядом с шагом)'
                  maxLength={255}
                  className={cn(
                    'w-full border border-borderColor bg-bgColor px-1 py-px text-micro',
                    'focus:border-textColor focus:outline-none',
                  )}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
