import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { cn } from 'lib/utility';
import { useState, type ReactNode } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { AnnotationToolbar, placingHint } from 'ui/components/annotation/toolbar';
import { Chip, ChipRow } from 'ui/components/chip';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { AnnotationCanvas } from './annotation-canvas';
import {
  wireInt,
  type AnnotationForm,
  type OperationMediaForm,
  type TechCardFormData,
} from './schema';

// ФОТОГРАФИИ ШАГА — ПОЛОСА КАДРОВ, а не одна картинка и не галерея.
//
// Шагов на карточке до тринадцати, и у сложного узла законно три-четыре снимка: общий вид, узел
// вблизи, изнанка. Раньше здесь была полоса НОМЕРОВ и один открытый кадр под ней: видно было,
// сколько снимков, но не что на них, — а выбирать «второй или третий» приходится именно по
// картинке. Теперь это тот же филмстрип, что у мудборда: каждый кадр РОСТОМ С ПОЛОСУ, ширину берёт
// от своих пропорций (альбомный шире), прокрутка только вбок. Снимок не режется, поэтому выноски
// по-прежнему ложатся ровно туда, куда их поставили.
//
// ПАНЕЛЬ ВИДОВ — ОДНА НА ПОЛОСУ, а не на каждом кадре. Шесть чипов под каждым из десяти снимков
// съели бы полосу целиком; и это тот же приём, которым живёт мудборд, — режимы принадлежат листу,
// а не отдельной картинке. Точки при этом набираются на СВОЁМ кадре: общий счётчик достраивал бы
// мерку, начатую на первом снимке, вторым кликом по третьему.
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

/** Зеркала серверных пределов (dto): узнать о них при сохранении всей карточки — поздно. */
const MAX_MEDIA_PER_STEP = 10;

/**
 * Высота кадра в полосе. Мудборд держит 480: там снимок — сам предмет разговора и занимает лист.
 * Здесь полоса живёт ВНУТРИ раскрытого шага, между полями и заметкой, и кадр в пол-экрана
 * выталкивал бы из виду сам шаг. 300 — рост, на котором узел ещё различим, а строчку на нём видно
 * в зуме, который у каждого кадра свой.
 */
const STRIP_HEIGHT = 300;

