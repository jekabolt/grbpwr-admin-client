import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaRecropDialog } from 'components/managers/media/components/media-recrop-dialog';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useState, type JSX } from 'react';
import Input from 'ui/components/input';
import { PLACEHOLDER_SURFACE, Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { ASSET_NAME_MAX } from '../assets/model';
import { BENCH_CELL_PX, BENCH_CELL_STYLE } from '../bench-slot';
import { EMPTY_WORD, HALF_FACE } from '../core';
import { TILE_CORNER, TILE_QUIET } from '../picture-tile';

/**
 * ═══ THE CELL IS THE FLAT SLOTS CELL — 138 × 162, PORTRAIT (owner, r2 §25) ══════════════════════
 *
 * The owner, on the beta: «why is the placeholder in SOURCE PICTURE so crooked». It stood as a
 * 4:1 band «the height of the NAME column beside it» with three rows of text inside — and a
 * flattened striped band with text spilling over reads as a picture that failed to load, not as a
 * slot. The first answer was a 138 px SQUARE, argued from the tile's own geometry; the owner
 * overruled it in one sentence (r2 п.25): «SOURCE PICTURE — плейсхолдер нормальной формы, как все
 * остальные: прямоугольный портретный», and the task list named the measure: «портретная ячейка
 * ТОГО ЖЕ РАЗМЕРА, ЧТО ЯЧЕЙКИ FLAT SLOTS» — 138 × 162.
 *
 * ⚠ ПОДВАЛ СНЯТ, А КОРОБКА ОСТАЛАСЬ ТОЙ ЖЕ (r3 п.12). Владелец: «убрать текст SOURCE PICTURE *».
 * Подпись повторяла линейку группы, стоящую в шести пикселях над ячейкой, — то есть говорила
 * второй раз то, что уже сказано. Но именно подвал (24px) делал коробку ПОРТРЕТНОЙ, и снять его
 * вместе с высотой значило бы молча отменить решение p.25 и вернуть квадрат. Поэтому 24 пикселя
 * подвала отданы КАДРУ: коробка по-прежнему 138 × 162, портретная и того же размера, что ячейка
 * флэт-слота, а слов в ней больше нет ни одного.
 *
 * ЧИСЛА ИМПОРТИРУЮТСЯ, А НЕ ПЕРЕПИСЫВАЮТСЯ (`BENCH_CELL_PX`) — второе написание «138» разошлось бы
 * с первым молча. Ширина при этом идёт ИНЛАЙНОМ, а не классом: стенд читает CSS собранного бандла,
 * где класса, которого не было в дереве при сборке, не существует вовсе.
 */
const CELL_STYLE = BENCH_CELL_STYLE;
/** Высота снятого подвала `SlotCap` — единственное место, где это число ещё живёт на этом экране. */
const CAP_PX = 24;
/** Кадр держит ВСЮ коробку минус её рамку: 136 × 160 внутри 138 × 162. */
const FRAME_ASPECT = `${BENCH_CELL_PX - 2}/${BENCH_CELL_PX + CAP_PX - 2}`;
/**
 * The NAME column takes the rest of the row and drops under the cell when the row is narrow.
 *
 * ПОТОЛОК ШИРИНЫ — НЕ КОСМЕТИКА. Поле держит 60 знаков (`ASSET_NAME_MAX`), а без потолка оно
 * растягивалось на всю оставшуюся ширину блока (около 1100 px на десктопе): поле в пять раз шире
 * того, что в него влезает, читается как «сюда пишут абзац», и рядом с ним ячейка картинки
 * выглядит обрезком.
 */
const NAME_STYLE: React.CSSProperties = { flex: '1 1 200px', minWidth: 0, maxWidth: 420 };

/**
 * ═══ ПУСТАЯ ЯЧЕЙКА — ДВЕ ПОЛОВИНЫ, И ЭТО ДВА РАЗНЫХ ИСХОДА, А НЕ ДВА ВХОДА ═══════════════════════
 *
 * Владелец, вживую (2026-09-07): «в PATTERN → SOURCE PICTURE плейсхолдер разделить на 2: один —
 * generate, второй — выбрать из галереи; если выбираешь из галереи, то можно добавить без
 * генерации через AI».
 *
 * ⚠ РАЗНИЦА ПОЛОВИН — НЕ ОТКУДА БЕРЁТСЯ КАРТИНКА, А ЧТО С НЕЙ БУДЕТ. Обе двери открывают ОДНУ И
 * ТУ ЖЕ библиотеку (⌘V и брошенный файл — тоже обе), поэтому подписи вида «из медиатеки» /
 * «из галереи» назвали бы одно и то же дважды и не различили бы ничего. Различает исход:
 *   · ВЕРХ (`+ to generate`) — снимок ЛОЖИТСЯ В ЯЧЕЙКУ и уезжает в платный прогон: плитку из него
 *     делает модель по нажатию GENERATE ниже. Ячейка после этого заполнена, половин больше нет.
 *   · НИЗ (`+ tile from gallery`) — снимок УЖЕ ЯВЛЯЕТСЯ повторяющейся плиткой и встаёт на полку
 *     `TILES ON THIS CARD` КАК ЕСТЬ: ни прогона, ни денег, ни модели. Ячейка при этом не
 *     заполняется вовсе — предмет этой двери лежит не в ней.
 *
 * ⚠ ПОЛОВИНЫ ЖИВУТ ТОЛЬКО НА ПУСТОЙ ЯЧЕЙКЕ, И У ЭТОГО ЕСТЬ ЦЕНА, НАЗВАННАЯ ВСЛУХ. Заполненный
 * кадр — это ОДНА картинка во всю коробку (решение r2 п.25: пустая и заполненная ячейки — одна и
 * та же коробка 138 × 162), поделить его надвое значило бы показывать источник вдвое меньше и
 * ровно там, где на него смотрят. Поэтому, пока в ячейке лежит источник прогона, нижней двери на
 * экране нет: чтобы завести готовую плитку, источник снимают углом `✕`. Плата за это одно нажатие,
 * и она куплена тем, что картинка не ужимается вдвое ради двери, которой в этот момент не
 * пользуются.
 *
 * ПОЭТОМУ ЭТО НЕ `PlaceOrDrawCell`. Общий орган делит коробку на «медиа + ПЕРО» (`DrawHalf`,
 * `PenGlyph`, `drawTitle`) — нижняя половина там жёстко про редактор рисования, и второй родовой
 * вариант «две медийные половины» ему пришлось бы добавить пропом-развилкой на все четыре ленты,
 * которые его уже читают. Взято оттуда РОВНО ТО, ЧТО ОБЯЗАНО СОВПАСТЬ: лицо половины (`HALF_FACE`
 * — та же типографика, тот же фокус, тот же зазор «знак + глагол») и деление коробки геометрией
 * (`SLOT_HALVES`). Кадр и коробка остаются свои — 138 × 162, решение r2 п.25.
 */
const GENERATE_HALF = '+ to generate';
const GALLERY_HALF = '+ tile from gallery';
/**
 * ЗАГОЛОВОК ПИКЕРА — ОДНА СТРОКА НА ОДИН ПРЕДМЕТ, И ИХ ЗДЕСЬ РОВНО ДВА. Верхняя половина,
 * заполненный кадр и угловой `change` говорят об ОДНОМ И ТОМ ЖЕ снимке (источнике прогона), и до
 * этой правки писали о нём двумя разными фразами — то есть человек, открывший пикер из угла и из
 * пустой ячейки, читал над одной и той же библиотекой разные обещания. Нижняя половина — предмет
 * ДРУГОЙ, и потому у неё своя строка, а не третья редакция первой.
 */
const SOURCE_PURPOSE = 'design · the picture a pattern is generated from';
const GALLERY_PURPOSE = 'design · a picture that is already a repeating tile';
const GALLERY_TITLE =
  'pick a picture that is ALREADY a repeating tile — it is filed on this card’s shelf as it is, ' +
  'with no run, no model and nothing paid for. The tile is named for you; rename it on its face.';

/**
 * Деление коробки НАДВОЕ — ГЕОМЕТРИЕЙ, А НЕ ВЕРОЙ, теми же двумя строками, что у общей плитки
 * (`core/two-half-slot.tsx` → `SLOT_HALVES`, разбор целиком там): у элемента грида `min-height:
 * auto`, и собственные пропорции кнопки слота распирают строку, пока минимум не обнулён.
 */
const SLOT_HALVES: React.CSSProperties = { display: 'grid', gridTemplateRows: '1fr 1fr' };

/**
 * Знак нижней половины — ЧЕТЫРЕ КВАДРАТА, то есть сам раппорт: то, что берут этой дверью, уже
 * повторяющаяся плитка. Верхняя половина носит фотоглиф `MediaSlot` (обычный снимок), и пара
 * «снимок → повтор» читается на глифах раньше, чем на словах. Штрих, коробка 24 и размер 20 —
 * те же, что у `PhotoGlyph` и `PenGlyph`: три знака одной студии обязаны быть одной руки.
 */
function RepeatGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden
      width={20}
      height={20}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
      className={cn('shrink-0', className)}
    >
      <rect x='3.5' y='3.5' width='7' height='7' />
      <rect x='13.5' y='3.5' width='7' height='7' />
      <rect x='3.5' y='13.5' width='7' height='7' />
      <rect x='13.5' y='13.5' width='7' height='7' />
    </svg>
  );
}

