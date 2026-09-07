import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import type { Representation } from '../bench-kinds';
import { colorwayLabel } from '../colorway-picker';
import { cutPiecesWord } from '../generation/composite';
import { PictureTile } from '../picture-tile';
import { mediaThumb } from '../render/model';
import { CELL_WIDTH, STRIP_FRAME_ASPECT } from '../render/strip-cell';
import {
  cardPictureGroups,
  countTiles,
  orphanNote,
  techCardIdOfBand,
  tilesOfGroups,
  type CardPictureTile,
} from './card-pictures-model';
import { stepOfKind } from './chain';
import { Counter, EmptyState, GROUP_GAP, GROUP_SEAM } from './organs';
import { Reason } from './reason';

/**
 * ═══ THE PICTURES OF THIS CARD — THE SECOND HALF OF «+ PICTURE» (TASKS-r4 п.2) ═════════════════
 *
 * Owner: the door splits in two. The first half is the LIBRARY and it is already a production
 * organ — the `MediaSlot` tail of a strip, with browse, ⌘V and drop inside the primitive. This is
 * the other half: «выбирают из уже размеченных нами медиа (плиты верстака) или из истории
 * генерации (+ сплиты + эдиты, СГРУППИРОВАННЫЕ)».
 *
 * ⚠ IT IS NOT `TwoStepPicker`, AND THAT WAS A DECISION. That organ is a 132px text popover —
 * branch, then leaf — and it is right where the leaves are WORDS. Here the leaves are pictures: a
 * person recognises the sheet they cut yesterday by looking at it, not by reading «run 12 · b». So
 * the shape is the one the on-model chooser already uses (`onmodel/shot-group.tsx`): the app's one
 * modal shell, groups with a `GroupLabel`, tiles picked by looking, and the modal STAYS OPEN while
 * several are taken — taking four crops of one sheet is the ordinary gesture, and a modal that shut
 * on the first would make it four round trips.
 *
 * ═══ WHAT THIS COMPONENT DECIDES, AND WHAT IT REFUSES TO DECIDE ═══════════════════════════════
 *
 * It decides NOTHING about the pictures. Which exist, which are hidden, which is a piece of which,
 * which may not be an input — all of that is `card-pictures-model.ts`, pure and probed. This file
 * owns exactly three things: the pending selection, the room left in it, and the words.
 *
 * ⚠ THE SELECTION IS PENDING, NOT LIVE, AND THE CONTRACT IS WHY. The caller hands in `taken` (the
 * media its list already holds) and gets back `onPick`; there is no «un-take» in either direction,
 * because taking something OUT of the caller's list belongs to that list's own ✕. So a click here
 * must be reversible HERE, which makes it a toggle over a pending set, committed by `done`. A
 * live-committing tile would give a person no way back at all except closing the modal, walking to
 * the strip and undoing it there.
 *
 * ⚠ AND THE ONE BUTTON IS THE POINT (owner: «не усложнять дизайн, меньше кнопок»). The shell's own
 * footer is all-or-nothing — cancel AND confirm — and `cancel` here would be the third organ that
 * closes without taking anything, beside the ✕ and Escape. So the footer is drawn by this file:
 * the count on the left, `done` on the right, ruled and stuck to the bottom of the body exactly
 * where the shell's own footer stands. Nothing else about the shell is re-spelled.
 */

export type CardPicturePickerProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  band: GetDesignBandResponse;
  /** media ids already taken — drawn selected+inert */
  taken: ReadonlySet<number>;
  /** how many more may be taken; 0 → every tile inert with the reason */
  room: number;
  /** grouping mode: which representations to offer (default all) */
  reps?: readonly Representation[];
  onPick(media: common_MediaFull[]): void;
  title?: string;
};

const CHILD_WIDTH = 'w-[104px] shrink-0';

/**
 * TWO LENGTHS OF THE SAME REFUSAL, AND THAT IS MEASURED RATHER THAN TIDY. A tile is 104–132px
 * wide: a sentence under it is either clipped to «this picture is al…» or three lines tall, and
 * both read worse than nothing. So the SENTENCE stands once over the list, where there is width
 * for it, and the tile carries the two or three words that name the same state.
 */
