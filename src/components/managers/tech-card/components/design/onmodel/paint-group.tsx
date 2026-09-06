import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignColourRecipe,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { Button } from 'ui/components/button';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX, type ReactNode } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import { PantonePicker } from '../../pantone-picker';
import { findPantone } from '../../pantone-swatches';
import { ASSETS_PER_CARD_MAX, ASSET_FABRIC, clothShelf } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { COLORWAY_NONE } from '../bench-kinds';
import { archivedRef, colorwayLabel as nameOfColorway } from '../colorway-picker';
import { EmptyState, GROUP_GAP, Reason } from '../core';
import type { PaintDraft } from './drafts';
import { paintModeWord, type ClothChoice, type OnModelPaint } from './model';

/**
 * ═══ WHAT IT IS REPAINTED IN — A CLOTH, A COLOUR, OR BOTH (r3 п.43) ═══════════════════════════
 *
 * ⚠ «ONE OF THREE» IS GONE, BY NAME. The owner: «ткань и цвет вместе — не „одно из"». The two
 * axes were exclusive by STATE (`useOnModelPaint` wiped one when the other was touched) on the
 * prototype's grammar alone; the server takes them together and has always had a sentence for the
 * pair — «re-clothed in nylon twill, re-tinted to 18-1248 TCX». Nothing enforces a choice now, and
 * the group pill says which axes are stated.
 *
 * ⚠ THE COLOUR IS A PANTONE REFERENCE, AND THE REFERENCE IS THE DESCRIPTION (r3 п.43/23:
 * «пантон и есть описание»). What stood here — a grid of the card's known hex tiles PLUS a free
 * hue picker with a hex field — was two doors onto one field, and neither said anything a
 * dyehouse could act on. One door replaces them: the studio's own `PantonePicker`, the same organ
 * the pattern step and the BOM sheet use, searched by code or by colour name. The swatch beside it
 * is a PREVIEW, not a second door: it has no click of its own.
 *
 * WITHOUT A SHOT THERE IS NOTHING HERE TO CLICK. The paint is a property of the run; showing live
 * tiles over an empty strip would take a click that has nowhere to be written. The group then says
 * so in one line and waits.
 *
 * «MAKE A NEW CLOTH» IS THE PRODUCT'S OWN DOOR, NOT A DETOUR. The prototype sends the person to
 * FABRIC RENDER to build a texture and come back; this admin already makes a cloth from a picture
 * in one gesture — the library / ⌘V / drop, the same `UpsertDesignAsset` the palette's `+ texture`
 * writes — so the chip opens the library, the picture lands on the shelf as `cloth N` and is
 * picked as the paint the moment the server answers. `pending` is the mid-flight pill.
 *
 * THE COLOURWAY — CHIPS THAT BIND AND UNBIND, OVER THE COMPOSER'S ONE STATE. One chip per
 * colourway of the card, the bound one filled; a click on the bound one unbinds, a click on
 * another binds, an archived name is offered only while it is the one bound. The studio still has
 * ONE colourway STATE — `useColorwayChoice` in `studio-tab.tsx`, the number the select on the rail
 * also writes — and the chips are a second DOOR to that one setter (`onColorwayChange`), never a
 * second copy of the number. It is NOT SENT to the model: it becomes the `colorway_id` of the run,
 * i.e. the name the returned pictures are filed under.
 */

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

/**
 * THE SWATCH BESIDE THE PICKER — A PREVIEW, NOT A DOOR. It carries no click: the reference is
 * picked in one place, and a square that also opened the picker would be the second button for
 * one thing this round was asked to remove. A reference the swatch list cannot colour (a
 * dyehouse's own number) shows the striped ground and its code, which is the truth about it.
 */
function ColourSwatch({ hex, code }: { hex: string; code: string }): JSX.Element {
  return (
    <span
      aria-hidden
      data-om-swatch={code || 'none'}
      className='block size-14 shrink-0 border border-borderColor'
      style={hex ? { background: hex } : PLACEHOLDER_SURFACE}
    />
  );
}

