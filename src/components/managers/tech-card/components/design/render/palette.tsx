import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import MediaComponent from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { useColourDraft, type ColourDraft } from './drafts';
import { FieldRow, Hint, Swatch } from './field-row';
import {
  FABRIC_AUTHORITY,
  colourLabel,
  colourSubtitle,
  colourSwatchHex,
  fabricStatement,
  hexIsPaintable,
  mediaThumb,
} from './model';

/**
 * FABRIC — what a render is coloured and clothed with.
 *
 * THREE STATEMENTS THAT COMBINE, WHICH IS THE WHOLE CHANGE ON THIS SCREEN. It used to be a
 * segmented switch: dictionary OR own colour OR fabric photo, one at a time, each move wiping the
 * other two fields. The owner asked for the opposite in as many words — «можно комбинировать» — and
 * the reason is a real garment: the photograph is the only thing that can state a rib knit's
 * texture, the picker is the only thing that can state an exact colour, and the words are the only
 * place «matte, slightly sheer» fits. Forcing a choice between them threw away two thirds of what a
 * person knows about the cloth.
 *
 * SO THE SCREEN'S JOB CHANGED FROM «PICK ONE» TO «SAY WHICH WINS». Three coexisting statements can
 * disagree — a blue swatch under a red picker — and the answer is NOT computed here. It is written
 * into the prompt (`internal/designgen/renderprompt.go`) so that every run resolves the collision
 * identically, and this block only REPEATS it, once, at the top: photo → material, picked colour
 * beats the photo on colour, words add what is left. A person about to spend money is entitled to
 * read the rule before pressing GENERATE, not to discover it in the picture.
 *
 * THREE RULED ROWS, NOT THREE BOXES. Each statement is one line of the ladder (`FieldRow`, the
 * `#e6e6e6` weight), because a block never contains a block and «which of these is filled in» has
 * to be answerable by running an eye down one column of labels.
 *
 * NOTHING HERE IS CARD DATA. A colourway is a fact about the style, signed off by a lab dip; this
 * is a submission to a picture generator, and the two must never be confused — which is why a typed
 * hex still carries its worded warning that it is a visualisation override. The recipe reaches the
 * server once, inside `StartDesignRun.params.colour`, and lives afterwards only as the run's own
 * frozen history.
 *
 * THE LAB-DIP CLAUSE OF THE PROTOTYPE IS STILL NOT HERE, AND STILL DELIBERATELY. The prototype
 * prints «also a colorway of this style — lab dip approved · round 1», and the badge reads the LAB
 * DIP rather than the colourway fact. This admin cannot draw it truthfully: colourways are a
 * separate entity, `GetColorwaysPaged` has no «of this tech card» filter and the band carries none,
 * so the clause would need a paged scan of the whole system to answer — and a wrong answer here is
 * a technologist rendering a colour the dyehouse has already rejected. Absent beats guessed.
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
        The colour dictionary is empty on this server. Type a hex beside it, or leave the colour to
        the fabric photo.
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

/**
 * The colour picker itself — a native `<input type='color'>` behind a square of our own.
 *
 * THE NATIVE CONTROL IS THE RIGHT ONE AND IT IS ALSO THE WRONG SHAPE. It is the affordance every
 * operating system already gives a person for choosing a colour, and reinventing it in a brutalist
 * admin would be inventing a worse eyedropper. But its default chrome is a rounded, padded,
 * bordered swatch that belongs to no design system, so it is made invisible and stretched over a
 * square we draw: our border, our zero radius, our focus ring. The click target and the OS picker
 * are unchanged; only the skin is ours.
 *
 * IT NEEDS A PAINTABLE VALUE. A half-typed `#4a5` is not a colour a native picker can open on, and
 * feeding it one makes browsers silently fall back to black — so the input holds the last paintable
 * value and the text field beside it stays the place where a partial hex is allowed to exist. While
 * nothing paintable is stated the square is STRIPED, the same way `Swatch` stripes an unknown
 * colour: a square that paints white would claim white was chosen.
 *
 * THE FOCUS RING BELONGS TO THE WRAPPER, NOT TO THE INPUT. The native control is held at
 * `opacity-0` and it must STAY there — revealing it on focus would drop the operating system's own
 * rounded, padded swatch on top of ours the moment somebody tabbed to it, which is precisely the
 * chrome this square exists to hide. `focus-within` puts our own ring on the square instead, so the
 * keyboard path is visible and the skin is still ours.
 */
