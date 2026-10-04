import type { common_AdminColorwayRef } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useSyncExternalStore, type JSX } from 'react';
import { HATCH } from 'ui/components/skeleton';
import Text from 'ui/components/text';

import { findPantone, pantoneVersion, subscribePantone } from '../pantone-swatches';
import { archivedRef, colorwayLabel } from './colorway-picker';

export type ColourwayStripProps = {
  colorways: readonly common_AdminColorwayRef[];
  selectedId: number;
  onSelect: (id: number) => void;
  onCreate?: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const TILE = 'size-[72px] shrink-0';

const swatchHex = (colorway: common_AdminColorwayRef): string =>
  (colorway.devHex ?? '').trim() || findPantone(colorway.pantone)?.hex || '#fff';

/**
 * The studio's colourway axis as material packs: one large swatch per colourway and one same-size
 * creation door. It deliberately owns no selected state, so MATERIALS and FABRIC RENDER always
 * move the composer's single axis rather than drifting into two local filters.
 */
export function ColourwayStrip({
  colorways,
  selectedId,
  onSelect,
  onCreate,
  disabled,
  loading,
}: ColourwayStripProps): JSX.Element {
  useSyncExternalStore(subscribePantone, pantoneVersion, pantoneVersion);
  const shown = colorways.filter((colorway) => (colorway.colorwayId ?? 0) > 0);

  return (
    <div className='flex items-start gap-2 overflow-x-auto pb-1' data-colourway-strip=''>
      {loading
        ? Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className='flex w-[72px] shrink-0 flex-col gap-1' aria-hidden>
              <span
                className={cn(TILE, 'border border-borderColor')}
                style={{ background: HATCH }}
              />
              <span className='h-[11px] w-12' style={{ background: HATCH }} />
            </div>
          ))
        : shown.map((colorway) => {
            const id = colorway.colorwayId ?? 0;
            const selected = id === selectedId;
            const archived = archivedRef(colorway);
            const name = colorwayLabel(colorway);
            const hex = swatchHex(colorway);
            return (
              <button
                key={id}
                type='button'
                aria-pressed={selected}
                aria-label={`${name}${archived ? ', archived' : ''}`}
                title={archived ? `${name} · archived` : name}
                disabled={disabled}
                onClick={() => onSelect(id)}
                data-colourway-tile={id}
                className='group flex w-[72px] shrink-0 flex-col gap-1 text-left disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <span
                  aria-hidden
                  className={cn(
                    TILE,
                    'border border-borderColor group-hover:border-textColor',
                    selected && 'border-2 border-textColor',
                    disabled && 'opacity-50',
                  )}
                  style={{
                    backgroundColor: hex,
                    backgroundImage: archived
                      ? 'repeating-linear-gradient(135deg,transparent 0 5px,rgba(0,0,0,.32) 5px 6px)'
                      : undefined,
                  }}
                />
                <Text
                  size='micro'
                  variant={disabled ? 'inactive' : 'default'}
                  component='span'
                  className={cn('w-full truncate', selected && 'font-bold')}
                >
                  {name}
                </Text>
              </button>
            );
          })}

      {!loading && (
        <button
          type='button'
          disabled={disabled || !onCreate}
          onClick={onCreate}
          data-colourway-create=''
          className='group flex w-[72px] shrink-0 flex-col gap-1 text-left disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        >
          <span
            aria-hidden
            className={cn(
              TILE,
              'flex items-center justify-center border border-dashed border-borderColor bg-bgColor text-labelColor group-hover:border-textColor group-hover:text-textColor',
              (disabled || !onCreate) && 'text-textInactiveColor',
            )}
          >
            <Text component='span' size='control' className='font-bold'>
              +
            </Text>
          </span>
          <Text
            size='micro'
            variant={disabled || !onCreate ? 'inactive' : 'label'}
            component='span'
            className='w-full truncate'
          >
            new colourway
          </Text>
        </button>
      )}
    </div>
  );
}
