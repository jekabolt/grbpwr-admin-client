import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

import { Counter, GROUP_GAP, Reason } from '../core';
import { PictureTile } from '../picture-tile';
import { mediaThumb } from '../render/model';
import { CELL_WIDTH, STRIP_FRAME_ASPECT, Strip } from '../render/strip-cell';
import type { ShotDraft } from './drafts';
import {
  RECOLOR_SOURCES_MAX,
  fittingShots,
  fittingsWithShots,
  shotName,
  type FittingShot,
  type OnModelShot,
} from './model';

/**
 * ═══ THE SHOTS THIS RUN REPAINTS — A STRIP, UP TO 24, TWO DOORS INTO IT (r3 п.42) ═════════════
 *
 * ⚠ THIS WAS A SINGLE SLOT LAST ROUND, AND THE OWNER TOOK THE ARGUMENT APART BY NAME: «до 24
 * снимков за прогон · вернуть ленту снимков». The slot's own header claimed one shot was «a
 * grammar, not a cap»; the wire field it filled (`extra_input_media_ids`) has always been a list,
 * and the server has always taken up to `RECOLOR_SOURCES_MAX` of them in one go. A person with
 * four sides of one garment was paying four visits to this screen for what one visit buys.
 *
 * THE STRIP IS THE ONE THE OTHER GENERATIVE STEPS DRAW — the shared `Strip` / cell width /
 * 132×148 frame of `render/strip-cell.tsx`, so the render's flats, the 3D's renders and these
 * photographs are read on one baseline. What differs is said out loud and is only this: these
 * cells stand for MEDIA, not for pictures of the card (the reason is in `./drafts.ts`), so a cell
 * carries a number and a provenance and nothing else.
 *
 * ONE DOOR PER SOURCE, AND THE STRIP'S OWN TAIL IS ONE OF THEM. The trailing cell IS the library
 * door — the product's `MediaSlot`: click to browse, ⌘V, drop a file, several at a time. A second
 * «+ from the media library» chip beside it (which this group carried while the slot was one)
 * would be two buttons for one thing, which is exactly what the owner asked us to stop doing. The
 * fittings are a source the strip cannot open by itself, so THEY keep a chip.
 *
 * ⚠ AND THE CHOOSER IS OPENED FROM HERE ALONE, WHICH IS WHY ITS STATE CAME BACK HOME. The composer
 * held it while the lock bar had a door of its own into the library (r3, Fable №5); that door is
 * now a jump to this group, so a second opener no longer exists and neither does the prop that
 * carried it. `onFittingsKnown` went with it — it existed only to tell the bar WHICH library door
 * to draw.
 *
 * FROM THE FITTINGS — THE CARD'S OWN TRY-ONS. `ListFittings` filtered by this card
 * (`useTechCardFittings`, the same read the sample panels make) hands back each fitting with its
 * resolved media; the chip counts the fittings that carry a photograph and opens a chooser of
 * those photographs, grouped by fitting. A fitting's date and sample size are printed and KEPT ON
 * THE CARD — never on the wire. The chooser stays open while several are taken: picking four
 * photographs of one fitting is the ordinary gesture, and a modal that shut on the first would
 * make it four round trips.
 *
 * ⚠ NOTHING ASKS A QUESTION HERE ANY MORE. Adding to a list destroys nothing, so the replacement
 * modal («change the photograph · replaces the fitting photo taken on 12 Aug») has no subject
 * left; a wrong photograph is taken off by the ✕ on its own cell.
 */

const PURPOSE = 'design · the photographs this run repaints';

export function libraryShot(media: common_MediaFull): OnModelShot {
  return { media, source: 'library', fittingId: 0, stamp: '', size: '' };
}

export function fittingShot(row: FittingShot): OnModelShot {
  return {
    media: row.media,
    source: 'fitting',
    fittingId: row.fittingId,
    stamp: row.stamp,
    size: row.size,
  };
}

/** The frame of a picked-by-looking tile: a square, the picture covering it. */
function ShotFace({ src, alt }: { src: string; alt: string }): JSX.Element {
  return (
    <span className='relative block aspect-square w-full overflow-hidden bg-bgColor'>
      {src ? (
        <img src={src} alt={alt} className='h-full w-full object-cover' />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center'>
          <Text size='nano' variant='label' component='span'>
            no image
          </Text>
        </span>
      )}
    </span>
  );
}

