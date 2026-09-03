import type { common_Color, common_DesignColourRecipe } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import type { JSX } from 'react';
import { Button } from 'ui/components/button';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { FieldRow, Hint, Swatch } from '../render/field-row';
import { colourLabel, colourSubtitle, colourSwatchHex } from '../render/model';
import type { ClothChoice } from './model';

/**
 * ═══ THE CLOTH — ЧТО ЭТОТ ПРОГОН НАДЕВАЕТ НА СНЯТУЮ ВЕЩЬ (J-31) ═══════════════════════════════
 *
 * Владелец, дословно: «ON MODEL у нас должна быть возможность загрузить несколько фото на модели
 * в нашей вещи и выбрать и или паттерн/цвет и результатом должен быть уже то что там вещь
 * поменяла цвет ткань и тд».
 *
 * ═══ ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ «ЦЕЛЕВОГО ЦВЕТА», КОТОРЫЙ ЗДЕСЬ СТОЯЛ ══════════════════════════════
 *
 * Не одним полем больше. Это ДВА РАЗНЫХ ПЛАТНЫХ ПРОМПТА на сервере, и выбирает между ними ровно
 * наличие плитки: `recolorCraft` говорит «carry the material through the change» — сохрани ткань,
 * поменяй тон; `reclothCraft` говорит «the garment made of the cloth in image 2» — положи ДРУГУЮ
 * ткань. Половина предложений одного — прямое отрицание другого. Поэтому ряд не «добавляет
 * паттерн к цвету», а называет ПРЕДМЕТ прогона, и заголовок над ним говорит именно это.
 *
 * ═══ ФОРМА: ЛЕСТНИЦА ПРАВИЛ ВНУТРИ ОДНОГО БЕЛОГО БЛОКА ════════════════════════════════════════
 *
 * DESIGN.md: блок в блоке — самый заметный способ промахнуться мимо этого дизайна. Секция
 * `generation — on model` остаётся ОДНОЙ коробкой; внутри неё — `GroupLabel` и ряды по
 * `#e6e6e6`, то есть та же лестница, что у соседних меню. Никаких вторых рамок, ни одной
 * заливки, кроме штриховки пустоты.
 *
 * ЗАЯВЛЕНИЕ СТОИТ НАД КОНТРОЛАМИ, а не под ними: ответ на «во что это переоденется» не должен
 * собираться глазами по двум рядам в поисках заполненного. Это же правило действовало здесь и до
 * J-31 (заголовок-свотч), и оно просто расширено на плитку.
 *
 * ПЛИТКИ ВЫБИРАЮТСЯ ГЛАЗОМ, А НЕ ИМЕНЕМ. Паттерн — это рисунок; выпадающий список имён
 * («houndstooth», «pattern 4») заставлял бы вспоминать, как выглядит каждое. Ряд плиток — тот же
 * жест, которым ткань выбирают на соседнем экране, и та же коробка кадра.
 */