function ColourPickerSquare({
  hex,
  disabled,
  onPick,
}: {
  hex: string;
  disabled?: boolean;
  onPick: (hex: string) => void;
}): JSX.Element {
  const paintable = hexIsPaintable(hex);
  const value = paintable ? hex.trim() : '#ffffff';
  return (
    <span
      title='pick a colour'
      className={cn(
        'relative block h-[22px] w-[22px] shrink-0 border border-textColor',
        'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-textColor',
        disabled && 'opacity-50',
      )}
      style={paintable ? { background: value } : PLACEHOLDER_SURFACE}
    >
      <input
        type='color'
        aria-label='pick a colour'
        disabled={disabled}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPick(e.target.value)}
        className='absolute inset-0 h-full w-full cursor-pointer appearance-none border-0 bg-transparent p-0 opacity-0 disabled:cursor-not-allowed'
      />
    </span>
  );
}

export function Palette({
  disabled,
  /** Supplied by `RenderStudio`, so the palette and the studio's gate read one draft. */
  draft,
  band,
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
  const stated = fabricStatement(recipe);

  const { dictionary } = useDictionary();
  const colors = dictionary?.colors;

  /**
   * The fabric photo as an OBJECT, remembered from the moment it was picked.
   *
   * The recipe carries only `fabric_media_id`, and `AdminService` has no verb that reads a media by
   * id — so a recipe seeded from the card's last run names a file this screen cannot draw. It says
   * so in words rather than showing an empty frame that reads as a broken picture.
   */
  const [fabric, setFabric] = useState<common_MediaFull | null>(null);
  const fabricId = recipe.fabricMediaId ?? 0;
  const fabricUrl = fabric && fabric.id === fabricId ? mediaThumb(fabric) : '';

  return (
    <div>
      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {FABRIC_AUTHORITY}
          </Text>
        }
      >
        fabric
      </GroupLabel>

      {/* WHAT IS STATED, STATED BEFORE IT IS EDITED. The swatch, the name and the full list of
          sources stand above the controls, so the answer to «what will this render be made of»
          never depends on scanning three rows for whichever one is filled. */}
      <div className='flex flex-wrap items-start gap-3 border-b border-hairline pb-2'>
        <Swatch hex={colourSwatchHex(recipe, colors)} size={44} />
        <div className='min-w-0 flex-1'>
          <Text
            size='control'
            variant='uppercase'
            tracking='label'
            component='p'
            className='font-bold'
          >
            {colourLabel(recipe, colors)}
          </Text>
          <Text size='micro' variant='label' component='p' className='normal-case'>
            {colourSubtitle(recipe, colors)}
          </Text>
        </div>
      </div>

      {/* ── 1. THE PHOTOGRAPH — the only source that can state a weave. */}
      <FieldRow label='photo'>
        {fabricUrl ? (
          <span className='block size-[44px] shrink-0 border border-borderColor'>
            <MediaComponent src={fabricUrl} alt='fabric photo' aspectRatio='auto' fit='cover' />
          </span>
        ) : fabricId > 0 ? (
          <Text size='micro' variant='label' component='span'>
            media {fabricId} — picked earlier, not drawn here
          </Text>
        ) : null}
        {!disabled && (
          <MediaSelector
            label={fabricId > 0 ? 'change ▸' : 'pick a fabric photo ▸'}
            purpose='design · fabric photo for the render'
            aspectRatio={['Custom']}
            allowMultiple={false}
            showVideos={false}
            triggerClassName='px-1.5 py-px text-micro uppercase tracking-label cursor-pointer border border-textInactiveColor hover:bg-textColor hover:text-bgColor'
            saveSelectedMedia={(media) => {
              const first = media[0];
              if (!first?.id) return;
              setFabric(first);
              // ⚠ THE COLOUR IS NOT CLEARED. This one line is the change the owner asked for: the
              // old switch wrote `{ code: '', hex: '' }` here, so attaching a swatch silently
              // deleted the colour a person had already picked.
              state.patch({ fabricMediaId: first.id });
            }}
          />
        )}
        {!disabled && fabricId > 0 && (
          <Button
            variant='secondary'
            size='xs'
            onClick={() => {
              setFabric(null);
              state.clear('photo');
            }}
          >
            remove
          </Button>
        )}
        <Hint>
          {stated.photo
            ? 'travels with THIS RUN as an image: its weave, texture and drape are what the cloth is read from'
            : 'optional — a swatch states the material the colour picker cannot'}
        </Hint>
      </FieldRow>

      {/* ── 2. THE PICKED COLOUR — dictionary code and hex are ONE statement, on one line. */}
      <FieldRow label='colour'>
        <ColourPickerSquare
          hex={recipe.hex ?? ''}
          disabled={disabled}
          onPick={(hex) => state.patch({ hex })}
        />
        <div className='w-[100px]'>
          <Input
            name='design-colour-hex'
            value={recipe.hex ?? ''}
            disabled={disabled}
            placeholder='#4a5a3c'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.patch({ hex: e.target.value })
            }
          />
        </div>
        {!disabled && stated.colour && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('colour')}>
            clear
          </Button>
        )}
        {hexIsPaintable(recipe.hex) && !(recipe.code ?? '').trim() && (
          <Pill tone='attention'>visualisation override — cannot become canonical</Pill>
        )}
        {/* THE DICTIONARY IS THE SAME STATEMENT AND THEREFORE THE SAME ROW. It wraps onto its own
            line under the picker (the row is `flex-wrap`, this child is full-width) instead of
            opening a second ruled line with an empty label column: three statements, three rules,
            so «which of these did I fill in» is answerable by running an eye down one column.
            ⚠ THE INDENT IS THE LABEL COLUMN, MEASURED AND NOT GUESSED — `FieldRow`'s label is 92px
            wide with an 8px gap after it. Without it the wrapped line starts at the block's left
            edge, under the word COLOUR rather than under the control it belongs to, and the swatch
            grid reads as a separate section that lost its heading. */}
        <div className='w-full space-y-1 pl-[100px]'>
          <DictionaryGrid
            code={recipe.code ?? ''}
            disabled={disabled}
            // A dictionary colour states BOTH halves: the code the prompt names and the hex the
            // screen paints. Picking one leaves the photo and the words exactly where they are.
            onPick={(code, hex) => state.patch({ code, hex })}
          />
          <Hint>
            The colour goes to the model as a name and a hex together, and it overrides the colour
            of the photo above. Picking one states nothing about the style — a colourway is signed
            off by a lab dip, not by a render.
          </Hint>
        </div>
      </FieldRow>

      {/* ── 3. THE WORDS — the lowest rank, and a legal statement entirely on its own. */}
      <FieldRow label='in words'>
        <div className='w-full max-w-[420px]'>
          <Input
            name='design-fabric-words'
            value={recipe.words ?? ''}
            disabled={disabled}
            placeholder='fine rib jersey, matte, slightly sheer…'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.patch({ words: e.target.value })
            }
          />
        </div>
        {!disabled && stated.words && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('words')}>
            clear
          </Button>
        )}
        <Hint>adds what the photo and the colour do not state; it never overrides either</Hint>
      </FieldRow>
    </div>
  );
}