export function ShotGroup({
  techCardId,
  draft,
  disabled,
}: {
  techCardId: number;
  draft: ShotDraft;
  disabled?: boolean;
}): JSX.Element {
  const shots = draft.shots;
  const count = shots.length;
  const room = RECOLOR_SOURCES_MAX - count;
  const { dictionary } = useDictionary();
  const sizes = dictionary?.sizes ?? [];
  const fittings = useTechCardFittings(techCardId);
  const rows = useMemo(
    () =>
      // A size the dictionary cannot name is still a size: `size 3` beats a blank pill.
      fittingShots(
        fittings.data,
        (id) => (sizes.find((s) => s.id === id)?.name ?? '').trim() || (id > 0 ? `size ${id}` : ''),
      ),
    [fittings.data, sizes],
  );
  const fittingCount = fittingsWithShots(rows);

  /** The chooser of the fittings — this group is its only door, so this group holds it open. */
  const [chooserOpen, setChooserOpen] = useState(false);

  /**
   * WHAT THE LAST GESTURE ACTUALLY DID, when it did less than it was asked for. A ⌘V of ten files
   * onto a strip with room for three takes three; a snackbar for that would name a loss on top of
   * the screen that already shows it, and silence would let a person believe ten went in.
   */
  const [dropped, setDropped] = useState(0);

  /**
   * ⚠ AND BOTH DIE WITH THE CARD (invariant 12, the drafts' own rule in `./drafts`). The strip
   * empties itself when `techCardId` changes; a «4 of them did not go in» left standing over the
   * empty strip of the next card would be a complaint about a gesture made on another garment, and
   * an open chooser would list the fittings of that one. In the body of the render, as everywhere.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (dropped) setDropped(0);
    if (chooserOpen) setChooserOpen(false);
  }

  const take = (next: OnModelShot[]) => {
    const landed = draft.add(next);
    setDropped(next.length - landed);
  };

  const taken = new Set(shots.map((s) => s.media.id ?? 0));

  const fittingsDead = disabled || fittings.isLoading || fittingCount === 0 || room <= 0;
  const fittingsWhy = disabled
    ? 'this card is read-only for you'
    : fittings.isLoading
      ? 'reading the fittings of this item…'
      : fittings.isError
        ? 'the fittings of this item could not be read · upload a photo instead'
        : fittingCount === 0
          ? 'no fittings recorded for this item · upload a photo instead'
          : room <= 0
            ? `the strip is full · ${RECOLOR_SOURCES_MAX} photographs is the most one run takes`
            : '';

  /** The chooser, grouped by fitting in the order the server gave them (newest first). */
  const groups = useMemo(() => {
    const order: number[] = [];
    const by = new Map<number, FittingShot[]>();
    for (const s of rows) {
      const list = by.get(s.fittingId);
      if (list) list.push(s);
      else {
        by.set(s.fittingId, [s]);
        order.push(s.fittingId);
      }
    }
    return order.map((id) => by.get(id)!);
  }, [rows]);

  return (
    <div id='design-onmodel-shots' data-om-shots={count}>
      <GroupLabel
        flush
        className={GROUP_GAP}
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Counter n={count} noun='shot' total={RECOLOR_SOURCES_MAX} />
            {/* THE PRICE IS A TARIFF, NOT A SUM: «one call per photograph», never a number of
                dollars multiplied out of `shots.length` (pool item, r3). */}
            <Pill tone='mut'>one call per photograph</Pill>
            {!disabled && count > 0 && (
              <Button variant='secondary' size='xs' onClick={draft.clear}>
                remove all {count}
              </Button>
            )}
          </span>
        }
      >
        the shots this run repaints
      </GroupLabel>

      <Strip>
        {shots.map((shot, index) => {
          const id = shot.media.id ?? 0;
          return (
            <div key={id} className={`flex flex-col gap-1 ${CELL_WIDTH}`} data-om-shot={id}>
              <PictureTile
                url={mediaThumb(shot.media)}
                alt={`photograph ${index + 1}`}
                aspect={STRIP_FRAME_ASPECT}
                fit='contain'
                selected
                /* A NUMBER, NOT A VIEW. Nothing declares which side this photograph shows — not
                   the file, not the server — and the results come back one per shot, read in
                   this same order. */
                badge={String(index + 1)}
                gallery={mediaFullToViewerItem(shot.media)}
                onRemove={
                  disabled
                    ? undefined
                    : {
                        onClick: () => {
                          draft.remove(id);
                          setDropped(0);
                        },
                        ariaLabel: `take photograph ${index + 1} out of the strip`,
                        title: `take ${shotName(shot)} out`,
                      }
                }
                className='w-full bg-bgColor'
              />
              {/* TWO LINES, TWO DIFFERENT FACTS. The name says where the photograph came from
                  («fitting on 12 Aug» / «picture 4012»); the second line says WHICH MEDIA it is,
                  because the cells stand for media and the media number is the one thing a person
                  can carry to another screen. Printing the origin twice — which this cell did on
                  its first draft, «fitting on 12 Aug» over «from fitting 12 Aug» — is a line that
                  answers a question already answered. */}
              <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                {shotName(shot)}
              </Text>
              <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                media {id}
              </Text>
            </div>
          );
        })}

        {!disabled && room > 0 && (
          <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
            {/* THE TAIL OF THE STRIP IS THE LIBRARY DOOR — the product's own slot, with ⌘V, drop
                and browse living inside the primitive. `PlaceOrDrawCell` was the other candidate
                and is refused on purpose: its lower half opens the drawing editor, and a drawn
                plate is not a photograph of a garment on a person. */}
            <MediaSlot
              aspectRatio={['Custom']}
              frameAspect={STRIP_FRAME_ASPECT}
              label='+ photo'
              hint={null}
              purpose={PURPOSE}
              showVideos={false}
              editMode
              allowMultiple
              limit={room}
              onSelect={(media) => take(media.filter((m) => m.id).map(libraryShot))}
            />
            <Text size='nano' variant='label' component='span'>
              from the library
            </Text>
          </div>
        )}
      </Strip>

      <div className='mt-2 flex flex-wrap items-center gap-1.5'>
        <Chip
          dashed
          disabled={fittingsDead}
          title={fittingsWhy || 'take photographs from the fittings of this item'}
          aria-label='take photographs from the fittings of this item'
          data-om-door='fittings'
          onClick={() => setChooserOpen(true)}
        >
          + from the fittings{' '}
          <span className='tabular-nums opacity-65'>{fittings.isLoading ? '…' : fittingCount}</span>
        </Chip>
      </div>

      {/* THE REASON OF A DEAD CHIP IS A VISIBLE LINE, never only a `title`. */}
      {!disabled && !fittings.isLoading && fittingCount === 0 && (
        <CalloutBox tone='note' className='mt-2'>
          <Text size='micro' component='p' className='normal-case'>
            {fittingsWhy}
          </Text>
        </CalloutBox>
      )}
      {disabled && <Reason className='mt-2'>this card is read-only for you</Reason>}
      {!disabled && room <= 0 && (
        <Reason className='mt-2'>
          the strip is full · {RECOLOR_SOURCES_MAX} photographs is the most one run takes
        </Reason>
      )}
      {dropped > 0 && (
        <Reason className='mt-2'>
          {dropped} of them did not go in · already in the strip, or over the {RECOLOR_SOURCES_MAX}
          {' '}the run takes
        </Reason>
      )}
      {/* ONE QUIET LINE, NOT TWO. What does not travel (the fitting's date and size) and what
          these cells ARE (media, not pictures of the card) are one sentence about the same list;
          two grey rows under the strip read as two warnings. */}
      {count > 0 && (
        <div className='mt-2 flex flex-wrap items-center gap-1.5'>
          <Pill tone='mut'>not sent</Pill>
          <Text size='nano' variant='label' component='span' className='normal-case'>
            these are media, not pictures of this card
            {shots.some((s) => s.source === 'fitting')
              ? ' · the fitting date and the sample size stay on the card'
              : ''}
          </Text>
        </div>
      )}

      {/* THE CHOOSER — the photographs of this card's fittings, one group per fitting. */}
      <ConfirmationModal
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        onConfirm={() => setChooserOpen(false)}
        hideActions
        width='lg'
        title='the photographs · from the fittings'
        footerHint='the fitting date and the sample size stay on the card — only the photograph goes to the model'
      >
        <div className='space-y-stack'>
          {groups.length === 0 && (
            <Text size='micro' variant='label' component='p' className='normal-case'>
              {fittingsWhy || 'no photographs on the fittings of this item'}
            </Text>
          )}
          {groups.map((list) => {
            const head = list[0];
            return (
              <div key={head.fittingId} data-om-fitting={head.fittingId}>
                <GroupLabel
                  flush
                  className={GROUP_GAP}
                  action={
                    <span className='flex flex-wrap items-center gap-1.5'>
                      {head.size && <Pill tone='mut'>sample {head.size}</Pill>}
                      <Pill tone='mut'>
                        {list.length} photograph{list.length === 1 ? '' : 's'}
                      </Pill>
                    </span>
                  }
                >
                  {head.round > 0 ? `fitting ${head.round}` : `fitting ${head.fittingId}`}
                  {head.stamp ? ` · ${head.stamp}` : ''}
                </GroupLabel>
                <Tiles min={148}>
                  {list.map((row, i) => {
                    const id = row.media.id ?? 0;
                    const on = taken.has(id);
                    return (
                      <Tile
                        key={id}
                        selected={on}
                        pressed={on}
                        title={on ? 'this photograph is in the strip · take it out' : 'add this photograph to the strip'}
                        onClick={() => {
                          if (on) {
                            draft.remove(id);
                            setDropped(0);
                            return;
                          }
                          take([fittingShot(row)]);
                        }}
                        media={<ShotFace src={mediaThumb(row.media)} alt={`photograph ${i + 1}`} />}
                        name={`photograph ${i + 1}`}
                        sub={on ? 'in the strip' : `media ${id}`}
                      />
                    );
                  })}
                </Tiles>
              </div>
            );
          })}
        </div>
      </ConfirmationModal>
    </div>
  );
}