/**
 * ═══ THE INPUT OF A TILE — ONE PICTURE AND ONE NAME, side by side ═══════════════════════════════
 *
 * Two columns: the source cell on the left, the NAME field on the right.
 *
 * ═══ ЯЧЕЙКА ГОВОРИТ СОБОЙ — ЧЕТЫРЕ НАДПИСИ СНЯТЫ (владелец, r3 п.12) ═══════════════════════════
 *
 * Дословно: «убрать тексты “SOURCE PICTURE *”, “PICTURE 187”, “IN THE PROMPT”, “click to fill · ⌘V
 * · drop”». Все четыре стояли ВОКРУГ картинки размером 136 пикселей и вместе занимали больше места,
 * чем она сама. Что каждая из них говорила и почему это переживает её снятие:
 *   · `SOURCE PICTURE *` — линейка группы над ячейкой говорит то же слово и держит счётчик `0 of 1`;
 *   · `PICTURE 187` — номер файла; человек только что сам его выбрал, а имя файла API не отдаёт;
 *   · `IN THE PROMPT` — что картинка уезжает в прогон; это ЕДИНСТВЕННЫЙ вход на экране, и ворота
 *     под ним говорят «a repeating tile is made out of exactly one picture», когда его нет;
 *   · строка жестов — `MediaSlot` рисует свою на самом плейсхолдере, когда для неё есть место.
 *
 * ═══ ОДИН ИСТОЧНИК ПРОГОНА — И ВТОРАЯ ДВЕРЬ, КОТОРАЯ ВЕДЁТ НЕ В НЕГО ══════════════════════════
 *
 * The second door of the input — «or one of this card's cloths» — was taken off at the owner's
 * word, and WITH IT WENT THE ABILITY, not only the row: a cloth of the card cannot be picked as a
 * tile's source any more, a repeat is made only out of a picture of the library, the clipboard or
 * a dropped file. `sourceAssetId` therefore always travels as 0.
 *
 * ⚠ ЭТО ПРАВИЛО ЖИВО И ПОЛОВИНАМИ НЕ ОТМЕНЕНО, потому что нижняя половина В ЯЧЕЙКУ НЕ КЛАДЁТ
 * НИЧЕГО. Ячейка — вход ПРОГОНА, и вход у него по-прежнему один. Нижняя дверь заводит СТРОКУ
 * ПОЛКИ и к прогону не относится вовсе: `source` от неё не меняется, ворота GENERATE не
 * открываются, `extraInputMediaIds` её снимка не видят. Две двери в одной коробке — это две
 * ветки, а не два входа одной ветки.
 *
 * ═══ EXACTLY ONE PICTURE, AND THAT IS NOT A SETTING ═════════════════════════════════════════════
 *
 * The contract names the number: `pattern` wants EXACTLY ONE picture in `extra_input_media_ids`
 * and refuses `one_source_picture` on any other — free, before anything is reserved. So this is
 * ONE slot, not a list with validation: a slot for one frame makes the wrong state inexpressible.
 *
 * ═══ КРОП БОЛЬШЕ НЕ ОТКРЫВАЕТСЯ САМ (владелец, r3 п.11) ════════════════════════════════════════
 *
 * Здесь стояло «предлагай сразу кропнуть картинку на аплоуд» (E-9), и `onSelect` открывал окно
 * кропа тут же. Владелец в этом круге отменил это дважды: «сразу ведёт на кроп» — и отдельным
 * пунктом про то, что окно после этого висит с надписью LOADING THE IMAGE. Довод E-9 (в кадре
 * бывает стол и рука, и лишнее уезжает в платный промпт) не отменён — он ПЕРЕЕХАЛ в угловой орган
 * `crop` на самой ячейке: жест остался, принуждение ушло.
 */
