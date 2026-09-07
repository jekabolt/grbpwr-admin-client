import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';

import { Counter, GROUP_GAP, Reason } from '../core';
import { CardPicturePicker } from '../core/card-picture-picker';
import { HALF_FACE } from '../core/two-half-slot';
import { PictureTile, TILE_CORNER, TILE_QUIET } from '../picture-tile';
import { mediaThumb } from '../render/model';
import { CELL_WIDTH, STRIP_FRAME_ASPECT, Strip } from '../render/strip-cell';
import type { PlaygroundDraft } from './drafts';
import { MarkMode } from './mark-mode';
import {
  PLAYGROUND_ITEMS_MAX,
  REFS_MAX,
  areaLetter,
  itemMediaIds,
  refsCount,
  type PlaygroundRole,
  type Preset,
} from './model';

/**
 * ═══ THE PICTURES ON THE TABLE — ONE STRIP, ONE PLACEHOLDER, TWO DOORS IN IT ══════════════════
 *
 * ⚠ THE TWO DOORS ARE TWO HALVES OF ONE PLACEHOLDER, AND THAT IS THE OWNER'S OWN CORRECTION:
 * «„+ PICTURE · from the library · ⌘V · drop“ делится на ДВЕ ПОЛОВИНЫ ОДНОГО ПЛЕЙСХОЛДЕРА … НЕ чип
 * в GroupLabel. Меньше кнопок: одна дверь на жест.» The prototype drew the second door as a chip on
 * the group's rule, two centimetres above the dashed tail that opens the other library — two
 * buttons standing apart for one gesture, «add a picture».
 *
 * SO THE TAIL IS HALVED, exactly as PATTERN → SOURCE PICTURE halves its own cell: the top half is
 * the product's `MediaSlot` (click to browse, ⌘V, drop a file, several at a time — all of it inside
 * the primitive), the bottom half opens `CardPicturePicker`, the pictures THIS CARD already has.
 * The face of both halves is the studio's one `HALF_FACE`, so the two doors are read as one pair.
 *
 * ⚠ WHY NOT `PlaceOrDrawCell`, THE SHARED TWO-HALF ORGAN. Its lower half is hardwired to the
 * DRAWING EDITOR — a pen glyph and the sentence «opens the picture editor on a blank plate» — and
 * a second generic variant would be a prop-fork on the four ribbons that already read it. That is
 * the same call `pattern/pattern-input.tsx` made, with the same reasoning, and what is shared is
 * what MUST match: the face and the halving geometry.
 *
 * THE CELLS STAND FOR MEDIA, NOT FOR PICTURES OF THE CARD, and the difference is on the wire: the
 * table IS `params.freeform.items[]`, an FK on `media(id)`. A picture taken through the card picker
 * travels as its media, exactly like one taken from the library.
 */

const PURPOSE = 'design · a picture on the playground table';

/** The glyph of the lower half — a stack of frames, i.e. what this card already holds. The stroke,
 *  the 24 box and the 20px size are the studio's other two glyphs' (`PhotoGlyph`, `PenGlyph`):
 *  three signs of one studio have to be of one hand. */
function CardStackGlyph(): JSX.Element {
  return (
    <svg
      aria-hidden
      width={20}
      height={20}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
      className='shrink-0'
    >
      <rect x='7.5' y='3.5' width='13' height='13' />
      <path d='M16.5 20.5h-13v-13' />
    </svg>
  );
}

/** Роли, которые пресет спрашивает у картинки, — чипами под кадром и только там, где спрашивает. */
function RoleRow({
  roles,
  value,
  onPick,
  disabled,
}: {
  roles: readonly PlaygroundRole[];
  value: PlaygroundRole;
  onPick: (role: PlaygroundRole) => void;
  disabled?: boolean;
}): JSX.Element | null {
  if (!roles.length) return null;
  return (
    <div className='flex flex-wrap items-center gap-1'>
      {roles.map((role) => (
        <Chip
          key={role}
          selected={value === role}
          pressed={value === role}
          disabled={disabled}
          title={`say that this picture is the ${role}`}
          onClick={() => onPick(value === role ? '' : role)}
        >
          {role}
        </Chip>
      ))}
    </div>
  );
}