export function OperationMediaStrip({
  name,
  urlById,
  frozen = false,
  renderPiecePicker,
  pieceLabel,
  onEdit,
}: {
  /** Путь поля-массива: `operations.${index}.media`. */
  name: `operations.${number}.media`;
  /** Адреса сохранённых картинок с чтения карточки. */
  urlById: Map<number, string>;
  frozen?: boolean;
  /** Пикер детали кроя для редактора указания (силуэты из чертежа). Отдаёт выбранный ключ. */
  renderPiecePicker?: (opts: {
    selected: string[];
    onPick: (lineKey: string) => void;
  }) => ReactNode;
  pieceLabel?: (lineKey: string) => string | undefined;
  /**
   * Шаг ИЗМЕНЁН этой полосой. Зовётся у писателей, а не у разметки: приёмная модалка и холст
   * выносок живут в ПОРТАЛАХ, из секции дока фокус не всплывает, и сброс записи отмены по
   * `focusin` их не видит. Без этого «создал шаг в фулскрине → бросил на него снимок → ⌘Z»
   * сносил бы шаг вместе со снимком: запись отмены пережила бы правку, которой не заметила.
   * Наведения мышью для ⌘V достаточно — фокус не нужен, поэтому дыра не теоретическая.
   */
  onEdit?: () => void;
}) {
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
  const { fields, append, remove, move } = useFieldArray({ control, name });
  // ПОДПИСКА, А НЕ `getValues`. Холст пишет выноски в `…media.k.annotations` — это не имя
  // fieldArray и не наблюдаемый лист, поэтому массив-событие RHF не стреляет, и снимок,
  // прочитанный один раз, протухает мгновенно. С `getValues` первая поставленная выноска не
  // появлялась на экране, а вторая ЗАТИРАЛА её: обе писались поверх одного и того же старого
  // списка.
  const watched = useWatch({ control, name }) as OperationMediaForm[] | undefined;
  // Вид, выбранный на ВСЮ полосу. Сбрасывается, как только фигура поставлена: постановка — жест с
  // концом, а залипший режим ставит вторую мерку следующим кликом по снимку, которого не просили.
  const [placingKind, setPlacingKind] = useState<string | null>(null);
  // Сколько якорей набрано на ТОМ кадре, где идёт жест. Подсказку рисует общая панель — она одна,
  // а кадров десять, и повторить её под каждым значило бы превратить полосу в столбик одинаковых
  // строк. Кадры, где жеста нет, шлют ноль, поэтому максимум и есть «сколько набрано».
  //
  // КЛЮЧ — САМА ФОТОГРАФИЯ, а не позиция в полосе. По позиции запись переживала бы и удаление
  // кадра (оставаясь навсегда), и перестановку стрелками — и тогда подсказка показывала бы
  // «поставлено 2» от жеста, которого на этом снимке никто не начинал.
  const [placedByMedia, setPlacedByMedia] = useState<Record<number, number>>({});

  // `wireInt` ВНУТРИ, а не на совести вызывающего. Оба словаря ключуются нормализованным id, а
  // тип поля обещает `number` — сырое значение с провода (int64 приезжает СТРОКОЙ) тайпчекается и
  // промахивается на каждом чтении. Единственный сегодняшний вызов нормализует сам; следующий
  // может и забыть.
  const urlOf = (mediaId: number | string) =>
    urlById.get(wireInt(mediaId)) ?? sessionUrls.get(wireInt(mediaId)) ?? '';

  const add = (picked: common_MediaFull[]) => {
    const existing = new Set(
      ((getValues(name) ?? []) as OperationMediaForm[]).map((m) => wireInt(m.mediaId)),
    );
    const rows: OperationMediaForm[] = [];
    for (const m of picked) {
      // Предел тот же, что проверяет сервер: превысив его в форме, пользователь узнал бы об
      // отказе только при сохранении ВСЕЙ карточки, и не про этот шаг. Считается по ОДНОМУ
      // счётчику: `existing` пополняется каждым принятым снимком, и складывать его с длиной
      // `rows` значило бы учитывать одно и то же дважды — из десяти выбранных прошло бы пять.
      if (existing.size >= MAX_MEDIA_PER_STEP) break;
      const id = wireInt(m.id);
      const url = m.media?.fullSize?.mediaUrl ?? m.media?.thumbnail?.mediaUrl ?? '';
      if (!id || existing.has(id)) continue;
      if (url) sessionUrls.set(id, url);
      existing.add(id);
      rows.push({ mediaId: id, caption: '', annotations: [] });
    }
    if (rows.length === 0) return;
    append(rows, { shouldFocus: false });
    // Приёмка пришла из портала — `focusin` секции дока её не видит; гасим запись отмены здесь.
    onEdit?.();
    // НАМЕРЕНИЕ СНЯТЬ ОТМЕНЯЕТСЯ ДОБАВЛЕНИЕМ. Иначе «снял всё → передумал → добавил снимок»
    // уезжает на сервер как «снял и одновременно прислал», гейт отвергает противоречие, а
    // снять невидимый флаг в интерфейсе нечем — тупик до перезагрузки.
    setValue('mediaCleared', false, { shouldDirty: true });
  };

  // ⌘V и бросок файла прямо в полосу: скриншот узла из мессенджера прикрепляется без похода в
  // библиотеку. Оба жеста проходят приёмную модалку — превью, кроп, подтверждение, — и приходят
  // сюда готовым медиа, тем же путём, что и выбор мышью.
  //
  // Очередь вставки держится, только пока указатель или фокус внутри ЭТОЙ полосы, — иначе одна
  // вставка ушла бы во все тринадцать шагов сразу.
  const intake = useMediaIntake({
    enabled: !frozen && fields.length < MAX_MEDIA_PER_STEP,
    // Больше, чем осталось мест, не берём: `add` лишние всё равно отбросит, а проведённые через
    // кроп файлы остались бы в библиотеке молча.
    limit: MAX_MEDIA_PER_STEP - fields.length,
    onMedia: add,
  });

  const list = (watched ?? []) as OperationMediaForm[];
  const full = fields.length >= MAX_MEDIA_PER_STEP;
  // Считается ТОЛЬКО по живым кадрам: запись снятого снимка иначе жила бы в словаре вечно.
  const placed = list.reduce((m, f) => Math.max(m, placedByMedia[wireInt(f.mediaId)] ?? 0), 0);

  const setAnnotations = (index: number, next: AnnotationForm[]) => {
    setValue(`${name}.${index}.annotations`, next, { shouldDirty: true });
    // Холст выносок — тоже портал: см. `onEdit`.
    onEdit?.();
  };

  return (
    <div className='flex flex-col gap-1.5' {...intake.regionHandlers}>
      <div className='flex flex-wrap items-center gap-2'>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          unit photos{fields.length > 0 ? ` · ${fields.length}` : ''}
        </Text>
        {/* ПАНЕЛЬ ВИДОВ ОДНА НА ПОЛОСУ — режимы принадлежат листу, а не кадру. */}
        {!frozen && fields.length > 0 && (
          <AnnotationToolbar
            tool={placingKind}
            onTool={setPlacingKind}
            hint={
              placingKind
                ? placed > 0
                  ? placingHint(placingKind, placed)
                  : 'click the shot you need'
                : undefined
            }
          />
        )}
        {(intake.busy || intake.dragging) && (
          <Text size='micro' variant='label' component='span'>
            {intake.busy ? 'accepting the image from the clipboard…' : 'drop the file — the crop opens'}
          </Text>
        )}
      </div>

      {fields.length === 0 ? (
        // ПУСТОЕ МЕСТО — САМО СРЕДСТВО ЕГО ЗАПОЛНИТЬ. Кнопка «добавить фото» рядом с заголовком
        // читалась как ещё один контрол в ряду полей шага и терялась среди них; полосатый
        // плейсхолдер во всю ширину — это и есть слот, и он выглядит слотом.
        frozen ? (
          <Placeholder label='this step has no photos' className='h-20 w-full border-dashed' />
        ) : (
          <MediaSlot
            aspectRatio={['Custom']}
            heightPx={80}
            sizeClassName='w-full'
            label='+ unit photo'
            hint='callouts go on the shot: measurements, captions, spans'
            allowMultiple
            limit={MAX_MEDIA_PER_STEP}
            showVideos={false}
            onSelect={add}
          />
        )
      ) : (
        <>
          {/* Полоса кадров: рост один, ширина своя, прокрутка только вбок. */}
          <div className='flex items-start gap-2 overflow-x-auto overflow-y-hidden py-1'>
            {fields.map((f, i) => {
              // `fields` и наблюдаемый список расходятся на один кадр сразу после append: строка
              // уже есть, значения ещё нет. Пропустить кадр — правильнее, чем нарисовать его по
              // нулевому mediaId: тот показал бы «адрес не разрешён» на снимке, который через
              // такт приедет целым.
              const current = list[i];
              if (!current) return null;
              const url = urlOf(wireInt(current.mediaId));
              return (
                <div key={f.id} className='flex shrink-0 flex-col gap-1'>
                  {url ? (
                    <AnnotationCanvas
                      // Ключ — сама фотография: незавершённая постановка, выбор и перетаскивание
                      // это состояние ЭТОГО снимка.
                      key={wireInt(current.mediaId)}
                      src={url}
                      alt={(current.caption ?? '').trim() || `unit photo ${i + 1}`}
                      heightPx={STRIP_HEIGHT}
                      placingKind={placingKind}
                      onPlaced={() => setPlacingKind(null)}
                      onPlacedCountChange={(n) =>
                        setPlacedByMedia((prev) =>
                          prev[wireInt(current.mediaId)] === n
                            ? prev
                            : { ...prev, [wireInt(current.mediaId)]: n },
                        )
                      }
                      zoomable
                      annotations={(current.annotations ?? []) as AnnotationForm[]}
                      frozen={frozen}
                      renderPiecePicker={renderPiecePicker}
                      pieceLabel={pieceLabel}
                      onChange={frozen ? undefined : (next) => setAnnotations(i, next)}
                      cornerSlot={
                        !frozen ? (
                          <StripButton
                            label='✕'
                            title='remove the shot from the step; the file itself stays in the library'
                            onPress={() => {
                              remove(i);
                              onEdit?.();
                            }}
                          />
                        ) : undefined
                      }
                    />
                  ) : (
                    // ЧЕСТНОЕ СОСТОЯНИЕ, А НЕ ПУСТОЙ ПРЯМОУГОЛЬНИК: адрес не пришёл ни с чтения,
                    // ни из сессии — значит картинку показать нечем, и сказать это надо словом.
                    <Placeholder
                      label='address not resolved — save the card'
                      className='w-40 px-2 text-center'
                      style={{ height: STRIP_HEIGHT }}
                    />
                  )}

                  <div className='flex items-center gap-1'>
                    <Text size='nano' variant='label' component='span' className='tabular-nums'>
                      {i + 1}
                    </Text>
                    {!frozen && fields.length > 1 && (
                      <ChipRow>
                        {/* Перестановка — тоже ПИСАТЕЛЬ полосы, и `onEdit` зовётся у неё, как у
                            приёмки, снятия, подписи и выносок: правило «зовётся у писателей»
                            не терпит одного исключения. Клик у границы — не жест: гасить чужую
                            запись отмены нечем. */}
                        <Chip
                          nonForm
                          dashed
                          onClick={() => {
                            if (i <= 0) return;
                            move(i, i - 1);
                            onEdit?.();
                          }}
                          title='earlier in the display and print order'
                        >
                          ←
                        </Chip>
                        <Chip
                          nonForm
                          dashed
                          onClick={() => {
                            if (i >= fields.length - 1) return;
                            move(i, i + 1);
                            onEdit?.();
                          }}
                          title='later in the display and print order'
                        >
                          →
                        </Chip>
                      </ChipRow>
                    )}
                  </div>

                  {!frozen && (
                    <input
                      value={current.caption ?? ''}
                      onChange={(e) => {
                        setValue(`${name}.${i}.caption`, e.target.value, { shouldDirty: true });
                        onEdit?.();
                      }}
                      placeholder="caption — what's on the shot"
                      maxLength={255}
                      className={cn(
                        'w-full border border-borderColor bg-bgColor px-1 py-px text-micro',
                        'focus:border-textColor focus:outline-none',
                      )}
                    />
                  )}
                  {frozen && (current.caption ?? '').trim() && (
                    <Text size='nano' variant='label'>
                      {current.caption}
                    </Text>
                  )}
                </div>
              );
            })}

            {/* Слот «ещё кадр» стоит в самой полосе: пустое место и есть кнопка, которая его
                заполняет — тот же приём, что у мудборда. */}
            {!frozen && !full && (
              <MediaSlot
                aspectRatio={['Custom']}
                heightPx={STRIP_HEIGHT}
                sizeClassName='w-28'
                compact
                label='+ more'
                allowMultiple
                limit={MAX_MEDIA_PER_STEP - fields.length}
                showVideos={false}
                onSelect={add}
                className='shrink-0'
              />
            )}
          </div>

          {!frozen && full && (
            <Text size='micro' variant='label'>
              no more than {MAX_MEDIA_PER_STEP} photos per step — a long strip stops being scrolled
              through
            </Text>
          )}
        </>
      )}

      {/* Приёмка вставленного и брошенного: одна на полосу, а не на каждый кадр. */}
      {intake.dialog}
    </div>
  );
}

/**
 * Кнопка поверх кадра. Не `<button>` по той же причине, что и всё интерактивное на холсте: полоса
 * живёт внутри общего `<fieldset disabled>` выпущенной карточки, а задизейбленность наследуется.
 */
function StripButton({
  label,
  title,
  onPress,
}: {
  label: string;
  title: string;
  onPress: () => void;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      title={title}
      aria-label={title}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPress();
      }}
      className='cursor-pointer border border-borderColor bg-bgColor px-1.5 py-px text-nano uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
    >
      {label}
    </span>
  );
}