export function PatternInput({
  source,
  onPick,
  onClear,
  onPickFromGallery,
  galleryInert,
  galleryPending,
  name,
  onName,
  disabled,
}: {
  /** What is about to travel. `null` — nothing, and GENERATE below says so. */
  source: common_MediaFull | null;
  onPick: (media: common_MediaFull) => void;
  onClear: () => void;
  /**
   * НИЖНЯЯ ПОЛОВИНА: снимок, который УЖЕ плитка. Он не ложится в ячейку и никуда не едет —
   * вызывающий заводит им строку полки (`UpsertDesignAsset`, kind `pattern`) и на этом всё.
   */
  onPickFromGallery: (media: common_MediaFull) => void;
  /**
   * ПОВОД, ПО КОТОРОМУ НИЖНЯЯ ДВЕРЬ ЗАКРЫТА, дословно — пусто значит «открыта». Дверь, за которой
   * отказ, не рисуется живой: половина остаётся на месте (коробка не прыгает), но гаснет и носит
   * повод в `title` и в `data-inert`, ровно как `InertDoor` носит свой.
   */
  galleryInert?: string;
  /** Строка полки ещё пишется — вторая посадка тем же жестом завела бы двойника. */
  galleryPending?: boolean;
  name: string;
  onName: (next: string) => void;
  disabled?: boolean;
}): JSX.Element {
  const sourceUrl = source?.media?.fullSize?.mediaUrl || source?.media?.thumbnail?.mediaUrl || '';
  const sourceId = source?.id ?? 0;
  const [cropping, setCropping] = useState(false);

  /**
   * ═══ ОРГАНЫ УЕХАЛИ В УГЛЫ КАДРА (владелец, r3 п.10) ══════════════════════════════════════════
   *
   * Дословно: «change и remove — слишком большие кнопки; remove → ✕, change → пиктограмма, так же
   * crop; не перекрывать картинку». Так и было: `MediaSlot` рисует на заполненном кадре ПОЛОСУ во
   * всю ширину (`change` слева, `remove` справа, белая заливка 90%), и на кадре в 136 пикселей эта
   * полоса съедала нижнюю треть картинки ВСЕГДА, а не по наведению.
   *
   * Полоса не правится у себя дома: `MediaSlot` — общий примитив десятка экранов, и её ширина там
   * уместна. Поэтому заполненная ветка получает `editMode={false}` (полоса не рисуется, слот
   * остаётся кадром), а органы стоят СВОИ — той же кожей `TILE_CORNER` + `TILE_QUIET`, что углы
   * `PictureTile`: тихие, появляются по наведению И по фокусу, и на устройстве без наведения
   * видны всегда.
   *
   * ⚠ СЛОВА, А НЕ ПИКТОГРАММЫ, И ЭТО РЕШЕНИЕ, А НЕ ЛЕНЬ. Решение задачи называет образец —
   * «как PictureTile», — а у `PictureTile` углы подписаны словами (`split`, `crop`, `zoom`,
   * `edit`, `select`) нано-капсом в 9px. Нарисовать здесь пиктограммы значило бы завести ВТОРОЙ
   * словарь углов на соседних экранах одной студии; жалоба же владельца — про РАЗМЕР и про то, что
   * органы лежат поверх картинки, и обе половины закрыты углом: 9px по наведению вместо полосы во
   * всю ширину. `✕` остаётся глифом — он им и назван.
   */
  const corner = cn(TILE_CORNER, TILE_QUIET, 'py-0.5 leading-none');

  return (
    <div data-pattern-input='' className='flex flex-wrap items-start gap-3'>
      {/* ─── the source cell ────────────────────────────────────────────────────────────── */}
      <div
        data-pattern-source={sourceId || 'empty'}
        style={CELL_STYLE}
        className='flex min-w-0 flex-col'
      >
        {/* Рамку несёт КОРОБКА, а кадр внутри идёт без своей (`border-0`): две рамки внахлёст
            дают двойную линию на стыке. Пунктир, пока ячейка пуста, сплошная — когда в ней
            что-то стоит: тот же словарь, что у флэт-слота. */}
        <div
          /* ЯКОРЬ КОРОБКИ, а не её css-класса: проверяемое утверждение п.25 — «того же размера,
             что ячейка FLAT SLOTS», то есть ИЗМЕРЕНИЕ этого узла. */
          data-source-box=''
          className={cn(
            'group relative flex min-w-0 flex-col overflow-hidden border',
            sourceUrl ? 'border-textColor' : 'border-dashed border-borderColor',
          )}
        >
          {disabled && !sourceUrl ? (
            <span
              data-inert='this card is read-only for you — a run spends money, so attaching its input stops here too'
              title='this card is read-only for you — a run spends money, so attaching its input stops here too'
              className='block w-full'
            >
              <Placeholder
                label={EMPTY_WORD}
                style={{ aspectRatio: FRAME_ASPECT, minHeight: 0 }}
                className='w-full border-0'
              />
            </span>
          ) : !sourceUrl ? (
            /* ═══ ОДИН КАДР НА ОБА СОСТОЯНИЯ, И ОН ЖЕ — ТО, ЧТО ДЕЛИТСЯ ПОПОЛАМ ══════════════
               Пропорция живёт ЗДЕСЬ, а не на кнопке слота: пустая ячейка обязана остаться той же
               коробкой, что заполненная (138 × 162, решение r2 п.25), а половины — просто двумя
               строками этого кадра. Полосатая поверхность тоже здесь: нижняя половина — не
               `MediaSlot`, своей поверхности у неё нет, и без этой строки она была бы белой
               заплатой в полосатой рамке. */
            <div style={{ ...PLACEHOLDER_SURFACE, aspectRatio: FRAME_ASPECT, minHeight: 0, ...SLOT_HALVES }}>
              {/* ─── верх: снимок, из которого модель СДЕЛАЕТ плитку ────────────────────────
                  Обёртка с нулевым минимумом и обрезкой несущая: у элемента грида `min-height:
                  auto`, и собственные пропорции кнопки слота распёрли бы строку (разбор —
                  `core/two-half-slot.tsx`). Якорь стоит на ней, а не на кнопке: кнопку рисует
                  примитив, и данных-атрибутов он не принимает. */}
              <div
                data-source-half='generate'
                style={{ minHeight: 0, overflow: 'hidden' }}
                className='min-w-0'
              >
                <MediaSlot
                  aspectRatio={['Custom']}
                  label={GENERATE_HALF}
                  hint={null}
                  purpose={SOURCE_PURPOSE}
                  showVideos={false}
                  editMode
                  onSelect={(media) => {
                    const first = media[0];
                    if (first?.id) onPick(first);
                  }}
                  sizeClassName='h-full w-full'
                  className='border-0'
                />
              </div>
              {/* ─── низ: снимок, который УЖЕ плитка ─────────────────────────────────────── */}
              {galleryInert ? (
                <span
                  data-source-half='gallery'
                  data-inert={galleryInert}
                  title={galleryInert}
                  style={{ minHeight: 0 }}
                  className={cn(
                    HALF_FACE,
                    'cursor-not-allowed border-t border-dashed border-borderColor',
                    'text-textInactiveColor hover:text-textInactiveColor',
                  )}
                >
                  <RepeatGlyph />
                  <span className='leading-tight'>{GALLERY_HALF}</span>
                </span>
              ) : (
                <MediaSelector
                  label={GALLERY_HALF}
                  purpose={GALLERY_PURPOSE}
                  aspectRatio={['Custom']}
                  allowMultiple={false}
                  showVideos={false}
                  saveSelectedMedia={(media) => {
                    const first = media[0];
                    if (first?.id) onPickFromGallery(first);
                  }}
                  trigger={
                    <button
                      type='button'
                      data-source-half='gallery'
                      aria-label='add a picture that is already a tile, with no run'
                      title={GALLERY_TITLE}
                      disabled={galleryPending}
                      style={{ minHeight: 0 }}
                      className={cn(HALF_FACE, 'border-t border-dashed border-borderColor')}
                    >
                      <RepeatGlyph />
                      <span className='leading-tight'>
                        {galleryPending ? 'filing…' : GALLERY_HALF}
                      </span>
                    </button>
                  }
                />
              )}
            </div>
          ) : (
            <>
              {/* ═══ ЗАПОЛНЕННЫЙ КАДР БЕЗ ПОЛОСЫ, НО С ЖИВЫМИ ЖЕСТАМИ ═══════════════════════════
                  Здесь стоял `editMode={false}`, и он гасил не только полосу `change · remove`:
                  тем же флагом слот выключает приёмник ⌘V и броска (`useMediaIntake({ enabled:
                  editMode })`). Заполненная ячейка молча теряла «вставить другой снимок поверх» —
                  человеку приходилось сначала жать ✕, а экран при этом выглядел целым.

                  Теперь полоса снимается СВОИМ пропом (`toolbar={false}`), а право менять
                  остаётся: ⌘V и брошенный файл ЗАМЕНЯЮТ картинку тем же `onPick`, что и дверь
                  `change` в углу. Один предмет — один обработчик. */}
              <MediaSlot
                aspectRatio={['Custom']}
                frameAspect={FRAME_ASPECT}
                showVideos={false}
                editMode={!disabled}
                toolbar={false}
                mediaUrl={sourceUrl}
                alt={`source picture ${sourceId}`}
                purpose={SOURCE_PURPOSE}
                onSelect={(media) => {
                  const first = media[0];
                  if (first?.id) onPick(first);
                }}
                className='border-0'
              />
              {!disabled && (
                <>
                  {/* Верх справа — снять картинку. Тот же угол и тот же глиф, что у `PictureTile`. */}
                  <div className='absolute right-1 top-1 z-20 flex items-start gap-1'>
                    <button
                      type='button'
                      className={corner}
                      data-source-remove=''
                      aria-label='remove the source picture'
                      title='remove the source picture'
                      onClick={onClear}
                    >
                      ✕
                    </button>
                  </div>
                  {/* Низ слева — два органа, которые режут и меняют ОДИН предмет, поэтому стоят
                      кластером, а не по разным углам (правило `PictureTile`). */}
                  <div className='absolute bottom-1 left-1 z-20 flex items-end gap-1'>
                    <button
                      type='button'
                      className={corner}
                      data-pattern-crop={sourceId}
                      aria-label='crop the source picture'
                      title='trim the picture down to the cloth itself — the table, the hand and the background reach the paid prompt as part of the motif'
                      onClick={() => setCropping(true)}
                    >
                      crop
                    </button>
                    <MediaSelector
                      label='change'
                      purpose={SOURCE_PURPOSE}
                      aspectRatio={['Custom']}
                      allowMultiple={false}
                      showVideos={false}
                      saveSelectedMedia={(media) => {
                        const first = media[0];
                        if (first?.id) onPick(first);
                      }}
                      trigger={
                        <button
                          type='button'
                          className={corner}
                          data-source-change=''
                          aria-label='change the source picture'
                          title='pick another picture for this tile'
                        >
                          change
                        </button>
                      }
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── the name ───────────────────────────────────────────────────────────────────── */}
      <div style={NAME_STYLE} className='flex flex-col gap-1'>
        <label className='flex flex-col gap-0.5' htmlFor='design-pattern-name'>
          <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
            name <b className='text-textColor'>*</b>
          </Text>
          <Input
            name='design-pattern-name'
            data-pattern-name
            aria-label='name'
            value={name}
            disabled={disabled}
            // THE LIMIT LIVES IN ONE PLACE (`ASSET_NAME_MAX`): `design_asset.name` is VARCHAR(60),
            // the door obeys the same rule, and the library screen reads the same constant.
            maxLength={ASSET_NAME_MAX}
            placeholder='twill repeat'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onName(e.target.value)}
          />
        </label>
        {/* ПИЛЮЛЯ `NOT SENT` СНЯТА ВМЕСТЕ СО СВОЕЙ ПАРОЙ (п.12 снял `IN THE PROMPT`, п.14 — «goes
            to the model»). Факт при этом не потерян: он сказан одной серой строкой там же, где
            стоял, — то есть органов на этом месте стало одним меньше, а сведений столько же. */}
        <Text size='nano' variant='label' component='span' data-name-note=''>
          the name is how you will find it — it is not sent to the model
        </Text>
      </div>

      {/* The dialog is mounted only with a live source: it pulls the original as a blob on every
          open, and mounted for nothing it would hit the network on every draw of an empty screen. */}
      {source && (
        <MediaRecropDialog
          media={source}
          open={cropping}
          onOpenChange={setCropping}
          onCropped={(cropped) => onPick(cropped)}
        />
      )}
    </div>
  );
}
