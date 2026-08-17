import { common_MediaFull } from 'api/proto-http/admin';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { kindDef } from 'ui/components/annotation/kinds';
import type { AnnotationColorKey, AnnotationKindKey } from 'ui/components/annotation/wire';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import TextareaField from 'ui/form/fields/textarea-field';
import { useDisclosure } from './disclosure';
import { FittingFormData } from './schema';

type FormCallout = {
  number?: number;
  note?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
  kind?: AnnotationKindKey;
  points?: { x: string; y: string }[];
  color?: AnnotationColorKey;
  dashed?: boolean;
  filled?: boolean;
};

// The text detail behind the pins FittingMedia draws on the photos: the same `callouts` field
// array, just as an editable list — number, which photo it's pinned to, and the note itself. This
// is the "advanced" view: collapsed by default; once notes exist you'll want to skim them, but a
// click on a photo (which appends here too) is normally enough on its own.
//
// «REACT HOOK FORM ДЕРЖИТ ОБА СПИСКА В СОГЛАСИИ САМ» — ЗДЕСЬ СТОЯЛО ИМЕННО ЭТО, И ЭТО НЕПРАВДА.
// Замерено на стенде: пин, поставленный на фотографии, НЕ появлялся в этом списке — счётчик так и
// говорил «fit notes (4)» после пятого пина. Собственные мутаторы `useFieldArray` (`append`,
// `remove`) до второго экземпляра на том же имени не доходят вообще. Поэтому состав правится
// ТОЛЬКО через `writeCallouts` (setValue по имени массива), а `fields` остаются здесь ровно
// источником устойчивых ключей — значения читаются живыми.
export function FittingCallouts({ mediaById }: { mediaById: Map<number, common_MediaFull> }) {
  const { control, setValue, getValues } = useFormContext<FittingFormData>();
  const { fields } = useFieldArray({ control, name: 'callouts' });
  const mediaIds = (useWatch({ control, name: 'mediaIds' }) ?? []) as number[];
  // ЖИВЫЕ ЗНАЧЕНИЯ, А НЕ `fields`. `fields` — СНИМОК состава на момент последней пересборки
  // массива, и точечная запись (перепривязка пина к другому снимку, снятие пина при удалении
  // фотографии) в него не попадает: заголовок продолжал называть прежнюю фотографию, пока сам
  // селект под ним уже показывал новую. `fields` остаются только источником устойчивых ключей.
  const values = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const [open, toggle] = useDisclosure(fields.length > 0);

  // Правка СОСТАВА — только через имя массива: собственные мутаторы `useFieldArray` не доходят до
  // второго экземпляра на том же имени (он живёт в галерее), и заметка, заведённая здесь, не
  // появлялась пином на фотографии, а удалённая здесь — не исчезала с неё.
  const writeCallouts = (next: FormCallout[]) =>
    setValue('callouts', next as FittingFormData['callouts'], { shouldDirty: true });

  const imageUrl = (id: number) => {
    const f = mediaById.get(id);
    return f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl || '';
  };
  // ТОТ ЖЕ РЯД И ТА ЖЕ НУМЕРАЦИЯ, ЧТО В ГАЛЕРЕЕ. Здесь стоял фильтр по разрешённому адресу, и от
  // него ломалось ровно то, ради чего список существует: неразрешённая фотография выпадала из
  // ряда, СДВИГАЯ номера всех следующих (заметка на третьем снимке подписывалась «photo #2»), а
  // сама подписывалась «photo #0» с пустым селектом — то есть выглядела сломанной, хотя пин
  // стоял на месте. Номер снимка — это позиция в `mediaIds`, и другого определения у него нет.
  const views = mediaIds;
  const viewIndex = (id: number) => views.indexOf(id) + 1;

  const pinOptions = [
    { value: 0, label: '— unanchored —' },
    ...views.map((id, i) => ({
      value: id,
      // Неразрешённый снимок остаётся законной мишенью пина: указание на нём живо, и увести его
      // отсюда должно быть можно — но выбирать вслепую человека заставлять нельзя.
      label: imageUrl(id) ? `photo #${i + 1}` : `photo #${i + 1} · address not resolved`,
    })),
  ];

  return (
    <div className='border-t border-textInactiveColor pt-3'>
      <button
        type='button'
        onClick={toggle}
        aria-expanded={open}
        className='flex w-full cursor-pointer items-center justify-between gap-2 text-left'
      >
        <Text variant='uppercase' size='small'>
          fit notes {fields.length ? `(${fields.length})` : ''}
        </Text>
        <Text variant='inactive' size='small' className='uppercase'>
          {open ? '− hide' : '+ show'}
        </Text>
      </button>

      {open && (
        <div className='mt-3 flex flex-col gap-3'>
          {fields.length === 0 ? (
            <Text variant='inactive' size='small'>
              no fit notes — click a photo above to pin one
            </Text>
          ) : (
            fields.map((f, index) => {
              const pinnedTo = values[index]?.mediaId ?? 0;
              const c = values[index];
              // ЗАГОЛОВОК НАЗЫВАЕТ НОМЕР, А НЕ ПОЗИЦИЮ. Здесь стояло `fit note ${index + 1}`, и
              // после удаления заметки из середины список говорил «fit note 3» строке с номером 4 —
              // а ссылается на неё замечание именно НОМЕРОМ. Позиция в списке не адресует ничего.
              const number = c?.number ?? index + 1;
              // ВИД — В ЗАГОЛОВКЕ. Без него обведённая зона и размерная линия выглядят в списке
              // одинаково, как две записки, и найти ту, о которой говорят, можно только кликая
              // пины на кадре.
              const kind = kindDef(c?.kind);
              return (
                <div key={f.id} className='flex flex-col gap-2'>
                  <GroupLabel
                    flush={index === 0}
                    action={
                      <Button
                        type='button'
                        variant='secondary'
                        aria-label='remove fit note'
                        onClick={() =>
                          writeCallouts(
                            ((getValues('callouts') ?? []) as FormCallout[]).filter(
                              (_, ci) => ci !== index,
                            ),
                          )
                        }
                      >
                        ✕
                      </Button>
                    }
                  >
                    {`fit note #${number} · ${kind.label}${
                      pinnedTo <= 0
                        ? ' · unanchored'
                        : viewIndex(pinnedTo) > 0
                          ? ` · photo #${viewIndex(pinnedTo)}`
                          : // Указание помнит снимок, которого в примерке БОЛЬШЕ НЕТ. «photo #0»
                            // читалось как поломка нумерации; на деле это открепление, и назвать
                            // его надо словом — иначе заметку не найти и не переприкрепить.
                            ' · photo detached'
                    }`}
                  </GroupLabel>
                  <div className='grid grid-cols-1 gap-2 lg:grid-cols-2'>
                    {/* Auto-assigned (max existing number + 1) and a cross-reference target
                        (changeRequests.calloutNumber) — read-only so hand-edits can't collide
                        with the sequence. Kept in the field array so it still round-trips. */}
                    <div className='flex flex-col gap-1'>
                      <Text variant='label' size='small' component='span'>
                        number
                      </Text>
                      <Text variant='label' className='tabular-nums'>
                        {values[index]?.number ?? index + 1}
                      </Text>
                    </div>
                    <Controller
                      control={control}
                      name={`callouts.${index}.mediaId`}
                      render={({ field }) => (
                        <label className='flex flex-col gap-1'>
                          <Text variant='label' size='small' component='span'>
                            pinned to
                          </Text>
                          <Select
                            name={`callouts.${index}.mediaId`}
                            items={pinOptions}
                            value={field.value != null ? String(field.value) : field.value}
                            onValueChange={(val: string | undefined) => {
                              const next = Number(val ?? 0);
                              // Re-pinning to another photo: recenter the marker on the new
                              // view — keeping the old coords would point it at an unrelated
                              // spot; unanchoring (0) clears the pin entirely.
                              if (next !== (field.value ?? 0)) {
                                setValue(`callouts.${index}.posX`, next ? '0.500' : '', {
                                  shouldDirty: true,
                                });
                                setValue(`callouts.${index}.posY`, next ? '0.500' : '', {
                                  shouldDirty: true,
                                });
                                // ЯКОРЯ НЕ ПЕРЕЕЗЖАЮТ ВМЕСТЕ С МАРКЕРОМ. Доли кадра осмысленны
                                // только на СВОЁМ снимке: маркер здесь честно ставят в середину, а
                                // фигура легла бы на новую фотографию по координатам старой — с
                                // виду нормальная линия, показывающая не туда. Заметка остаётся,
                                // геометрию рисуют заново там, где она теперь стоит.
                                setValue(`callouts.${index}.kind`, 'pin', { shouldDirty: true });
                                setValue(`callouts.${index}.points`, [], { shouldDirty: true });
                              }
                              field.onChange(next);
                            }}
                            fullWidth
                          />
                        </label>
                      )}
                    />
                  </div>
                  <TextareaField
                    name={`callouts.${index}.note`}
                    label='note (что не так с посадкой)'
                    rows={2}
                    maxLength={2000}
                  />
                  {/* БЕЗ ТЕКСТА УКАЗАНИЕ НЕ СОХРАНЯЕТСЯ, и сказать это надо ЗДЕСЬ. Записка
                      обязательна на сервере («fitting callout note is required»), поэтому
                      безымянная заметка отсеивается адаптером — иначе отказом падало бы сохранение
                      ВСЕЙ примерки. Обведённая зона без подписи выглядит законченной работой:
                      промолчав, экран дал бы человеку уйти со страницы, потеряв её. */}
                  {!c?.note?.trim() && (
                    <Text size='small' className='text-error'>
                      без текста не сохранится — впишите, что не так с посадкой
                    </Text>
                  )}
                </div>
              );
            })
          )}
          <Button
            type='button'
            variant='main'
            className='uppercase'
            onClick={() => {
              // max+1, not length+1: after a mid-list delete, length+1 collides with an existing
              // number — and the number is read-only, so a duplicate can't be fixed by hand.
              // Считается по ЖИВЫМ значениям: `fields` — снимок, и после правки состава из
              // галереи он назвал бы номер, который уже занят.
              const current = (getValues('callouts') ?? []) as FormCallout[];
              writeCallouts([
                ...current,
                {
                  number: Math.max(0, ...current.map((c) => c.number ?? 0)) + 1,
                  note: '',
                  mediaId: 0,
                  posX: '',
                  posY: '',
                  // ГРУППА ГЕОМЕТРИИ ЗАВОДИТСЯ ЦЕЛИКОМ, даже когда она пустая: заметка без снимка
                  // это точка, и она обязана уехать на провод ЯВНЫМ пином. Пропущенный `kind`
                  // означал бы «этот бандл про геометрию молчит», и сервер понёс бы дальше
                  // хранимую фигуру — чужую, от выноски с тем же номером.
                  kind: 'pin',
                  points: [],
                  color: '',
                  dashed: false,
                  filled: false,
                },
              ]);
            }}
          >
            add fit note
          </Button>
        </div>
      )}
    </div>
  );
}
