import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState, type JSX } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import MediaComponent from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { useColourDraft, type ColourDraft } from './drafts';
import { FieldRow, Hint, Swatch } from './field-row';
import {
  COLOUR_SOURCES,
  COLOUR_SOURCE_LABEL,
  colourLabel,
  colourSourceOf,
  colourSubtitle,
  colourSwatchHex,
  mediaThumb,
  type ColourSource,
} from './model';

/**
 * COLOUR & MATERIAL — the palette a fabric render is submitted with.
 *
 * THREE SOURCES, ONE RECIPE. A dictionary colour, a colour of your own, or a photograph of the
 * fabric — and words are added to any of them. That is not three features; it is one field
 * (`DesignColourRecipe`) whose three populated shapes the wire already distinguishes by which of
 * `code` / `hex` / `fabric_media_id` is set. The segment picks which one is being stated.
 *
 * NOTHING HERE IS CARD DATA. A colourway is a fact about the style, signed off by a lab dip; this
 * is a submission to a picture generator, and the two must never be confused — which is why the own
 * colour carries a worded warning that it is a visualisation override and cannot become canonical.
 * The recipe reaches the server once, inside `StartDesignRun.params.colour`, and lives afterwards
 * only as the run's own frozen history.
 *
 * THE LAB-DIP CLAUSE OF THE PROTOTYPE IS NOT HERE, AND THAT IS DELIBERATE. The prototype prints
 * «also a colorway of this style — lab dip approved · round 1» under the current colour, and the
 * sentence is load-bearing: the badge reads the LAB DIP, not the colourway fact. This admin cannot
 * draw it truthfully. Colourways are a separate entity, `GetColorwaysPaged` has no filter for «of
 * this tech card», and the band carries none — so the clause would need a paged scan of every
 * colourway in the system to be answered, and a wrong answer here is a technologist rendering a
 * colour the dyehouse has already rejected. Absent beats guessed. It comes back the day the band
 * (or a filter) carries the card's colourways.
 */

