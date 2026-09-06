import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaRecropDialog } from 'components/managers/media/components/media-recrop-dialog';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useState, type JSX } from 'react';
import Input from 'ui/components/input';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { ASSET_NAME_MAX } from '../assets/model';
import { BENCH_CELL_PX, BENCH_CELL_STYLE } from '../bench-slot';
import { EMPTY_WORD } from '../core';
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
 * ═══ ONE DOOR, NOT TWO (owner) ═════════════════════════════════════════════════════════════════
 *
 * The second door of the input — «or one of this card's cloths» — was taken off at the owner's
 * word, and WITH IT WENT THE ABILITY, not only the row: a cloth of the card cannot be picked as a
 * tile's source any more, a repeat is made only out of a picture of the library, the clipboard or
 * a dropped file. `sourceAssetId` therefore always travels as 0.
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
  name,
  onName,
  disabled,
}: {
  /** What is about to travel. `null` — nothing, and GENERATE below says so. */
  source: common_MediaFull | null;
  onPick: (media: common_MediaFull) => void;
  onClear: () => void;
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
            <MediaSlot
              aspectRatio={['Custom']}
              /* ONE FRAME FOR BOTH STATES: the empty cell is the same box the filled one is —
                 and it is the flat slot's box, not a second one like it. */
              frameAspect={FRAME_ASPECT}
              label='+ picture'
              hint={null}
              purpose='design · the picture a pattern is made from'
              showVideos={false}
              editMode
              onSelect={(media) => {
                const first = media[0];
                if (first?.id) onPick(first);
              }}
              className='border-0'
            />
          ) : (
            <>
              {/* ЗАПОЛНЕННЫЙ КАДР БЕЗ ПОЛОСЫ: `editMode={false}` гасит собственные `change` и
                  `remove` слота, оставляя ровно картинку в рамке этой коробки. */}
              <MediaSlot
                aspectRatio={['Custom']}
                frameAspect={FRAME_ASPECT}
                showVideos={false}
                editMode={false}
                mediaUrl={sourceUrl}
                alt={`source picture ${sourceId}`}
                onSelect={() => undefined}
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
                      purpose='design · the picture a pattern is made from'
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
