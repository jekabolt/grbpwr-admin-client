import type { GetDesignBandResponse, common_DesignColourRecipe } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX, type ReactNode } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import { ColourPicker } from '../assets/colour-picker';
import { ASSETS_PER_CARD_MAX, ASSET_FABRIC, clothShelf, normaliseHex } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { EmptyState, Reason } from '../core';
import { hexIsPaintable } from '../render/model';
import type { PaintDraft } from './drafts';
import {
  flatColours,
  paintModeWord,
  type ClothChoice,
  type OnModelPaint,
  type OnModelShot,
} from './model';

/**
 * ═══ WHAT IT IS REPAINTED IN — three mutually exclusive answers in ONE group ═══════════════════
 *
 * The prototype's `omTarget`: the shelf of this card's cloths as picture tiles (corner CLOTH, mark
 * IN), the door `+ make a new cloth`, then «OR A FLAT COLOUR» — colour tiles (corner COLOUR) and
 * the picker for a colour the card does not know yet — then «COLOURWAY», the link written on the
 * picture that comes back. Exclusivity is STATE (`useOnModelPaint`), not click discipline.
 *
 * WITHOUT A SHOT THERE IS NOTHING HERE TO CLICK. The paint is kept on the shot; showing live tiles
 * over an empty slot would take a click that has nowhere to be written. The group then says so in
 * one line and waits.
 *
 * «MAKE A NEW CLOTH» IS THE PRODUCT'S OWN DOOR, NOT A DETOUR. The prototype sends the person to
 * FABRIC RENDER to build a texture and come back; this admin already makes a cloth from a picture
 * in one gesture — the library / ⌘V / drop, the same `UpsertDesignAsset` the palette's `+ texture`
 * writes — so the chip opens the library, the picture lands on the shelf as `cloth N` and is
 * picked as the paint the moment the server answers. `pending` is the mid-flight pill.
 *
 * THE COLOURWAY IS READ, NOT PICKED, HERE. The studio has ONE colourway organ — the select on the
 * rail (`studio-tab.tsx`) — and a second row of chips writing the same number would be two writers
 * of one state. The group prints the binding and where it is changed. It is NOT SENT to the model:
 * it becomes the `colorway_id` of the run, i.e. the name the returned picture is filed under.
 */

const SQUARE = '1/1';

/**
 * THE NAME OF A NEW CLOTH — the palette's rule, spelled once more because the palette keeps its
 * own private (`nextClothName`): first free «cloth N» over the WHOLE shelf, cloths and patterns,
 * never «count + 1» — after the second of three is deleted, «count + 1» is a taken name and two
 * cloths reach the prompt as one word.
 */
function nextClothName(taken: { name?: string }[]): string {
  const names = new Set(taken.map((a) => (a.name ?? '').trim().toLowerCase()));
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    if (!names.has(`cloth ${n}`)) return `cloth ${n}`;
  }
  return `cloth ${taken.length + 1}`;
}

/** A corner word on a tile's face — `cloth`, `colour`, `in`. Ink on the picture, nano caps. */
function Corner({ at, children }: { at: 'tr' | 'bl'; children: ReactNode }): JSX.Element {
  return (
    <span
      className={`pointer-events-none absolute z-10 bg-textColor px-1 py-px ${
        at === 'tr' ? 'right-1 top-1' : 'bottom-1 left-1'
      }`}
    >
      <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
        {children}
      </Text>
    </span>
  );
}

/** The square face of a shelf cloth: its picture, the corner word and the mark. */
function ClothFace({ choice, on }: { choice: ClothChoice; on: boolean }): JSX.Element {
  return (
    <span className='relative block aspect-square w-full overflow-hidden bg-bgColor'>
      {choice.thumb ? (
        <img src={choice.thumb} alt={choice.name} loading='lazy' className='h-full w-full object-cover' />
      ) : null}
      <Corner at='bl'>{choice.pattern ? 'pattern' : 'cloth'}</Corner>
      {on && <Corner at='tr'>in</Corner>}
    </span>
  );
}

/** The square face of a flat colour: a solid fill — the one thing the tile is picked for. */
function ColourFace({ hex, on, dim }: { hex: string; on: boolean; dim?: boolean }): JSX.Element {
  return (
    <span
      className={`relative block aspect-square w-full overflow-hidden ${dim ? 'opacity-45' : ''}`}
      style={{ background: hex }}
    >
      <Corner at='bl'>colour</Corner>
      {on && <Corner at='tr'>in</Corner>}
    </span>
  );
}