export function PaintGroup({
  band,
  techCardId,
  hasShots,
  paint,
  draft,
  choices,
  colour,
  colorwayId = COLORWAY_NONE,
  colorwayLabel,
  colorwayArchived,
  colorways,
  onColorwayChange,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  /** Whether the strip carries anything at all — the paint is a property of the RUN, not of a slot. */
  hasShots: boolean;
  paint: OnModelPaint;
  draft: PaintDraft;
  /** The shelf, already judged against the shot (`clothChoices`): a cloth that IS the shot is blocked. */
  choices: readonly ClothChoice[];
  /** THE WIRE BODY (`paintWire`) — the pills read what will actually leave, not the draft. */
  colour: common_DesignColourRecipe;
  /** The bound colourway — the composer's number; `0` = not bound. Which chip is filled. */
  colorwayId?: number;
  colorwayLabel: string;
  colorwayArchived: boolean;
  /** The card's colourways and the composer's setter — together they make the chips live. */
  colorways?: common_AdminColorwayRef[];
  onColorwayChange?: (id: number) => void;
  disabled?: boolean;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const shelf = useMemo(() => clothShelf(band), [band]);
  const totalAssets = (band.assets ?? []).length;
  const full = totalAssets >= ASSETS_PER_CARD_MAX;
  const fullReason = `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets · take a cloth off the shelf on FABRIC RENDER first`;
  const blocked = choices.find((c) => !!c.blocked) ?? null;
  /** The chips are live only when the composer handed in BOTH the list and the setter. */
  const liveChips = !!onColorwayChange && !!colorways;
  /** The mock-up's filter: an archived colourway is offered only while it is the bound one. */
  const ways = (colorways ?? []).filter(
    (c) => !archivedRef(c) || (c.colorwayId ?? 0) === colorwayId,
  );

  if (!hasShots) {
    return (
      <div id='design-onmodel-paint' data-om-paint='waiting'>
        <GroupLabel className={GROUP_GAP} action={<Pill tone='mut'>waiting for a shot</Pill>}>
          what it is repainted in
        </GroupLabel>
        <CalloutBox tone='note'>
          <Text size='micro' component='p' className='normal-case'>
            the paint travels with the run · put a photograph in the strip first
          </Text>
        </CalloutBox>
      </div>
    );
  }

  const modeWord = paintModeWord(paint);
  const code = paint.code.trim();
  /** The screen colour of the picked reference — the swatch list's own, or nothing to show. */
  const swatchHex = paint.hex || findPantone(code)?.hex || '';
  const clothOn = paint.assetId > 0;
  const axes = [clothOn ? 'cloth' : '', code ? 'colour' : ''].filter(Boolean).join('+') || 'none';

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
    <div id='design-onmodel-paint' data-om-paint={axes}>
      <GroupLabel
        className={GROUP_GAP}
        action={<Pill tone={modeWord === 'nothing picked' ? 'mut' : 'ink'}>{modeWord}</Pill>}
      >
        what it is repainted in
      </GroupLabel>

      {choices.length === 0 ? (
        <EmptyState action={newCloth}>this card has no cloth on its shelf yet</EmptyState>
      ) : (
        <Tiles min={118}>
          {choices.map((choice) => {
            const on = paint.assetId === choice.assetId;
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
        className={GROUP_GAP}
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            {code ? <Pill tone='ink'>{code}</Pill> : <Pill tone='mut'>no colour</Pill>}
            <Pill tone='ink'>goes to the model</Pill>
          </span>
        }
      >
        and a colour
      </GroupLabel>

      {/* ONE DOOR, AND THE SWATCH IS NOT A SECOND ONE. The reference names the colour the way a
          dyehouse names it; the square shows what that number looks like on a screen, which is an
          approximation and never the authority. */}
      <div className='flex flex-wrap items-center gap-3' data-om-colour={code || 'none'}>
        <ColourSwatch hex={swatchHex} code={code} />
        <div className='flex min-w-0 flex-col items-start gap-1'>
          <PantonePicker
            name='onmodel-paint'
            value={code}
            disabled={disabled}
            label='pick a pantone'
            onPick={(next) => draft.setColour(findPantone(next)?.hex ?? '', next)}
          />
          <Text size='nano' variant='label' component='span' className='normal-case'>
            {code
              ? swatchHex
                ? `${code} · ${swatchHex.toUpperCase()} on screen`
                : `${code} · no screen colour for this reference`
              : 'searched by code or by colour name'}
          </Text>
        </div>
        {code && !disabled && (
          <Button variant='secondary' size='xs' onClick={() => draft.setColour('', '')}>
            take the colour off
          </Button>
        )}
      </div>

      <GroupLabel
        className={GROUP_GAP}
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            {colorwayLabel ? (
              <Pill tone='ink'>{colorwayLabel}</Pill>
            ) : (
              <Pill tone='mut'>not bound</Pill>
            )}
            {/* «OPTIONAL» СНЯТ: «not bound» уже говорит, что связи может не быть, а две пилюли об
                одном читаются как два разных факта (та же правка, что п.14 у паттерна). */}
            <Pill tone='mut'>not sent</Pill>
          </span>
        }
      >
        colourway
      </GroupLabel>
      {liveChips ? (
        /* THE CHIPS — the mock-up's `colourwayChips`: one chip per colourway of the card, the
           bound one filled; a click on the bound one UNBINDS (`COLORWAY_NONE`), a click on another
           binds. An archived name is listed only while it is the bound one (the mock-up's filter),
           so a name nobody may work under is not offered, yet the one a person stands on is not
           pulled from under them. Every chip is a real `<button type='button'>` (Chip with
           `onClick`), so the form is never submitted by a bind. */
        ways.length === 0 ? (
          <EmptyState>no colourways yet · the pictures keep their own name</EmptyState>
        ) : (
          <div
            className='flex flex-wrap items-center gap-1.5'
            data-om-colourway={colorwayLabel || 'none'}
          >
            {ways.map((c) => {
              const id = c.colorwayId ?? 0;
              const on = id === colorwayId;
              const name = nameOfColorway(c);
              const archived = archivedRef(c);
              return (
                <Chip
                  key={id}
                  selected={on}
                  pressed={on}
                  disabled={disabled}
                  onClick={() => onColorwayChange?.(on ? COLORWAY_NONE : id)}
                  aria-label={`${on ? 'unbind from' : 'bind to'} ${name}`}
                  title={archived ? `${name} · archived · no new picture is made under it` : undefined}
                  data-om-way={id}
                >
                  {name}
                  {archived ? ' · archived' : ''}
                </Chip>
              );
            })}
          </div>
        )
      ) : (
        /* WITHOUT THE SETTER the group reads the binding and says where it is changed — the face
           it had before the chips, kept for a composer that hands no `onColorwayChange` in. */
        <div className='flex flex-wrap items-center gap-1.5' data-om-colourway={colorwayLabel || 'none'}>
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {colorwayLabel
              ? `bound to ${colorwayLabel} · picked in the COLOURWAY select on the rail`
              : 'not bound · pick one in the COLOURWAY select on the rail, or leave it'}
            {colorwayArchived ? ' · archived, so no new picture is made under it' : ''}
          </Text>
        </div>
      )}
      <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
        a link written on the picture that comes back · not a word in the prompt
        {liveChips && colorwayArchived
          ? ` · ${colorwayLabel} is archived, so no new picture is made under it`
          : ''}
      </Text>
    </div>
  );
}