/** The block a dictionary colour is picked out of. Wrapped so it can scroll on a narrow screen. */
function DictionaryGrid({
  code,
  disabled,
  onPick,
}: {
  code: string;
  disabled?: boolean;
  onPick: (code: string, hex: string) => void;
}): JSX.Element {
  const { dictionary, loading } = useDictionary();
  const colors = (dictionary?.colors ?? []).filter((c) => !c.archived && (c.code ?? '').trim());

  if (loading && !colors.length) {
    return (
      <Text size='micro' variant='inactive' component='span'>
        loading the colour dictionary…
      </Text>
    );
  }
  if (!colors.length) {
    return (
      <Text size='micro' variant='inactive' component='span' className='normal-case'>
        The colour dictionary is empty on this server, so there is nothing to pick. Use «own colour»
        or a fabric photo — both travel with the run either way.
      </Text>
    );
  }

  const current = (code ?? '').trim().toUpperCase();
  return (
    <div className='flex flex-wrap gap-1.5'>
      {colors.map((colour) => {
        const value = (colour.code ?? '').trim().toUpperCase();
        const hex = (colour.hex ?? '').trim();
        const selected = value === current;
        return (
          <button
            key={value}
            type='button'
            disabled={disabled}
            aria-pressed={selected}
            title={`${value}${colour.name ? ` · ${colour.name}` : ''}${hex ? ` · ${hex}` : ''}`}
            onClick={() => onPick(value, hex)}
            className={cn(
              'flex w-[34px] shrink-0 flex-col items-center gap-0.5 p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              selected ? 'bg-textColor' : 'hover:bg-bgZebra',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Swatch hex={hex} size={22} />
            <Text
              size='nano'
              variant='uppercase'
              component='span'
              className={selected ? '!text-bgColor' : 'text-labelColor'}
            >
              {value}
            </Text>
          </button>
        );
      })}
    </div>
  );
}

export function Palette({
  band,
  disabled,
  /** Supplied by `RenderStudio`, so the palette and the colour history share one draft. */
  draft,
}: {
  band: GetDesignBandResponse;
  /** Accepted for one signature across the band's organs; the palette itself writes nothing — the
   *  recipe travels inside the run the studio starts. */
  techCardId: number;
  disabled?: boolean;
  draft?: ColourDraft;
}): JSX.Element {
  // Own draft when mounted alone, the studio's when composed. The hook is called unconditionally —
  // rules of hooks — and its result is simply not used when a draft was handed in.
  const own = useColourDraft(band);
  const state = draft ?? own;
  const recipe = state.recipe;
  const source = colourSourceOf(recipe);

  const { dictionary } = useDictionary();
  const colors = dictionary?.colors;

  /**
   * The fabric photo as an OBJECT, remembered from the moment it was picked.
   *
   * The recipe carries only `fabric_media_id`, and `AdminService` has no verb that reads a media by
   * id — so a recipe restored from a history chip names a file this screen cannot draw. It says so
   * in words rather than showing an empty frame that reads as a broken picture.
   */
  const [fabric, setFabric] = useState<common_MediaFull | null>(null);
  const fabricId = recipe.fabricMediaId ?? 0;
  const fabricUrl = fabric && fabric.id === fabricId ? mediaThumb(fabric) : '';

  return (
    <div>
      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span' className='normal-case'>
            a dictionary colour, your own, or a fabric photo · words are added to any of them
          </Text>
        }
      >
        colour &amp; material
      </GroupLabel>

      {/* THE CURRENT COLOUR, STATED BEFORE IT IS EDITED. The big swatch, its name and where it comes
          from stand above the picker, so the answer to «what will this render be» never depends on
          scanning a grid for whichever cell is filled ink. */}
      <div className='flex flex-wrap items-start gap-3 border-b border-hairline pb-2'>
        <Swatch hex={colourSwatchHex(recipe, colors)} size={44} />
        <div className='min-w-0 flex-1'>
          <Text size='control' variant='uppercase' tracking='label' component='p' className='font-bold'>
            {colourLabel(recipe, colors)}
          </Text>
          <Text size='micro' variant='label' component='p' className='normal-case'>
            {colourSubtitle(recipe, colors)}
          </Text>
        </div>
        {/* NO FIXED WIDTH. `ViewSwitch` is an `inline-flex` whose segments size to their labels;
            boxing it made «own colour» and «fabric photo» wrap to two lines each and the strip
            grew a row taller than the swatch beside it. */}
        <ViewSwitch<ColourSource>
          className='shrink-0'
          label='colour source'
          value={source}
          disabled={disabled}
          options={COLOUR_SOURCES.map((value) => ({
            value,
            label: COLOUR_SOURCE_LABEL[value],
          }))}
          onChange={(next) => state.patch({ source: next })}
        />
      </div>

      <div className='border-b border-hairline py-2'>
        {source === 'dictionary' && (
          <div className='space-y-1.5'>
            <DictionaryGrid
              code={recipe.code ?? ''}
              disabled={disabled}
              onPick={(code, hex) => state.patch({ source: 'dictionary', code, hex })}
            />
            <Hint>
              The colour goes into the prompt as a name and a hex together. Picking one here states
              nothing about the style — a colourway is signed off by a lab dip, not by a render.
            </Hint>
          </div>
        )}

        {source === 'own' && (
          <div className='flex flex-wrap items-center gap-2'>
            <div className='w-[120px]'>
              <Input
                name='design-own-hex'
                value={recipe.hex ?? ''}
                disabled={disabled}
                placeholder='#4a5a3c'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  state.patch({ source: 'own', hex: e.target.value, code: '' })
                }
              />
            </div>
            <Swatch hex={recipe.hex ?? ''} size={22} />
            <Pill tone='attention'>visualisation override — cannot become canonical</Pill>
          </div>
        )}

        {source === 'photo' && (
          <div className='flex flex-wrap items-center gap-3'>
            {fabricUrl ? (
              <div className='h-[72px] w-[72px] shrink-0 border border-borderColor'>
                <MediaComponent src={fabricUrl} alt='fabric photo' aspectRatio='auto' fit='cover' />
              </div>
            ) : fabricId > 0 ? (
              <Text size='micro' variant='label' component='span'>
                fabric photo · media {fabricId} — picked earlier, not drawn here
              </Text>
            ) : null}
            {disabled && fabricId === 0 && (
              <Text size='micro' variant='inactive' component='span'>
                no fabric photo on this submission
              </Text>
            )}
            {!disabled && (
              <MediaSelector
                label={fabricId > 0 ? 'change the photo ▸' : 'pick a fabric photo ▸'}
                purpose='design · fabric photo for the render'
                aspectRatio={['Custom']}
                allowMultiple={false}
                showVideos={false}
                triggerClassName='px-1.5 py-px text-micro uppercase tracking-label cursor-pointer border border-textInactiveColor hover:bg-textColor hover:text-bgColor'
                saveSelectedMedia={(media) => {
                  const first = media[0];
                  if (!first?.id) return;
                  setFabric(first);
                  state.patch({ source: 'photo', fabricMediaId: first.id, code: '', hex: '' });
                }}
              />
            )}
            <Hint>
              The photo travels with THIS RUN only, as an image in its prompt. It is not filed as a
              reference of the card — a reference carries a role (which side it is about), and a
              swatch of cloth has none.
            </Hint>
          </div>
        )}
      </div>

      <FieldRow label='in words'>
        <div className='w-full max-w-[420px]'>
          <Input
            name='design-colour-words'
            value={recipe.words ?? ''}
            disabled={disabled}
            placeholder='matte, brushed, slight sheen…'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.patch({ words: e.target.value })
            }
          />
        </div>
        <Hint>added to whatever is picked above</Hint>
      </FieldRow>
    </div>
  );
}