export function PicturesGroup({
  band,
  techCardId,
  draft,
  preset,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  draft: PlaygroundDraft;
  /** The chosen preset, or null — it decides which roles the cells ask for. */
  preset: Preset | null;
  disabled?: boolean;
}): JSX.Element {
  const items = draft.state.items;
  const count = items.length;
  const room = PLAYGROUND_ITEMS_MAX - count;

  const [pickerOpen, setPickerOpen] = useState(false);
  /** Which picture is being marked, by media id. `0` — nobody, the strip stands alone. */
  const [marking, setMarking] = useState(0);
  /** What the last gesture did when it did less than it was asked for. */
  const [dropped, setDropped] = useState(0);

  /**
   * ⚠ ALL THREE DIE WITH THE CARD (invariant 12, the draft's own rule in `./drafts`). An open
   * picker listing A's pictures over B's screen is the same lie one layer up; a mark panel open on
   * a picture that is no longer on the table is worse — it writes areas into nothing. In the body
   * of the render, never in an effect.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (pickerOpen) setPickerOpen(false);
    if (marking) setMarking(0);
    if (dropped) setDropped(0);
  }

  /** The picture being marked, resolved from the LIST — it may have been taken off since. */
  const markingIndex = items.findIndex((i) => (i.media.id ?? 0) === marking);
  if (marking && markingIndex < 0) setMarking(0);

  const take = (media: common_MediaFull[], role: PlaygroundRole = '') => {
    const landed = draft.add(media, role);
    setDropped(media.length - landed);
  };

  const refs = refsCount(draft.state);
  const taken = new Set(itemMediaIds(items));

  return (
    <div id='design-playground-pictures-in' data-pg-items={count}>
      <GroupLabel
        flush
        className={GROUP_GAP}
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Counter n={count} noun='picture' total={PLAYGROUND_ITEMS_MAX} />
            {!disabled && count > 0 && (
              <Button
                variant='secondary'
                size='xs'
                onClick={() => {
                  draft.clear();
                  setMarking(0);
                  setDropped(0);
                }}
              >
                clear the table
              </Button>
            )}
          </span>
        }
      >
        pictures
      </GroupLabel>

      <Strip>
        {items.map((item, index) => {
          const id = item.media.id ?? 0;
          const areas = item.regions.length;
          const open = marking === id;
          return (
            <div key={id} className={cn('flex flex-col gap-1', CELL_WIDTH)} data-pg-item={id}>
              <PictureTile
                url={mediaThumb(item.media)}
                alt={`image ${index + 1}`}
                aspect={STRIP_FRAME_ASPECT}
                fit='contain'
                selected={open}
                /* THE NUMBER IS THE NAME. «image 1» is items[0] on screen, in the ask chips, in
                   the inventory and in the prompt the server builds — one word for one fact. */
                badge={`image ${index + 1}`}
                gallery={mediaFullToViewerItem(item.media)}
                onRemove={
                  disabled
                    ? undefined
                    : {
                        onClick: () => {
                          draft.remove(id);
                          if (marking === id) setMarking(0);
                          setDropped(0);
                        },
                        ariaLabel: `take image ${index + 1} off the table`,
                        title: 'take this picture off the table',
                      }
                }
                className='w-full bg-bgColor'
              >
                {/* ═══ THE MARK CORNER — THROUGH `children`, NOT A SIXTH ROLE OF THE PRIMITIVE ══
                    `PictureTile` already owns five corner roles (zoom, ✕, split, crop, select,
                    edit) and every one of them is a verb the WHOLE studio speaks. «mark» is this
                    screen's alone, so it is drawn by this screen — in the one cluster the tile
                    leaves free (bottom left, where split/crop stand when a screen has them), with
                    the primitive's own corner skin so it is not a second visual language. */}
                {!disabled && (
                  <div className='absolute bottom-1 left-1 z-20 flex items-end gap-1'>
                    <button
                      type='button'
                      data-pg-mark-door={id}
                      aria-label={
                        areas
                          ? `edit the ${areas} marked area${areas === 1 ? '' : 's'} of image ${index + 1}`
                          : `mark an area on image ${index + 1}`
                      }
                      aria-pressed={open}
                      title={
                        areas
                          ? 'the areas of this picture — a crop and an outline travel for each one'
                          : 'mark an area — the model is shown a crop of it and told your words. it is not a mask'
                      }
                      onClick={() => setMarking(open ? 0 : id)}
                      className={cn(
                        'py-0.5 leading-none',
                        TILE_CORNER,
                        /* A picture that CARRIES areas says so ALWAYS: the letters are the only
                           place «A · B» is written, and a hover-only label would hide the run's
                           own composition from the person about to buy it. An unmarked picture's
                           door stays quiet, like every other corner. */
                        areas ? 'opacity-100' : TILE_QUIET,
                        open && 'text-textColor',
                      )}
                    >
                      {areas
                        ? item.regions.map((_, i) => areaLetter(i)).join(' · ')
                        : 'mark ▸'}
                    </button>
                  </div>
                )}
              </PictureTile>

              <RoleRow
                roles={preset?.roles ?? []}
                value={item.role}
                disabled={disabled}
                onPick={(role) => draft.setRole(id, role)}
              />
            </div>
          );
        })}

        {!disabled && room > 0 && (
          <div className={cn('flex flex-col gap-1', CELL_WIDTH)}>
            {/* ═══ ONE PLACEHOLDER, TWO HALVES — the owner's own correction (file header) ══════ */}
            <div
              data-pg-placeholder=''
              className='flex w-full min-w-0 flex-col overflow-hidden border border-dashed border-borderColor'
            >
              {/* Деление коробки НАДВОЕ — ГЕОМЕТРИЕЙ, А НЕ ВЕРОЙ, теми же двумя строками, что у
                  общей плитки (`core/two-half-slot.tsx`, разбор целиком там): у элемента грида
                  `min-height: auto`, и собственные пропорции кнопки слота распирают строку, пока
                  минимум не обнулён. */}
              <div
                style={{
                  ...PLACEHOLDER_SURFACE,
                  aspectRatio: STRIP_FRAME_ASPECT,
                  minHeight: 0,
                  display: 'grid',
                  gridTemplateRows: '1fr 1fr',
                }}
              >
                <div
                  data-pg-half='library'
                  style={{ minHeight: 0, overflow: 'hidden' }}
                  className='min-w-0'
                >
                  <MediaSlot
                    aspectRatio={['Custom']}
                    frameAspect='auto'
                    label='+ picture'
                    hint={null}
                    purpose={PURPOSE}
                    showVideos={false}
                    editMode
                    allowMultiple
                    limit={room}
                    onSelect={(media: common_MediaFull[]) => take(media.filter((m) => m.id))}
                    sizeClassName='h-full w-full'
                    className='border-0'
                  />
                </div>
                <button
                  type='button'
                  data-pg-half='card'
                  aria-label='take a picture this card already has'
                  title='the pictures of this card — the bench, every run’s outputs, the uploads, and the crops and edits under their parents'
                  onClick={() => setPickerOpen(true)}
                  style={{ minHeight: 0 }}
                  className={cn(HALF_FACE, 'border-t border-dashed border-borderColor')}
                >
                  <CardStackGlyph />
                  <span className='leading-tight'>from this card ▸</span>
                </button>
              </div>
            </div>
            <Text size='nano' variant='label' component='span' className='normal-case'>
              library · ⌘V · drop
            </Text>
          </div>
        )}
      </Strip>

      {/* ─── the refusals and the honest counts, in words under the strip ───────────────────── */}
      {disabled && <Reason className='mt-2'>this card is read-only for you</Reason>}
      {!disabled && room <= 0 && (
        <Reason className='mt-2'>
          the table is full · {PLAYGROUND_ITEMS_MAX} pictures is the most one run takes
        </Reason>
      )}
      {dropped > 0 && (
        <Reason className='mt-2'>
          {dropped} of them did not go in · already on the table, or over the{' '}
          {PLAYGROUND_ITEMS_MAX} the run takes
        </Reason>
      )}
      {refs > REFS_MAX && (
        <div data-pg-overflow={refs} className='mt-2'>
          <Reason>
            {refs} pictures would travel — each one, each area as a crop, and one marked copy per
            picture with areas — and the model takes {REFS_MAX}
          </Reason>
        </div>
      )}

      {/* ─── marking, over the strip and never beside it ────────────────────────────────────── */}
      {markingIndex >= 0 && (
        <MarkMode
          item={items[markingIndex]}
          index={markingIndex}
          draft={draft}
          disabled={disabled}
          onClose={() => setMarking(0)}
        />
      )}

      {/* ─── the second half's room: the pictures this card already has ─────────────────────── */}
      <CardPicturePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        band={band}
        taken={taken}
        room={room}
        onPick={(media) => take(media)}
      />
    </div>
  );
}