const NO_ROOM = 'no room for another picture · take one out of the list first';
const NO_ROOM_TILE = 'no room left';
const FULL_PICK = 'that is all the room there is · press done, or drop one';
const FULL_PICK_TILE = 'no room left';
const ALREADY_TILE = 'already in the list';

/**
 * The name of an indented row: `3 cut pieces` / `1 edit`.
 *
 * ⚠ NOT «split from ▸». The `▸` is the studio's mark of a DOOR — `edit ▸`, `from this card ▸` —
 * and putting it on a caption promises a click that is not there. The noun is the history's own
 * (`cutPiecesWord`), so the deck under a sheet in GENERATION HISTORY and the row beside it here
 * are called the same thing.
 */
function verbWord(verb: CardPictureTile['childVerb'], n: number): string {
  return verb === 'flatten' ? `${n} edit${n === 1 ? '' : 's'}` : cutPiecesWord(n);
}

/**
 * Every descendant of a root, bucketed by the verb that made it.
 *
 * FLAT, NOT THREE DEEP, and the history's decks make the same call for the same reason: beta
 * already holds a chain (54 cut out of 52 cut out of the sheet 22), and a modal that indented it
 * three times would spend a third of its width on hierarchy nobody is choosing by. The family
 * stands next to the picture it came out of; the verb says what happened.
 */
function familyOf(
  tile: CardPictureTile,
): { verb: CardPictureTile['childVerb']; list: CardPictureTile[] }[] {
  const crops: CardPictureTile[] = [];
  const edits: CardPictureTile[] = [];
  const walk = (list: readonly CardPictureTile[]) => {
    for (const child of list) {
      (child.childVerb === 'flatten' ? edits : crops).push(child);
      walk(child.children);
    }
  };
  walk(tile.children);
  return [
    { verb: 'crop' as const, list: crops },
    { verb: 'flatten' as const, list: edits },
  ].filter((row) => row.list.length > 0);
}

/**
 * ONE PICTURE, PICKED BY LOOKING.
 *
 * A TOP-LEVEL COMPONENT, not a closure inside the picker, and that is not style. A component
 * declared inside a render is a NEW type on every render: React unmounts the whole subtree and
 * mounts a fresh one, so every toggle would drop the focus ring of the corner that was just
 * pressed and re-register the frame with the viewer.
 *
 * The surface is the mouse gesture and the corner is the announced organ — the primitive's own law
 * for zoom, applied here to the pick. Both call the same toggle; a dead tile declares neither, so
 * there is nothing to press and nothing for a screen reader to offer.
 */
function PickCell({
  tile,
  width,
  on,
  already,
  why,
  onToggle,
}: {
  tile: CardPictureTile;
  width: string;
  on: boolean;
  /** It is in the caller's list already: selected, but not a pick of THIS session. */
  already: boolean;
  /** Why it cannot be pressed; `''` = it can. */
  why: string;
  onToggle: () => void;
}): JSX.Element {
  const mediaId = tile.media.id ?? 0;
  const dead = !!why;
  return (
    <div className={`flex flex-col gap-1 ${width}`} data-card-picture={mediaId}>
      <PictureTile
        url={mediaThumb(tile.media)}
        alt={`picture ${tile.letter} of this card`}
        aspect={STRIP_FRAME_ASPECT}
        fit='contain'
        badge={tile.badge}
        selected={on}
        dim={dead && !already}
        className='w-full bg-bgColor'
        onOpen={dead ? undefined : onToggle}
        onSelect={
          dead
            ? undefined
            : {
                onClick: onToggle,
                ariaLabel: on
                  ? `drop picture ${tile.letter} from the pick`
                  : `take picture ${tile.letter}`,
                title: on ? 'drop it from the pick' : 'take this picture',
              }
        }
        selectLabel={on ? 'drop' : 'take'}
      />
      <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
        media {mediaId}
        {tile.orphan ? ` · ${orphanNote()}` : ''}
      </Text>
      {/* THE REASON OF A DEAD TILE IS A VISIBLE LINE, never only a `title` — the studio's rule
          wherever an organ is offered and refused in the same breath. */}
      {why && (
        <Text size='nano' variant='label' component='span' className='block min-w-0'>
          {why}
        </Text>
      )}
    </div>
  );
}

