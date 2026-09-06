import type { common_AdminColorwayRef } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useMemo, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import { Tile, Tiles } from 'ui/components/tiles';

import { archivedRef, colorwayLabel } from '../colorway-picker';
import { EmptyState } from '../core';
import { Swatch } from '../render/field-row';
import { colourwayHex, pickableColourways } from './model';
import { CornerLabel, GoToStep } from './organs';

/**
 * TWO ORGANS OVER THE CARD'S COLOURWAYS — the colour that goes INTO a tile, and the colourway a
 * finished tile is WORN BY. They read the same list and are shaped differently on purpose:
 *
 *   · COLOUR is an INPUT of the generation, and a colour has to be SEEN — so it is picked as a
 *     TILE with a filled face, the same form FABRIC RENDER draws its colour in;
 *   · WORN BY is a LINK, not an input, and a link has to be READ — so it is a row of CHIPS, and
 *     the form itself says this is another kind of thing.
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

/**
 * THE COLOUR GRID. One tile per live colourway (an archived one only while it is the pick, and
 * dimmed); the face is the colourway's own hex, the corner says `colour`, the pick carries `in`.
 * A click picks, a second click takes the colour off. No colourways → the reason is a visible
 * line with the door to where colourways come from; an empty grid is not allowed to stay silent.
 */
export function ColourTiles({
  refs,
  picked,
  onPick,
  disabled,
  techCardId,
}: {
  refs: readonly common_AdminColorwayRef[];
  picked: number;
  onPick: (colorwayId: number) => void;
  disabled?: boolean;
  techCardId: number;
}): JSX.Element {
  const list = pickableColourways(refs, picked, archivedRef);
  if (!list.length) {
    return (
      <div data-colour-empty=''>
        <EmptyState
          action={<GoToStep kind='render' label='fabric render ›' techCardId={techCardId} />}
        >
          this card carries no colour yet
        </EmptyState>
      </div>
    );
  }
  return (
    <Tiles min={118} className='max-w-[560px]'>
      {list.map((c) => {
        const cid = c.colorwayId ?? 0;
        const on = cid === picked;
        const hex = colourwayHex(c);
        const label = colorwayLabel(c);
        const archived = archivedRef(c);
        return (
          /* The wrapper carries the probe hook: `Tile` does not pass `data-*` through. */
          <div key={cid} data-colour-tile={cid} data-colour-on={on || undefined} className='min-w-0'>
            <Tile
              pressed={on}
              selected={on}
              onClick={disabled ? undefined : () => onPick(on ? 0 : cid)}
              title={on ? `take the colour off · ${label}` : `paint in ${label}`}
              className={cn(archived && 'opacity-40 focus-within:opacity-100 hover:opacity-100')}
              media={
                <span
                  data-colour-face={hex || 'none'}
                  className='relative block aspect-square w-full border border-hairline'
                  style={hex ? { background: hex } : PLACEHOLDER_SURFACE}
                >
                  <CornerLabel at='bl'>colour</CornerLabel>
                  {on && <CornerLabel at='tr'>in</CornerLabel>}
                </span>
              }
              name={label}
              sub={hex || 'no value'}
            />
          </div>
        );
      })}
    </Tiles>
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
