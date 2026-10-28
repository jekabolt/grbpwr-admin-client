import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { cn } from 'lib/utility';
import { useState, type ChangeEvent as ReactChangeEvent, type ReactNode } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { AnnotationToolbar } from 'components/managers/tech-card/annotation/toolbar';
import { Button, Close, Input, Media, Placeholder, Text } from 'ui';

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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  const setAnnotations = (index: number, next: AnnotationForm[]) => {
    setValue(`${name}.${index}.annotations`, next, { shouldDirty: true });
    // Холст выносок — тоже портал: см. `onEdit`.
    onEdit?.();
  };

  const active = activeIndex == null ? undefined : list[activeIndex];
  const activeUrl = active ? urlOf(wireInt(active.mediaId)) : '';

  return (
    <div
      className={cn(
        'flex min-h-18 min-w-18 flex-1 flex-wrap gap-1.5 self-stretch',
        intake.dragging && 'outline outline-1 outline-textColor',
      )}
      {...intake.regionHandlers}
    >
      {fields.map((field, index) => {
        const current = list[index];
        if (!current) return null;
        const url = urlOf(wireInt(current.mediaId));
        return (
          <div
            key={field.id}
            className={cn(
              'relative size-18 shrink-0 overflow-hidden border bg-bgColor',
              activeIndex === index ? 'border-textColor' : 'border-borderColor',
            )}
          >
            <span
              role='button'
              tabIndex={0}
              className='block size-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              aria-label={`photo ${index + 1}`}
              aria-pressed={activeIndex === index}
              onClick={() => setActiveIndex((open) => (open === index ? null : index))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                setActiveIndex((open) => (open === index ? null : index));
              }}
            >
              {url ? (
                <Media src={url} alt={(current.caption ?? '').trim() || `photo ${index + 1}`} />
              ) : (
                <Placeholder label='?' className='size-full border-0' />
              )}
            </span>
            {!frozen && (
              <StripClose
                title='remove photo'
                onPress={() => {
                  remove(index);
                  setActiveIndex(null);
                  onEdit?.();
                }}
              />
            )}
          </div>
        );
      })}

      {!frozen && !full && (
        <MediaSlot
          aspectRatio={['1:1']}
          frameAspect='1'
          heightPx={72}
          sizeClassName='size-18'
          compact
          hint={null}
          label='+ photo'
          allowMultiple
          limit={MAX_MEDIA_PER_STEP - fields.length}
          showVideos={false}
          onSelect={add}
          className='shrink-0'
        />
      )}

      {(intake.busy || intake.dragging) && (
        <Text size='micro' variant='label' component='span' className='h-18 content-center'>
          {intake.busy ? 'adding' : 'drop photo'}
        </Text>
      )}

      {active && activeIndex != null && (
        <div className='flex w-full basis-full flex-col gap-2 pt-1'>
          {activeUrl && (
            <>
              {!frozen && <AnnotationToolbar tool={placingKind} onTool={setPlacingKind} />}
              <AnnotationCanvas
                key={wireInt(active.mediaId)}
                src={activeUrl}
                alt={(active.caption ?? '').trim() || `photo ${activeIndex + 1}`}
                heightPx={STRIP_HEIGHT}
                placingKind={placingKind}
                onPlaced={() => setPlacingKind(null)}
                annotations={(active.annotations ?? []) as AnnotationForm[]}
                frozen={frozen}
                renderPiecePicker={renderPiecePicker}
                pieceLabel={pieceLabel}
                onChange={frozen ? undefined : (next) => setAnnotations(activeIndex, next)}
              />
            </>
          )}
          <div className='flex flex-wrap items-center gap-3'>
            {!frozen && activeIndex > 0 && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() => {
                  move(activeIndex, activeIndex - 1);
                  setActiveIndex(activeIndex - 1);
                  onEdit?.();
                }}
              >
                earlier
              </Button>
            )}
            {!frozen && activeIndex < fields.length - 1 && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() => {
                  move(activeIndex, activeIndex + 1);
                  setActiveIndex(activeIndex + 1);
                  onEdit?.();
                }}
              >
                later
              </Button>
            )}
            {!frozen ? (
              <Input
                value={active.caption ?? ''}
                aria-label='photo caption'
                placeholder='caption'
                maxLength={255}
                className='min-w-40 flex-1'
                onChange={(event: ReactChangeEvent<HTMLInputElement>) => {
                  setValue(`${name}.${activeIndex}.caption`, event.target.value, {
                    shouldDirty: true,
                  });
                  onEdit?.();
                }}
              />
            ) : (
              (active.caption ?? '').trim() && (
                <Text size='nano' variant='label'>
                  {active.caption}
                </Text>
              )
            )}
          </div>
        </div>
      )}

      {intake.dialog}
    </div>
  );
}

/**
 * Кнопка поверх кадра. Не `<button>` по той же причине, что и всё интерактивное на холсте: полоса
 * живёт внутри общего `<fieldset disabled>` выпущенной карточки, а задизейбленность наследуется.
 */
function StripClose({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Close
      asChild
      size='sm'
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
      className='absolute top-0 right-0 cursor-pointer bg-bgColor focus-visible:outline-offset-1'
    />
  );
}