export function ClothRow({
  choices,
  chosen,
  colour,
  colors,
  disabled,
  onPick,
  onClear,
  hasAnyPattern,
}: {
  choices: readonly ClothChoice[];
  chosen: ClothChoice | null;
  /** ТЕЛО ЗАПРОСА, а не черновик: заголовок обязан описывать то, что уедет. */
  colour: common_DesignColourRecipe;
  colors?: readonly common_Color[];
  disabled?: boolean;
  onPick: (assetId: number) => void;
  onClear: () => void;
  /** У карточки есть паттерны, но ни у одного нет картинки — это другой ответ, чем «нет вовсе». */
  hasAnyPattern: boolean;
}): JSX.Element {
  const swatchHex = colourSwatchHex(colour, colors);
  const tinted = !!(colour.code ?? '').trim() || !!(colour.hex ?? '').trim();
  /** Первая выключенная плитка — её причину экран печатает словами под рядом. */
  const blocked = choices.find((c) => !!c.blocked) ?? null;

  return (
    <>
      {/* ═══ ЧТО СКАЗАНО — ДО ТОГО, КАК ЭТО ПРАВЯТ ═══════════════════════════════════════════ */}
      <div
        data-cloth-headline
        className='flex flex-wrap items-start gap-3 border-b border-hairline pb-2'
      >
        {/* Плитка и свотч стоят РЯДОМ, а не один вместо другого: когда сказаны оба, это ДВА
            разных заявления о разных вещах — материал и тон, — и порядок старшинства между ними
            назван строкой ниже. Показывать один был бы выбор, который экран сделал за человека. */}
        {chosen && (
          <span
            className='block h-[44px] w-[39px] shrink-0 border border-textColor bg-bgColor'
            aria-hidden='true'
          >
            {chosen.thumb ? (
              <img
                src={chosen.thumb}
                alt=''
                loading='lazy'
                className='h-full w-full object-cover'
              />
            ) : null}
          </span>
        )}
        <Swatch hex={swatchHex} size={44} />
        <div className='min-w-0 flex-1'>
          <Text size='control' variant='uppercase' tracking='label' component='p' className='font-bold'>
            {chosen
              ? tinted
                ? `${chosen.name} · ${colourLabel(colour, colors)}`
                : chosen.name
              : colourLabel(colour, colors)}
          </Text>
          <Text size='micro' variant='label' component='p' className='normal-case'>
            {clothSubtitle(chosen, colour, colors, tinted)}
          </Text>
        </div>
      </div>

      {/* ═══ ПЛИТКИ ЭТОЙ КАРТОЧКИ ════════════════════════════════════════════════════════════ */}
      <FieldRow label='pattern' className='items-start' data-cloth-row>
        {choices.length === 0 ? (
          <Hint>
            {hasAnyPattern
              ? 'this card has patterns, but none of them carries a picture — and a cloth stated in words alone cannot be laid on a photograph. Make one on PATTERN and file it on the shelf.'
              : 'this card has no pattern tiles yet. Make one on PATTERN and file it on the shelf, and it will be offered here. A colour alone works without one.'}
          </Hint>
        ) : (
          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            <div className='flex flex-wrap gap-1'>
              {choices.map((choice) => {
                const selected = chosen?.assetId === choice.assetId;
                return (
                  <button
                    key={choice.assetId}
                    type='button'
                    data-cloth-tile={choice.assetId}
                    data-cloth-blocked={choice.blocked || undefined}
                    aria-pressed={selected}
                    disabled={disabled || !!choice.blocked}
                    title={choice.blocked || `${choice.name}${repeatWords(choice.repeatMm)}`}
                    onClick={() => onPick(selected ? 0 : choice.assetId)}
                    className={cn(
                      // Ширина задана числом, а рамка — border-box: выбор утолщает рамку, не
                      // сдвигая соседей. Радиуса нет нигде в этом дизайне.
                      'relative block h-[63px] w-[56px] shrink-0 overflow-hidden border bg-bgColor',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                      selected
                        ? 'border-2 border-textColor'
                        : choice.blocked
                          ? 'cursor-not-allowed border-dashed border-textInactiveColor opacity-50'
                          : 'border-borderColor hover:border-textColor',
                    )}
                  >
                    {choice.thumb ? (
                      <img
                        src={choice.thumb}
                        alt={choice.name}
                        loading='lazy'
                        className='h-full w-full object-cover'
                      />
                    ) : (
                      <span
                        style={PLACEHOLDER_SURFACE}
                        className={placeholderClass({ dashed: true }) + ' h-full w-full'}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ПОДПИСЬ ВЫБРАННОГО — ПОД РЯДОМ, ОДНОЙ СТРОКОЙ. Имя и раппорт названы потому, что
                РАППОРТ УЕЗЖАЕТ В ПРОМПТ числом («Its pattern repeats every N mm on the finished
                garment»), то есть это часть заказа, а не свойство картинки. */}
            {chosen ? (
              <span className='flex flex-wrap items-center gap-2'>
                <Text size='micro' variant='label' component='span' className='normal-case'>
                  {chosen.name}
                  {repeatWords(chosen.repeatMm)} · goes into every paid call as its second picture
                </Text>
                {!disabled && (
                  <Button variant='secondary' size='xs' onClick={onClear}>
                    clear
                  </Button>
                )}
              </span>
            ) : (
              <Text size='micro' variant='label' component='span' className='normal-case'>
                pick one to re-clothe the garment; leave it empty to only change the colour.
              </Text>
            )}

            {/* ⚠ ПРИЧИНА ВЫКЛЮЧЕННОЙ ПЛИТКИ ЧИТАЕТСЯ СЛОВАМИ, А НЕ ТОЛЬКО НАВЕДЕНИЕМ. Выключенная
                кнопка из таба выпадает, `title` читалке не достаётся, и человек, работающий с
                клавиатуры, видел бы штриховку без единого объяснения. Строка одна на весь ряд:
                плитка, совпавшая со снимком, бывает одна за раз, а список из трёх повторов одной и
                той же причины читается хуже примера. */}
            {blocked && (
              <Text size='micro' variant='label' component='span' className='normal-case'>
                <b>one tile is unavailable:</b> {blocked.blocked}
              </Text>
            )}
          </div>
        )}
      </FieldRow>
    </>
  );
}

/** `· repeats every 120 mm`, или пусто. Раппорт не заявлен — числа нет, и выдумывать его нельзя. */
function repeatWords(mm: number): string {
  return mm > 0 ? ` · repeats every ${mm} mm` : '';
}

/**
 * ОДНА СТРОКА, ГОВОРЯЩАЯ, ЧТО ИМЕННО ПРОИЗОЙДЁТ СО СНИМКОМ.
 *
 * ⚠ ПОРЯДОК СТАРШИНСТВА НАЗВАН ЗДЕСЬ ТЕМИ ЖЕ СЛОВАМИ, ЧТО И В ПЛАТНОМ ПРОМПТЕ. Сервер, при
 * названных плитке И цвете, говорит модели: «The colour stated above, if any, governs the colour
 * of the cloth: re-tint the cloth of image 2 to it and keep its motif, its weave and its scale».
 * Экран и промпт — одна пара «состояние + текст»; разойдясь, они дали бы человеку и модели две
 * разные инструкции об одном прогоне.
 */
function clothSubtitle(
  chosen: ClothChoice | null,
  colour: common_DesignColourRecipe,
  colors: readonly common_Color[] | undefined,
  tinted: boolean,
): string {
  if (chosen && tinted) {
    return 'the pattern states the cloth and its print; the picked colour re-tints it. Nothing else in the photograph moves — the same person, pose, light and crop.';
  }
  if (chosen) {
    return 'the garment is re-made in this cloth: its weave and print follow the folds already in the photograph. Nothing else in the frame moves.';
  }
  if (tinted || (colour.words ?? '').trim()) {
    return `${colourSubtitle(colour, colors)} — the cloth on the photograph is kept and re-tinted, not replaced.`;
  }
  return 'nothing stated yet — pick a pattern, a colour, or both.';
}
