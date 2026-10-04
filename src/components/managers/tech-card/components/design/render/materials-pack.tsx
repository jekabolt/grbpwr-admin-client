import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useRef, useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import { GROUP_GAP } from '../core';
import { ColourPicker } from '../assets/colour-picker';
import { assetLabel, assetThumb } from '../assets/model';
import type { CanvasArtwork } from '../paint/artworks';
import type { PaintSession } from '../paint/use-paint';
import type { ClothSlot } from '../pattern/slot-fabrics';
import { PictureTile } from '../picture-tile';
import { boundClothsOf } from './drafts';

/**
 * V5 · FABRIC RENDER's recipe is the colourway's pack from MATERIALS: one read-only 72px tile per
 * bound cloth (slot order), cap = its slot name, and one door back to MATERIALS.
 */
export function MaterialsPack({
  band,
  colorwayId,
  colorwayLabel,
  slots,
  onEdit,
  paint,
  disabled,
  artworks = [],
}: {
  band: GetDesignBandResponse;
  colorwayId: number;
  colorwayLabel: string;
  slots?: readonly ClothSlot[];
  onEdit?: () => void;
  /**
   * PAINT THE PARTS: with flats on the bench the pack IS the palette — one tile per slot, a click
   * arms it, `+` adds a free colour.
   */
  paint?: PaintSession;
  disabled?: boolean;
  /**
   * R7 · the artworks bound to this colourway (DECORATION slots, `artworksOf`). With flats on the
   * bench a tile ARMS the `artwork` tool of PARTS (2px ink frame while armed); without, it is shown.
   */
  artworks?: readonly CanvasArtwork[];
}): JSX.Element {
  const cloths = useMemo(() => {
    const byId = new Map((band.assets ?? []).map((a) => [a.id ?? 0, a]));
    return boundClothsOf(band, colorwayId, slots).flatMap((c) => {
      const asset = byId.get(c.assetId);
      return asset ? [{ ...c, asset }] : [];
    });
  }, [band, colorwayId, slots]);

  const door = onEdit ? (
    <Button
      variant='underline'
      size='xs'
      className='text-labelColor hover:text-textColor'
      onClick={onEdit}
      data-materials-door=''
    >
      {cloths.length > 0 ? 'edit in materials ›' : 'materials ›'}
    </Button>
  ) : undefined;

  if (paint && paint.views.size > 0) {
    return <PaintPalette paint={paint} door={door} disabled={disabled} artworks={artworks} />;
  }

  return (
    <div data-materials-pack={cloths.length}>
      <GroupLabel flush className={GROUP_GAP} action={cloths.length > 0 ? door : undefined}>
        materials
      </GroupLabel>
      {cloths.length === 0 && artworks.length === 0 ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='normal-case'>
            no cloth marked for {colorwayLabel || 'this colourway'}
          </Text>
          {door}
        </div>
      ) : (
        <div className='flex flex-wrap items-start gap-2'>
          {cloths.map((c) => (
            <div key={c.assetId} className='flex w-[72px] shrink-0 flex-col gap-1'>
              <PictureTile
                url={assetThumb(c.asset)}
                alt={assetLabel(c.asset)}
                aspect='1/1'
                fit='cover'
                className='w-full'
              />
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='w-full truncate uppercase'
                title={[c.slotNames.join(', '), (c.asset.note ?? '').trim()]
                  .filter(Boolean)
                  .join(' · ')}
              >
                {c.slotNames.join(', ')}
              </Text>
            </div>
          ))}
          {artworks.length > 0 && cloths.length > 0 && <PackSeam />}
          {artworks.map((a) => (
            <ArtworkTile key={a.assetId} art={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The seam between the cloths and the artworks of the pack. */
function PackSeam(): JSX.Element {
  return <span aria-hidden className='h-[72px] w-px shrink-0 self-start bg-borderColor' />;
}

/** One artwork of the colourway — its picture on the paper, its slot name under it. */
function ArtworkTile({
  art,
  armed = false,
  onArm,
  disabled,
}: {
  art: CanvasArtwork;
  armed?: boolean;
  onArm?: () => void;
  disabled?: boolean;
}): JSX.Element {
  const face = (
    <>
      <PictureTile
        url={art.url}
        alt={art.name}
        aspect='1/1'
        fit='contain'
        selected={armed}
        className='pointer-events-none w-full'
      />
      <Text
        size='micro'
        variant={armed ? 'default' : 'label'}
        tracking='label'
        component='span'
        className='w-full truncate uppercase'
      >
        {art.name}
      </Text>
    </>
  );
  if (!onArm)
    return (
      <div
        className='flex w-[72px] shrink-0 flex-col gap-1'
        data-pack-artwork={art.assetId}
        title={[art.name, art.technique].filter(Boolean).join(' · ')}
      >
        {face}
      </div>
    );
  return (
    <button
      type='button'
      aria-pressed={armed}
      disabled={disabled}
      onClick={onArm}
      data-pack-artwork={art.assetId}
      title={[art.name, art.technique, 'drag on a side to place it'].filter(Boolean).join(' · ')}
      className={TILE_BTN}
    >
      {face}
    </button>
  );
}

const TILE_BTN =
  'group flex w-[72px] shrink-0 flex-col gap-1 text-left disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

/** MATERIALS as the palette of PARTS: the armed tile wears the ink frame (as a chosen colourway). */
function PaintPalette({
  paint,
  door,
  disabled,
  artworks,
}: {
  paint: PaintSession;
  door: React.ReactNode;
  disabled?: boolean;
  artworks: readonly CanvasArtwork[];
}): JSX.Element {
  /* `+`: the first pick of an open picker makes the colour, the next picks change it. */
  const adding = useRef('');
  const addingHex = paint.colours.find((c) => c.label === adding.current)?.colourHex ?? '';
  return (
    <div data-materials-pack={paint.materials.length} data-paint-palette=''>
      <GroupLabel flush className={GROUP_GAP} action={door}>
        materials
      </GroupLabel>
      <div className='flex flex-wrap items-start gap-2'>
        {paint.materials.map((m) => {
          const armed =
            paint.armed === m.label && paint.tool !== 'erase' && paint.tool !== 'artwork';
          return (
            <button
              key={m.label}
              type='button'
              aria-pressed={armed}
              disabled={disabled}
              onClick={() => paint.arm(m.label)}
              data-paint-material={m.kind === 'slot' ? m.bomItemId : m.colourHex}
              title={m.name}
              className={TILE_BTN}
            >
              {m.kind === 'slot' ? (
                <PictureTile
                  url={m.url}
                  alt={m.name}
                  aspect='1/1'
                  fit='cover'
                  selected={armed}
                  className='pointer-events-none w-full'
                />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'size-[72px] border border-borderColor group-hover:border-textColor',
                    armed && 'border-2 border-textColor',
                  )}
                  style={{ background: m.colourHex }}
                />
              )}
              <Text
                size='micro'
                variant={armed ? 'default' : 'label'}
                tracking='label'
                component='span'
                className='w-full truncate uppercase'
              >
                {m.name}
              </Text>
            </button>
          );
        })}
        <div
          className='w-[72px] shrink-0'
          onPointerDownCapture={() => {
            adding.current = '';
          }}
        >
          <ColourPicker
            hex={addingHex}
            disabled={disabled}
            label='add a colour'
            onPick={(hex) => {
              if (!hex) return;
              if (adding.current) paint.setColour(adding.current, hex);
              else adding.current = paint.addColour(hex);
            }}
            face={
              <span className={TILE_BTN} data-paint-add-colour=''>
                <span
                  aria-hidden
                  className='flex size-[72px] items-center justify-center border border-dashed border-borderColor bg-bgColor text-labelColor group-hover:border-textColor group-hover:text-textColor'
                >
                  <Text component='span' size='control' className='font-bold'>
                    +
                  </Text>
                </span>
                <Text
                  size='micro'
                  variant='label'
                  tracking='label'
                  component='span'
                  className='w-full truncate uppercase'
                >
                  colour
                </Text>
              </span>
            }
          />
        </div>
        {artworks.length > 0 && <PackSeam />}
        {artworks.map((a) => {
          const armed = paint.tool === 'artwork' && paint.armedArtwork === a.assetId;
          return (
            <ArtworkTile
              key={a.assetId}
              art={a}
              armed={armed}
              disabled={disabled}
              onArm={() => paint.armArtwork(armed ? 0 : a.assetId)}
            />
          );
        })}
      </div>
    </div>
  );
}