export function CardPicturePicker({
  open,
  onOpenChange,
  band,
  taken,
  room,
  reps,
  onPick,
  title = 'pictures of this card',
}: CardPicturePickerProps): JSX.Element {
  /* The card's own names for its colourways — the ONE fact the band does not carry and the props
     do not either. Read through the shared query key, so the studio's own read of the card is
     reused rather than repeated. `colorwayLabel` is the studio's ladder (devName → colorCode →
     baseSku), never a storefront translation: on beta six languages out of seven are blank. */
  const cardId = useMemo(() => techCardIdOfBand(band), [band]);
  const { data: techCard } = useTechCard(cardId > 0 ? cardId : undefined);
  const colorwayName = useMemo(() => {
    const byId = new Map(
      (techCard?.colorways ?? []).map((ref) => [ref.colorwayId ?? 0, colorwayLabel(ref)] as const),
    );
    return (id: number) => byId.get(id) ?? '';
  }, [techCard?.colorways]);

  const groups = useMemo(
    () => cardPictureGroups(band, { reps, colorwayName }),
    [band, reps, colorwayName],
  );
  const mediaById = useMemo(() => {
    const map = new Map<number, common_MediaFull>();
    for (const tile of tilesOfGroups(groups)) {
      const id = tile.media.id ?? 0;
      if (id > 0 && !map.has(id)) map.set(id, tile.media);
    }
    return map;
  }, [groups]);

  /** The pending picks, in the order they were clicked — that is the order they travel in. */
  const [picked, setPicked] = useState<number[]>([]);

  /**
   * ⚠ BOTH RESETS LIVE IN THE BODY OF THE RENDER (invariant 12), and neither is optional. A
   * selection made on card A must not be handed to card B — the modal is mounted by a studio that
   * survives the switch — and a selection made in a session the person abandoned must not be
   * waiting for them the next time the door opens.
   */
  const shownCard = useRef(cardId);
  if (shownCard.current !== cardId) {
    shownCard.current = cardId;
    if (picked.length) setPicked([]);
  }
  const wasOpen = useRef(open);
  if (wasOpen.current !== open) {
    wasOpen.current = open;
    if (!open && picked.length) setPicked([]);
  }

  const left = Math.max(0, room - picked.length);
  const pickedSet = new Set(picked);

  const toggle = (mediaId: number) => {
    setPicked((was) =>
      was.includes(mediaId)
        ? was.filter((id) => id !== mediaId)
        : was.length < room
          ? [...was, mediaId]
          : was,
    );
  };

  const commit = () => {
    const media = picked.map((id) => mediaById.get(id)).filter(Boolean) as common_MediaFull[];
    if (media.length) onPick(media);
    setPicked([]);
    onOpenChange(false);
  };

  const narrowed = reps?.length ? reps.map((rep) => stepOfKind(rep).label).join(' · ') : '';
  const nothing = groups.length === 0;

  /**
   * Three refusals, one dead tile, and each one says its own words: the picture cannot be an input
   * at all, the caller's list is full, or THIS pick would be one over the room left.
   */
  const refusalOf = (tile: CardPictureTile, mediaId: number): string =>
    taken.has(mediaId)
      ? ALREADY_TILE
      : tile.refusal
        ? tile.refusal
        : room <= 0
          ? NO_ROOM_TILE
          : left <= 0 && !pickedSet.has(mediaId)
            ? FULL_PICK_TILE
            : '';

  const cell = (tile: CardPictureTile, width: string) => {
    const mediaId = tile.media.id ?? 0;
    const already = taken.has(mediaId);
    return (
      <PickCell
        key={tile.picture.id ?? 0}
        tile={tile}
        width={width}
        on={already || pickedSet.has(mediaId)}
        already={already}
        why={refusalOf(tile, mediaId)}
        onToggle={() => toggle(mediaId)}
      />
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={commit}
      hideActions
      width='lg'
      title={title}
    >
      <div data-card-picker='' data-card-picker-picked={picked.length}>
        {(narrowed || room <= 0 || (left <= 0 && picked.length > 0)) && (
          <div className='mb-3 flex flex-wrap items-center gap-2'>
            {narrowed && (
              <Text size='micro' variant='label' component='span'>
                showing {narrowed} only
              </Text>
            )}
            {room <= 0 ? (
              <Reason>{NO_ROOM}</Reason>
            ) : (
              left <= 0 && picked.length > 0 && <Reason>{FULL_PICK}</Reason>
            )}
          </div>
        )}

        {nothing ? (
          <EmptyState>
            {narrowed
              ? `nothing of ${narrowed} on this card yet · generate one, or bring a picture from the library`
              : 'no pictures on this card yet · generate one, or bring a picture from the library'}
          </EmptyState>
        ) : (
          /* `isolate` IS THE HALF OF THE FOOTER FIX THAT IS NOT A NUMBER, and it belongs here
             rather than there. A tile's badge and corners are `absolute … z-20` INSIDE the tile,
             and the tile is `relative` with no z of its own — which is not a stacking context, so
             those 20s are not local at all: they climb to the modal's own layer and print over
             anything below 20 that comes after them, the footer included. Raising the footer to 21
             would answer this badge; `isolation: isolate` answers every future one, by making the
             list a layer whose insides cannot leave it. */
          <div className={`isolate ${GROUP_SEAM}`}>
            {groups.map((group) => (
              <div key={group.key} data-card-picker-group={group.key}>
                <GroupLabel
                  flush
                  className={GROUP_GAP}
                  action={<Counter n={countTiles(group.tiles)} noun='picture' />}
                >
                  {group.label}
                </GroupLabel>
                {/* A wrapping row of FAMILIES, not a grid of pictures: a sheet and its cut pieces
                    are one object on this screen, and a grid track would break them apart the
                    moment the modal narrows. */}
                <div className='flex flex-wrap items-start gap-2.5'>
                  {group.tiles.map((tile) => {
                    const family = familyOf(tile);
                    return (
                      <div
                        key={tile.picture.id ?? 0}
                        className='flex items-start gap-1.5'
                        data-card-picture-family={tile.picture.id ?? 0}
                      >
                        {cell(tile, CELL_WIDTH)}
                        {family.length > 0 && (
                          <div className='flex flex-col gap-2 border-l border-hairline pl-2'>
                            {family.map((row) => (
                              <div key={row.verb} data-card-picture-verb={row.verb}>
                                <Text
                                  size='nano'
                                  variant='label'
                                  component='span'
                                  className='mb-1 block'
                                >
                                  {verbWord(row.verb, row.list.length)}
                                </Text>
                                <div className='flex flex-wrap gap-1.5'>
                                  {row.list.map((child) => cell(child, CHILD_WIDTH))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* THE FOOTER OF THE SHELL, DRAWN HERE BECAUSE THE SHELL CANNOT DRAW ONE BUTTON. Same
            grammar as `ConfirmationModal`'s own: ruled top, full bleed, actions to the right. It
            is `sticky` to the bottom of the SCROLLING body, so a card with forty pictures keeps
            `done` on screen; `-bottom-2.5` cancels the body's own padding so nothing scrolls in a
            sliver underneath it.

            ⚠ THE BAR HAD NO LAYER, AND THE COST WAS THE COUNT. `sticky` with `z-index: auto`
            sits at 0, so every `z-20` tile badge scrolling past beneath it printed THROUGH: 286
            pixels of the footer strip changed depending on what stood behind, the first of them
            black on white right across «0 of 2 pictures». A count a person cannot read is worse
            than no count, because they read the wrong one.

            ⚠ WHAT ACTUALLY FIXES IT IS `isolate` ON THE LIST ABOVE, measured — dropping this
            token alone leaves the strip pixel-identical. `z-[var(--z-sticky)]` is here because it
            is the app's own layer for a bar pinned over scrolling content (the media selection
            bar, the files selection bar, the catalog batch bar all stand on it), and a pinned bar
            that names no layer is the state this defect came out of. */}
        <div
          data-card-picker-foot=''
          className='sticky -bottom-2.5 z-[var(--z-sticky)] -mx-2.5 -mb-2.5 mt-5 flex items-center gap-2 border-t border-borderColor bg-bgColor px-2.5 py-1.5'
        >
          <Counter n={picked.length} noun='picture' total={Math.max(room, 0)} />
          <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
            {picked.length > 0
              ? 'done puts them where the door was opened from'
              : 'click a picture to take it'}
          </Text>
          <Button
            type='button'
            variant='main'
            size='sm'
            className='ml-auto'
            disabled={picked.length === 0}
            onClick={commit}
          >
            done
          </Button>
        </div>
      </div>
    </ConfirmationModal>
  );
}
