import type { common_AdminColorwayRef } from 'api/proto-http/admin';
import { PantonePicker } from 'components/managers/tech-card/components/pantone-picker';
import { findPantone } from 'components/managers/tech-card/components/pantone-swatches';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { archivedRef, colorwayLabel } from '../colorway-picker';
import { EmptyState } from '../core';
import { Swatch } from '../render/field-row';
import { colourwayHex, patternColourKey, pickableColourways, type PatternColour } from './model';
import { GoToStep } from './organs';

/**
 * TWO ORGANS ABOUT COLOUR ON THIS STEP, AND THEY ARE NOT THE SAME QUESTION:
 *
 *   · COLOUR is an INPUT of the generation — a free reference that binds this card to nothing
 *     (`PatternColourRow` below);
 *   · WORN BY is a LINK from a finished tile to a colourway of the card, read off the shelf
 *     (`WornByChips`), and it is drawn as chips because a link is READ, not seen.
 *
 * ⚠ NO COLOURWAY IS PICKED ON CREATION (owner, E-1). At the time of the first generations the
 * card usually has no colourways at all; the binding lives under each tile on the shelf and is
 * corrected after the fact — otherwise the tiles made first would be orphans forever.
 */

/** The card's colourways, once per screen; every organ below takes the list as a prop. */
export function usePatternColourways(techCardId: number): {
  refs: common_AdminColorwayRef[];
  loading: boolean;
} {
  const { data, isLoading } = useTechCard(techCardId);
  const refs = useMemo(
    () => (data?.colorways ?? []).filter((c) => (c.colorwayId ?? 0) > 0),
    [data],
  );
  return { refs, loading: isLoading };
}

/** Экранный цвет ссылки: свой hex, а если его нет — приближение из списка пантонов. */
export function colourSwatchHex(colour: PatternColour): string {
  return colour.hex.trim() || findPantone(colour.code)?.hex || '';
}

/**
 * ═══ COLOUR — ОДИН РЯД, ОДНА ДВЕРЬ, И НИКАКИХ ОБЯЗАТЕЛЬСТВ (владелец, r2 §26) ══════════════════
 *
 * Дословно: «выбор цвета, который нас ни к чему не обязывает; история использованных последних
 * цветов при генерации; плейсхолдер для добавления цвета; меню пантоновское, где можно выбрать по
 * пантону».
 *
 * ЧТО СТОЯЛО ЗДЕСЬ ДО ЭТОГО И ПОЧЕМУ СНЕСЕНО. Здесь была сетка ПЛИТОК ПО КОЛОРВЕЯМ КАРТОЧКИ: чтобы
 * покрасить пробную плитку, надо было сначала завести колорвей — то есть выбор цвета обязывал к
 * записи о продукте, а на момент первых генераций колорвеев у карточки обычно нет вовсе, и сетка
 * честно показывала пустоту с дверью на соседний шаг. Это ровно то, что владелец назвал «обязывает».
 * Цвет теперь — ничья пара «код + экранный hex» (`PatternColour`), живущая один прогон.
 *
 * ТРИ ОРГАНА, И НИ ОДНОГО ЛИШНЕГО:
 *   · выбранный цвет — ОДНА плитка со свотчем, кодом и `✕` (владелец: «одна плитка с ✕»);
 *   · нет выбранного — ОДНА дверь `+ colour`, и это ТРИГГЕР САМОГО ПАНТОН-ПИКЕРА ПРОДУКТА
 *     (`pantone-picker.tsx`, поиск «Search Pantone code or colour» + сетка свотчей). Второй пикер
 *     не написан: этот восстановлен ровно тем файлом, каким он был, когда его унесло вместе с
 *     последним вызывающим;
 *   · `recent` — недавние цвета прогонов ЭТОЙ карточки, свотчами. Это не второй способ выбрать
 *     цвет вместо пикера, а ярлык к уже сделанному выбору, и он подписан своим словом.
 *
 * ПОМЕНЯТЬ ЦВЕТ = снять `✕` и выбрать заново. Дверь и плитка меняются местами, а не стоят рядом:
 * два органа на один жест — это ровно то, чего владелец просил не делать.
 */