export function PaintGroup({
  band,
  techCardId,
  shot,
  paint,
  draft,
  choices,
  colour,
  colorwayLabel,
  colorwayArchived,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  shot: OnModelShot | null;
  paint: OnModelPaint;
  draft: PaintDraft;
  /** The shelf, already judged against the shot (`clothChoices`): a cloth that IS the shot is blocked. */
  choices: readonly ClothChoice[];
  /** THE WIRE BODY (`paintWire`) — the pills read what will actually leave, not the draft. */
  colour: common_DesignColourRecipe;
  colorwayLabel: string;
  colorwayArchived: boolean;
  disabled?: boolean;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const shelf = useMemo(() => clothShelf(band), [band]);
  const known = useMemo(() => flatColours(band), [band]);
  const totalAssets = (band.assets ?? []).length;
  const full = totalAssets >= ASSETS_PER_CARD_MAX;
  const fullReason = `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets · take a cloth off the shelf on FABRIC RENDER first`;
  const blocked = choices.find((c) => !!c.blocked) ?? null;

  if (!shot) {
    return (
      <div id='design-onmodel-paint' data-om-paint='waiting'>
        <GroupLabel action={<Pill tone='mut'>waiting for a shot</Pill>}>
          what it is repainted in
        </GroupLabel>
        <CalloutBox tone='note'>
          <Text size='micro' component='p' className='normal-case'>
            the paint is kept on the shot · pick a photograph first
          </Text>
        </CalloutBox>
      </div>
    );
  }

  const modeWord = paintModeWord(paint);
  const hexOn = paint.mode === 'colour' ? normaliseHex(paint.hex) : '';
  const typedHex = paint.mode === 'colour' ? paint.hex : '';
  /** The picker's own tile shows the colour it holds only when no known tile already shows it. */
  const pickerHolds = hexOn && !known.some((c) => c.hex === hexOn) ? hexOn : '';
  const colourName = hexOn ? (known.find((c) => c.hex === hexOn)?.name ?? hexOn) : '';

  const newCloth = disabled ? (
    <Chip dashed disabled title='this card is read-only for you' data-om-door='new-cloth'>
      + make a new cloth
    </Chip>
  ) : full ? (
    <Chip dashed disabled title={fullReason} data-om-door='new-cloth'>
      + make a new cloth
    </Chip>
  ) : (
    <MediaSelector
      label='make a new cloth'
      purpose='design · a new cloth for this card'
      aspectRatio={['Custom']}
      allowMultiple={false}
      showVideos={false}
      saveSelectedMedia={(media) => {
        const first = media[0];
        if (!first?.id) return;
        // The ceiling is checked again out loud: between the drawing and the modal a neighbouring
        // tab can fill the shelf.
        if ((band.assets ?? []).length >= ASSETS_PER_CARD_MAX) {
          showMessage(fullReason, 'error');
          return;
        }
        writes.upsertAsset.mutate(
          { assetId: 0, kind: ASSET_FABRIC, name: nextClothName(shelf), mediaId: first.id },
          {
            onSuccess: (res) => {
              const id = res?.asset?.id ?? 0;
              if (id > 0) draft.pickTexture(id);
            },
          },
        );
      }}
      trigger={
        <Chip
          dashed
          onClick={() => {}}
          aria-label='make a new cloth from a picture · it goes on the shelf of this card'
          data-om-door='new-cloth'
        >
          + make a new cloth
        </Chip>
      }
    />
  );

  return (
    <div id='design-onmodel-paint' data-om-paint={paint.mode || 'none'}>
      <GroupLabel
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Pill tone={modeWord === 'nothing picked' ? 'mut' : 'ink'}>{modeWord}</Pill>
            <Pill tone='mut'>one of three</Pill>
          </span>
        }
      >
        what it is repainted in
      </GroupLabel>

      {choices.length === 0 ? (
        <EmptyState action={newCloth}>this card has no cloth on its shelf yet</EmptyState>
      ) : (
        <Tiles min={118}>
          {choices.map((choice) => {
            const on = paint.mode === 'texture' && paint.assetId === choice.assetId;
            const shut = disabled || !!choice.blocked;
            return (
              <Tile
                key={choice.assetId}
                selected={on}
                pressed={on}
                title={
                  choice.blocked ||
                  (on ? `take out ${choice.name}` : `repaint in ${choice.name}`)
                }
                className={choice.blocked ? 'opacity-45' : undefined}
                onClick={shut ? undefined : () => draft.pickTexture(choice.assetId)}
                media={<ClothFace choice={choice} on={on} />}
                name={choice.name}
                sub={
                  choice.pattern
                    ? ['pattern', choice.repeatMm ? `${choice.repeatMm} mm` : '']
                        .filter(Boolean)
                        .join(' · ')
                    : undefined
                }
              />
            );
          })}
        </Tiles>
      )}
      {blocked && (
        <Reason className='mt-1'>
          <b>one cloth is unavailable:</b> {blocked.blocked}
        </Reason>
      )}

      <div className='mt-2 flex flex-wrap items-center gap-1.5'>
        {choices.length > 0 && newCloth}
        {writes.upsertAsset.isPending && (
          <>
            <Pill tone='attention'>pending</Pill>
            <Text size='nano' variant='label' component='span' className='normal-case'>
              the new cloth is going onto the shelf, then it is picked here
            </Text>
          </>
        )}
        {!disabled && full && <Reason>{fullReason}</Reason>}
      </div>

      <GroupLabel
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            {colourName ? <Pill tone='ink'>{colourName}</Pill> : <Pill tone='mut'>no colour</Pill>}
            <Pill tone='ink'>goes to the model</Pill>
          </span>
        }
      >
        or a flat colour
      </GroupLabel>

      <Tiles min={118}>
        {known.map((c) => {
          const on = hexOn === c.hex;
          return (
            <Tile
              key={c.hex}
              selected={on}
              pressed={on}
              title={on ? `take the colour off · ${c.name}` : `paint in ${c.name}`}
              onClick={disabled ? undefined : () => draft.toggleColour(c.hex)}
              media={<ColourFace hex={c.hex} on={on} />}
              name={c.name}
              sub={c.hex}
            />
          );
        })}
        {/* THE PICKER'S TILE — the door to a colour this card does not know yet. The same picker
            as the palette's (square, hue bar, hex field, dropper, the card's recipes as chips);
            only the FACE is a tile here. Empty it is the striped «+ colour». */}
        <div
          className={`flex h-full min-w-0 flex-col items-stretch border bg-bgColor p-1.5 ${
            pickerHolds ? 'border-2 border-textColor' : 'border-borderColor'
          }`}
          data-om-colour-picker={pickerHolds || 'empty'}
        >
          <ColourPicker
            hex={typedHex}
            disabled={disabled}
            recent={known.map((c) => ({ hex: c.hex, code: c.name }))}
            label='pick a colour of your own'
            onPick={(next) => draft.setColour(next)}
            onPickRecent={(next) => draft.setColour(next)}
            face={
              pickerHolds ? (
                <ColourFace hex={pickerHolds} on />
              ) : (
                <span
                  data-colour-swatch
                  style={{ ...PLACEHOLDER_SURFACE, aspectRatio: SQUARE }}
                  className={`${placeholderClass({ dashed: true })} w-full`}
                >
                  + colour
                </span>
              )
            }
          />
          <Text size='micro' className='mt-1 truncate font-bold uppercase'>
            {pickerHolds ? 'your colour' : 'a new colour'}
          </Text>
          <Text size='micro' variant='label' className='truncate'>
            {pickerHolds
              ? pickerHolds
              : typedHex && !hexIsPaintable(typedHex)
                ? `${typedHex} · not a colour yet`
                : 'hex · dropper · picker'}
          </Text>
        </div>
      </Tiles>

      <GroupLabel
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            {colorwayLabel ? (
              <Pill tone='ink'>{colorwayLabel}</Pill>
            ) : (
              <Pill tone='mut'>not bound</Pill>
            )}
            <Pill tone='mut'>not sent</Pill>
            <Pill tone='mut'>optional</Pill>
          </span>
        }
      >
        colourway
      </GroupLabel>
      <div className='flex flex-wrap items-center gap-1.5' data-om-colourway={colorwayLabel || 'none'}>
        <Text size='micro' variant='label' component='span' className='normal-case'>
          {colorwayLabel
            ? `bound to ${colorwayLabel} · picked in the COLOURWAY select on the rail`
            : 'not bound · pick one in the COLOURWAY select on the rail, or leave it'}
          {colorwayArchived ? ' · archived, so no new picture is made under it' : ''}
        </Text>
      </div>
      <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
        a link written on the picture that comes back · not a word in the prompt
      </Text>
    </div>
  );
}