export function PatternColourRow({
  colour,
  recent,
  onPick,
  disabled,
}: {
  /** Выбранный цвет или `null` — цвет необязателен, и `null` это нормальное состояние. */
  colour: PatternColour | null;
  recent: readonly PatternColour[];
  onPick: (next: PatternColour | null) => void;
  disabled?: boolean;
}): JSX.Element {
  const pickedKey = colour ? patternColourKey(colour) : '';
  return (
    <div data-pattern-colour-row='' className='flex flex-col gap-3'>
      {colour ? (
        <div
          data-colour-picked-tile={colour.code || colour.hex}
          className='flex w-fit items-center gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px]'
        >
          <Swatch hex={colourSwatchHex(colour)} size={16} title={colour.code || colour.hex} />
          <Text component='span' size='micro' className='uppercase'>
            {colour.code || colour.hex}
          </Text>
          {!disabled && (
            <Button
              variant='secondary'
              size='xs'
              data-colour-clear=''
              title='take the colour off — a tile is generated without one just as well'
              onClick={() => onPick(null)}
            >
              ✕
            </Button>
          )}
        </div>
      ) : (
        <div className='w-fit' data-colour-door=''>
          <PantonePicker
            name='pattern-colour'
            label='+ colour'
            disabled={disabled}
            /* Пантон — это КОД. Экранный свотчик списка приблизителен и в платный промпт не едет
               (довод у `patternColourRecipe`), поэтому hex здесь пустой намеренно. */
            onPick={(code) => onPick(code.trim() ? { code: code.trim(), hex: '' } : null)}
          />
        </div>
      )}

      {recent.length > 0 && (
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2' data-colour-recent=''>
          <Text size='nano' variant='label' component='span' className='uppercase'>
            recent
          </Text>
          {recent.map((r) => {
            const key = patternColourKey(r);
            const on = key === pickedKey;
            const label = r.code || r.hex;
            return (
              <button
                key={key}
                type='button'
                data-colour-recent-item={label}
                data-colour-on={on || undefined}
                disabled={disabled}
                title={on ? `${label} · already picked` : `paint in ${label}`}
                onClick={() => onPick(r)}
                className='flex items-center gap-1.5 border border-transparent px-1 py-0.5 hover:border-borderColor focus-visible:border-borderColor disabled:opacity-40'
              >
                <Swatch hex={colourSwatchHex(r)} size={16} />
                <Text size='nano' variant='label' component='span' className='uppercase'>
                  {label}
                </Text>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * WORN BY — the chips of a shelf tile. One chip per live colourway (the archived one only while
 * the tile wears it); the one worn is filled and `aria-pressed`; a click binds, a click on the
 * worn one unbinds. The tail names the state in a second way: the worn colourway's swatch, or the
 * pill `not bound`.
 *
 * ⚠ A COLOURWAY WEARS ONE FABRIC, and that is the server's invariant, not our caution: the column
 * is one, and assigning X to N is executed in ONE transaction that takes N off every other asset
 * of the card. The client does not imitate it and sends no second call; the tile that lost its
 * colourway reads `not bound` after the band refetches. The chip's title says so, at the one place
 * the pointer rests before the choice.
 *
 * A DELETED colourway leaves the column pointing at a row that is gone; the band still says the
 * number. It is drawn as a chip `#42 (deleted)` — worn, so it can be taken off — rather than
 * silently reset: fixing a server fact on mount would write to the base for the person, unasked.
 */
export function WornByChips({
  refs,
  wornBy,
  onBind,
  disabled,
  pending,
  loading,
  techCardId,
}: {
  refs: readonly common_AdminColorwayRef[];
  wornBy: number;
  onBind: (colorwayId: number) => void;
  disabled?: boolean;
  pending?: boolean;
  /** The card's colourways are still on their way: say nothing definite yet. */
  loading?: boolean;
  techCardId: number;
}): JSX.Element {
  const list = pickableColourways(refs, wornBy, archivedRef);
  /* «Deleted» is a claim about the server, and it is made only once the list has actually
     arrived — before that a bound tile would flash `(deleted)` on every mount. */
  const orphan = !loading && wornBy > 0 && !list.some((c) => (c.colorwayId ?? 0) === wornBy);
  if (loading && !list.length) {
    return (
      <ChipRow>
        <Pill title='loading the colourways of this card'>…</Pill>
      </ChipRow>
    );
  }
  if (!list.length && !orphan) {
    return (
      <div data-worn-by-empty=''>
        <EmptyState
          action={<GoToStep kind='render' label='fabric render ›' techCardId={techCardId} />}
        >
          no colourways yet · this tile can be bound later
        </EmptyState>
      </div>
    );
  }
  const worn = list.find((c) => (c.colorwayId ?? 0) === wornBy);
  return (
    <ChipRow>
      {list.map((c) => {
        const cid = c.colorwayId ?? 0;
        const on = cid === wornBy;
        const label = colorwayLabel(c);
        return (
          <Chip
            key={cid}
            data-bind-colourway={cid}
            selected={on}
            pressed={on}
            disabled={disabled || pending}
            title={
              on
                ? `unbind from ${label}`
                : `bind to ${label} — a colourway wears one fabric, so this takes it off whatever else wore it`
            }
            onClick={() => onBind(on ? 0 : cid)}
          >
            {label}
            {archivedRef(c) ? ' (archived)' : ''}
          </Chip>
        );
      })}
      {orphan && (
        <Chip
          data-bind-colourway={wornBy}
          selected
          pressed
          disabled={disabled || pending}
          title='this colourway was deleted — the tile still names it; click to take it off'
          onClick={() => onBind(0)}
        >
          {`#${wornBy} (deleted)`}
        </Chip>
      )}
      {worn ? (
        <Swatch hex={colourwayHex(worn)} size={18} title={colorwayLabel(worn)} />
      ) : (
        <Pill data-not-bound=''>not bound</Pill>
      )}
    </ChipRow>
  );
}
